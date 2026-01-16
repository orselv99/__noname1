// AI Worker for running transformer.js models (v3)
// This runs in a Web Worker to avoid blocking the main thread

console.log('[AIWorker] Script starting...');

let pipeline: any;
let env: any;

// Dynamic import to avoid top-level import issues
// Using CDN since node_modules doesn't work in Web Workers with Vite
async function loadTransformers() {
  console.log('[AIWorker] Loading transformers from CDN...');
  try {
    const transformers = await import(
      /* @vite-ignore */
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3'
    );
    pipeline = transformers.pipeline;
    env = transformers.env;

    // Configure for browser
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    console.log('[AIWorker] Transformers loaded successfully!');
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

// ============================================================================
// EMBEDDING MODEL
// ============================================================================

async function initEmbeddingModel() {
  if (embeddingPipeline) {
    console.log('[AIWorker] Embedding model already loaded');
    return embeddingPipeline;
  }
  if (isLoadingEmbedding) {
    console.log('[AIWorker] Waiting for embedding model...');
    while (isLoadingEmbedding) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return embeddingPipeline;
  }

  isLoadingEmbedding = true;

  try {
    // Ensure transformers is loaded
    if (!pipeline) {
      const success = await loadTransformers();
      if (!success) throw new Error('Transformers not loaded');
    }

    console.log('[AIWorker] Starting embedding model download...');
    self.postMessage({ type: 'status', status: 'loading_embedding', message: 'Downloading embedding model...' });

    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/multilingual-e5-base',
      {
        dtype: 'q8',
        progress_callback: (progress: any) => {
          if (progress.progress !== undefined) {
            const pct = Number(progress.progress) || 0;
            console.log(`[AIWorker] Embedding download: ${pct.toFixed(1)}%`);
            self.postMessage({
              type: 'progress',
              model: 'embedding',
              progress: pct,
              status: progress.status || 'downloading'
            });
          }
        }
      }
    );

    console.log('[AIWorker] Embedding model loaded!');
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
  console.log('[AIWorker] generateEmbedding called');

  const model = await initEmbeddingModel();
  const prefixedText = `passage: ${text}`;

  console.log('[AIWorker] Running embedding inference...');
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

  console.log('[AIWorker] Embedding generated, dims:', embedding.length);
  self.postMessage({ type: 'status', status: 'complete', message: 'Embedding complete' });
  return embedding;
}

// ============================================================================
// GENERATION MODEL
// ============================================================================

async function initGenerationModel() {
  if (generationPipeline) {
    console.log('[AIWorker] Generation model already loaded');
    return generationPipeline;
  }
  if (isLoadingGeneration) {
    console.log('[AIWorker] Waiting for generation model...');
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

    console.log('[AIWorker] Starting generation model download...');
    self.postMessage({ type: 'status', status: 'loading_generation', message: 'Downloading summarization model...' });

    // Using Flan-T5-small instead of Qwen to avoid WebAssembly memory issues
    generationPipeline = await pipeline(
      'text2text-generation',
      'Xenova/flan-t5-small',
      {
        dtype: 'q8',
        progress_callback: (progress: any) => {
          if (progress.progress !== undefined) {
            const pct = Number(progress.progress) || 0;
            console.log(`[AIWorker] Generation download: ${pct.toFixed(1)}%`);
            self.postMessage({
              type: 'progress',
              model: 'generation',
              progress: pct,
              status: progress.status || 'downloading'
            });
          }
        }
      }
    );

    console.log('[AIWorker] Generation model loaded!');
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
  console.log('[AIWorker] extractTags called');

  const model = await initGenerationModel();

  console.log('[AIWorker] Running tag extraction...');
  self.postMessage({ type: 'status', status: 'extracting', message: 'Extracting tags...' });

  // Truncate to 1000 chars for faster processing
  const truncatedText = text.slice(0, 1000);

  // Flan-T5 uses simple instruction format (no chat messages)
  const prompt = `Extract 3 named entities from this document and provide a one-sentence summary in Korean:

Document: ${truncatedText}

Output JSON format: {"summary":"이 문서는 ~에 대해 설명합니다.", "tags":[{"tag":"entity1", "evidence":"evidence text"}, {"tag":"entity2", "evidence":"evidence text"}, {"tag":"entity3", "evidence":"evidence text"}]}

JSON:`;

  console.log('[AIWorker] Sending to model...');
  let output;
  try {
    output = await model(prompt, {
      max_new_tokens: 256,
      do_sample: false,
    });
  } catch (error: any) {
    console.error('[AIWorker] Model inference error:', error);
    self.postMessage({ type: 'status', status: 'complete', message: 'Model error' });
    return { summary: '', tags: [] };
  }

  console.log('[AIWorker] Raw output:', output);

  let generatedText = '';
  try {
    if (Array.isArray(output) && output[0]?.generated_text) {
      generatedText = output[0].generated_text;
    } else if (typeof output === 'string') {
      generatedText = output;
    }
  } catch (e) {
    console.error('[AIWorker] Error extracting response:', e);
  }

  console.log('[AIWorker] Generated text:', generatedText);
  self.postMessage({ type: 'status', status: 'parsing', message: 'Parsing response...' });

  try {
    const jsonMatch = (generatedText || '').match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[AIWorker] Parsed result:', parsed);
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
// MESSAGE HANDLER
// ============================================================================

self.onmessage = async (event: MessageEvent) => {
  const { type, id, data } = event.data;
  console.log('[AIWorker] Received message:', type, 'id:', id);

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

      default:
        self.postMessage({ type: 'error', id, error: `Unknown type: ${type}` });
    }
  } catch (error: any) {
    console.error('[AIWorker] Error:', error);
    self.postMessage({ type: 'error', id, error: error?.message || String(error) });
  }
};

console.log('[AIWorker] Worker ready!');

export { };
