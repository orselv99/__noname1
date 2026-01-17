// This runs in a Web Worker to avoid blocking the main thread

import { pipeline as pipelineFn, env as envConfig } from '@huggingface/transformers';

let pipeline: typeof pipelineFn | null = null;
let env: typeof envConfig | null = null;

// Initialize transformers with custom fetch proxy
async function loadTransformers() {
  try {
    // Use npm package directly (Vite handles worker bundling)
    pipeline = pipelineFn;
    env = envConfig;

    // Custom fetch to proxy model requests to main thread
    const PROXY_PREFIX = 'http://local-proxy-model/';
    const pendingFetches = new Map<number, { resolve: (res: Response) => void, reject: (err: any) => void }>();
    let fetchIdCounter = 0;

    // Override GLOBAL fetch to ensure we catch everything
    const originalFetch = self.fetch;
    self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (url.startsWith(PROXY_PREFIX)) {
        let relativePath = url.replace(PROXY_PREFIX, '');
        // IMPORTANT: Decode URL
        relativePath = decodeURIComponent(relativePath);
        // Fix mismatch: 'onnx/model_quantized.onnx' -> 'model_quantized.onnx'
        relativePath = relativePath.replace('/onnx/', '/');

        // FIX: transformers.js may request "onnx/model_quantized.onnx" but we saved it as "model_quantized.onnx"
        // We flatten the structure for simplicity in our storage.
        // If path contains "/onnx/", remove "onnx/" part.
        // e.g. "embedding/onnx/model_quantized.onnx" -> "embedding/model_quantized.onnx"
        relativePath = relativePath.replace('/onnx/', '/');


        const id = ++fetchIdCounter;
        return new Promise<Response>((resolve, reject) => {
          pendingFetches.set(id, { resolve, reject });
          self.postMessage({ type: 'fetch_file', id, path: relativePath });
        });
      }
      return originalFetch(input, init);
    };

    // Handle responses from main thread for file fetches
    self.addEventListener('message', (event) => {
      const { type, id, data, error, success } = event.data;
      if (type === 'fetch_result' && pendingFetches.has(id)) {
        const { resolve, reject } = pendingFetches.get(id)!;
        pendingFetches.delete(id);

        if (success) {
          const blob = new Blob([data]);
          const response = new Response(blob, { status: 200, statusText: 'OK' });
          resolve(response);
        } else {
          reject(new TypeError(`Failed to fetch local file: ${error}`));
        }
      }
    });

    // Configure for local execution (fetching from local server)
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = false; // CRITICAL: Disable internal caching to avoid 1.5B mismatch

    // Explicitly try to clear old cache to be safe
    try {
      if ('caches' in self) {
        await caches.delete('transformers-cache');
      }
    } catch (e) {
      console.warn('[AIWorker] Failed to clear cache:', e);
    }

    // We don't need to set cacheDir since we are fetching "remote" URLs that happen to be local
    // But we can try to disable caching if we want to ensure fresh fetch, though browser cache is fine.
    return true;
  } catch (error: any) {
    console.error('[AIWorker] Failed to load transformers:', error);
    self.postMessage({ type: 'error', error: `Failed to load transformers: ${error?.message || error}` });
    return false;
  }
}

// Model instances
let embeddingPipeline: any = null;
let generationPipeline: any = null;
let isLoadingEmbedding = false;
let isLoadingGeneration = false;

// Local paths for models (served via public folder)
const EMBEDDING_MODEL_ID = 'embedding';
const GENERATION_MODEL_ID = 'generation';

// ============================================================================
// EMBEDDING MODEL
// ============================================================================

async function initEmbeddingModel() {
  if (embeddingPipeline) return embeddingPipeline;
  if (isLoadingEmbedding) {
    while (isLoadingEmbedding) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return embeddingPipeline;
  }

  isLoadingEmbedding = true;

  try {
    if (!pipeline) {
      const success = await loadTransformers();
      if (!success) throw new Error('Transformers not loaded');
    }

    self.postMessage({ type: 'status', status: 'loading_embedding', message: 'Loading embedding model...' });

    // Configure transformers to use our custom protocol
    env!.allowLocalModels = false;
    env!.allowRemoteModels = true;
    // We use a fake HTTP host which is intercepted by our fetch override
    env!.remoteHost = 'http://local-proxy-model/';
    env!.remotePathTemplate = '{model}/';

    embeddingPipeline = await pipeline!(
      'feature-extraction',
      EMBEDDING_MODEL_ID,
      {
        dtype: 'q8',
        device: 'webgpu', // Switch to WebGPU as requested
        progress_callback: (progress: any) => {
          if (progress.progress !== undefined) {
            self.postMessage({
              type: 'progress',
              model: 'embedding',
              progress: progress.progress,
              status: progress.status || 'downloading'
            });
          }
        }
      }
    );

    self.postMessage({ type: 'status', status: 'model_ready', message: 'Embedding model ready' });
    return embeddingPipeline;
  } catch (error: any) {
    console.error('[AIWorker] Embedding model error:', error);
    self.postMessage({ type: 'error', error: error?.message || String(error) });
    throw error;
  } finally {
    isLoadingEmbedding = false;
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const model = await initEmbeddingModel();
  const prefixedText = `passage: ${text}`;
  self.postMessage({ type: 'status', status: 'embedding', message: 'Generating embedding...' });

  const output = await model(prefixedText, { pooling: 'mean', normalize: true });

  let embedding: number[];
  if (output.data) {
    embedding = Array.from(output.data as Float32Array);
  } else if (output.tolist) {
    embedding = output.tolist()[0];
  } else {
    embedding = Array.from(output);
  }

  self.postMessage({ type: 'status', status: 'complete', message: 'Embedding complete' });
  return embedding;
}

// ============================================================================
// GENERATION MODEL
// ============================================================================

async function initGenerationModel() {
  if (generationPipeline) return generationPipeline;
  if (isLoadingGeneration) {
    while (isLoadingGeneration) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return generationPipeline;
  }

  isLoadingGeneration = true;

  try {
    if (!pipeline) {
      const success = await loadTransformers();
      if (!success) throw new Error('Transformers not loaded');
    }

    self.postMessage({ type: 'status', status: 'loading_generation', message: 'Loading generation model...' });

    // Using Qwen2.5-0.5B-Instruct
    generationPipeline = await pipeline!(
      'text-generation',
      GENERATION_MODEL_ID,
      {
        dtype: 'q4f16', // q4f16 is 483MB
        device: 'wasm', // WASM is more stable than WebGPU for this model
        local_files_only: false,
        progress_callback: (progress: any) => {
          if (progress.progress !== undefined) {
            self.postMessage({
              type: 'progress',
              model: 'generation',
              progress: progress.progress,
              status: progress.status || 'downloading'
            });
          }
        }
      }
    );

    self.postMessage({ type: 'status', status: 'model_ready', message: 'Generation model ready' });
    return generationPipeline;
  } catch (error: any) {
    console.error('[AIWorker] Generation model error:', error);
    self.postMessage({ type: 'error', error: error?.message || String(error) });
    throw error;
  } finally {
    isLoadingGeneration = false;
  }
}

interface TagResult {
  summary: string;
  tags: Array<{ tag: string; evidence: string }>;
}

async function extractTags(text: string): Promise<TagResult> {
  const model = await initGenerationModel();
  self.postMessage({ type: 'status', status: 'extracting', message: 'Extracting tags...' });

  // Truncate and clean text for better results
  const cleanText = text
    .replace(/[#*_`~>\[\](){}|\\]/g, ' ')  // Remove markdown
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim()
    .slice(0, 2000);

  // Qwen2.5-Instruct optimized prompt
  const messages = [
    {
      role: 'system',
      content: 'You are a document analyzer. Extract key information and respond in valid JSON only. No explanations.'
    },
    {
      role: 'user',
      content: `Analyze this text and extract:
1. A brief Korean summary (1 sentence)
2. 3 key named entities (people, organizations, products, locations)

Text:
"""${cleanText}"""

Respond with this exact JSON structure:
{"summary": "한국어 요약문", "tags": [{"tag": "엔티티명", "evidence": "근거 텍스트"}]}`
    }
  ];

  let output;
  try {
    output = await model(messages, {
      max_new_tokens: 512,
      do_sample: false, // Greedy
      return_full_text: false,
    });
  } catch (error: any) {
    console.error('[AIWorker] Model inference error:', error);
    self.postMessage({ type: 'status', status: 'complete', message: 'Model error' });
    return { summary: '', tags: [] };
  }


  let generatedText = '';
  try {
    if (Array.isArray(output) && output[0]?.generated_text) {
      const raw = output[0].generated_text;
      generatedText = typeof raw === 'string' ? raw : JSON.stringify(raw);
    } else if (typeof output === 'string') {
      generatedText = output;
    }
  } catch (e) {
    console.error('[AIWorker] Error extracting response:', e);
  }

  self.postMessage({ type: 'status', status: 'parsing', message: 'Parsing response...' });

  try {
    // Attempt to find JSON in the response (Qwen might be chatty even with system prompt)
    const jsonMatch = (generatedText || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/); // Match {} or []
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      self.postMessage({ type: 'status', status: 'complete', message: 'Tag extraction complete' });
      return {
        summary: parsed.summary || '',
        tags: parsed.tags || []
      };
    }
  } catch (e) {
    console.error('[AIWorker] JSON parse failed:', e, generatedText);
  }

  self.postMessage({ type: 'status', status: 'complete', message: 'Tag extraction complete (parse failed)' });
  return { summary: '', tags: [] };
}

// ============================================================================
// CHAT GENERATION
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function generateChatResponse(messages: ChatMessage[]): Promise<string> {
  const model = await initGenerationModel();
  self.postMessage({ type: 'status', status: 'generating', message: 'Generating response...' });

  try {
    const output = await model(messages, {
      max_new_tokens: 256,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.9,
      return_full_text: false,
    });

    console.log('[AIWorker] Chat output:', JSON.stringify(output, null, 2));

    let generatedText = '';

    // Handle various output formats from transformers.js
    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      if (first?.generated_text) {
        // If generated_text is an array of messages (chat format)
        if (Array.isArray(first.generated_text)) {
          const lastMsg = first.generated_text[first.generated_text.length - 1];
          generatedText = lastMsg?.content || '';
        } else {
          generatedText = typeof first.generated_text === 'string'
            ? first.generated_text
            : String(first.generated_text);
        }
      } else if (typeof first === 'string') {
        generatedText = first;
      }
    } else if (typeof output === 'string') {
      generatedText = output;
    } else if (output?.generated_text) {
      generatedText = String(output.generated_text);
    }

    console.log('[AIWorker] Extracted text:', generatedText);

    self.postMessage({ type: 'status', status: 'complete', message: 'Response generated' });
    return generatedText.trim();
  } catch (error: any) {
    console.error('[AIWorker] Chat generation error:', error);
    throw error;
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = async (event: MessageEvent) => {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case 'init':
        await initEmbeddingModel();
        self.postMessage({ type: 'result', id, success: true });
        break;

      case 'init_generation':
        await initGenerationModel();
        self.postMessage({ type: 'result', id, success: true });
        break;

      case 'embed':
        const embedding = await generateEmbedding(data.text);
        self.postMessage({ type: 'result', id, success: true, embedding });
        break;

      case 'extract_tags':
        const tagResult = await extractTags(data.text);
        self.postMessage({ type: 'result', id, success: true, ...tagResult });
        break;

      case 'chat':
        const response = await generateChatResponse(data.messages);
        self.postMessage({ type: 'result', id, success: true, response });
        break;

      case 'fetch_result':
        // Handled by separate listener
        return;

      default:
        self.postMessage({ type: 'error', id, error: `Unknown type: ${type}` });
    }
  } catch (error: any) {
    console.error('[AIWorker] Error:', error);
    self.postMessage({ type: 'error', id, error: error?.message || String(error) });
  }
};

export { };
