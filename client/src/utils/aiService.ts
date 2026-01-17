// AI Service - Main thread API for AI operations
// Communicates with the AI Worker for embedding and text generation

import { invoke } from '@tauri-apps/api/core';
// Import worker using Vite's worker syntax
import AIWorker from './aiWorker?worker';

type ProgressCallback = (progress: number, model: string) => void;
type StatusCallback = (status: string, message: string) => void;

interface DocumentTag {
  tag: string;
  evidence: string;
}

interface ExtractTagsResult {
  summary: string;
  tags: DocumentTag[];
}

interface WorkerMessage {
  type: 'status' | 'progress' | 'result' | 'error' | 'fetch_file';
  id?: number;
  status?: string;
  message?: string;
  model?: string;
  progress?: number;
  success?: boolean;
  embedding?: number[];
  summary?: string;
  tags?: DocumentTag[];
  error?: string;
  path?: string;
  response?: string;  // For chat responses
}

class AIService {
  private worker: Worker | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;
  private onProgress: ProgressCallback | null = null;
  private onStatus: StatusCallback | null = null;

  // Set callbacks for progress and status updates
  setCallbacks(onProgress?: ProgressCallback, onStatus?: StatusCallback) {
    this.onProgress = onProgress || null;
    this.onStatus = onStatus || null;
  }

  // Initialize the worker
  private async ensureWorker(): Promise<void> {
    if (this.worker) return;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;

    try {
      this.worker = new AIWorker();

      // Handle worker errors
      this.worker.onerror = (error) => {
        console.error('[AIService] Worker error event:', error);
        console.error('[AIService] Error message:', error.message);
        console.error('[AIService] Error filename:', error.filename);
        console.error('[AIService] Error lineno:', error.lineno);
      };

      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type, id, status, message, model, progress, success, embedding, summary, tags, error } = event.data;

        switch (type) {
          case 'status':
            this.onStatus?.(status || '', message || '');
            break;

          case 'progress':
            this.onProgress?.(progress || 0, model || 'unknown');
            break;

          case 'result':
            if (id !== undefined && this.pendingRequests.has(id)) {
              const { resolve } = this.pendingRequests.get(id)!;
              this.pendingRequests.delete(id);
              resolve({ success, embedding, summary, tags, response: event.data.response });
            }
            break;

          case 'error':
            console.error('[AIService] Error from worker:', error);
            if (id !== undefined && this.pendingRequests.has(id)) {
              const { reject } = this.pendingRequests.get(id)!;
              this.pendingRequests.delete(id);
              reject(new Error(error || 'Unknown error'));
            } else {
              console.error('[AIService] Worker error (no id):', error);
            }
            break;
          case 'fetch_file':
            // Use custom protocol for local model files
            const protocolUrl = navigator.userAgent.includes('Windows')
              ? `http://model.localhost/${event.data.path}`
              : `model://${event.data.path}`;

            // Add cache: 'no-store' to ensure we always get the latest file from disk (fixes 1.5B vs 0.5B caching issue)
            fetch(protocolUrl, { cache: 'no-store' })
              .then(async (response) => {
                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`Status ${response.status}: ${response.statusText} - ${errorText}`);
                }
                const buffer = await response.arrayBuffer();

                if (this.worker) {
                  this.worker.postMessage({
                    type: 'fetch_result',
                    id: id,
                    data: new Uint8Array(buffer), // Convert to view (or send buffer directly if worker logic tailored)
                    success: true
                  }, [buffer]); // Transfer buffer ownership! 
                }
              })
              .catch((e) => {
                console.error(`[AIService] Failed to read model file ${event.data.path}:`, e);
                if (this.worker) {
                  this.worker.postMessage({
                    type: 'fetch_result',
                    id: id,
                    error: e.toString(),
                    success: false
                  });
                }
              });
            break;
        }
      };
    } catch (error) {
      console.error('[AIService] Failed to create worker:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  // Send message to worker and wait for response
  private async sendMessage<T>(type: string, data: any): Promise<T> {
    await this.ensureWorker();

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, data });
    });
  }

  // Initialize embedding model
  async initEmbedding(): Promise<void> {
    await this.sendMessage('init', {});
    this.isInitialized = true;
  }

  // Initialize generation model
  async initGeneration(): Promise<void> {
    await this.sendMessage('init_generation', {});
  }

  // Preload both models in background (call on app start)
  async preloadModels(): Promise<void> {
    console.log('[AIService] Preloading AI models...');
    try {
      // 1. Log System Info
      try {
        const sysInfo = await invoke('get_system_info');
        console.log('[AIService] System Info:', sysInfo);
      } catch (e) {
        console.error('[AIService] Failed to get system info:', e);
      }

      // 2. Check and Download Models
      await this.ensureModelsDownloaded();

      // 3. Initialize Workers
      await this.initEmbedding();
      console.log('[AIService] Embedding model initialized');
      //await this.initGeneration();
      //console.log('[AIService] Generation model initialized');
    } catch (error) {
      console.error('[AIService] Model preloading failed:', error);
    }
  }

  // Check if models exist and download if missing
  private async ensureModelsDownloaded(): Promise<void> {
    const models = [
      {
        id: 'embedding',
        repo: 'Xenova/multilingual-e5-base',
        files: [
          'config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'model_quantized.onnx'
        ]
      },
      {
        id: 'generation',
        repo: 'onnx-community/Qwen2.5-0.5B-Instruct',
        files: [
          'config.json', 'tokenizer.json', 'tokenizer_config.json', 'generation_config.json', 'special_tokens_map.json', 'model_quantized.onnx'
        ]
      }
    ];

    let totalFiles = 0;
    let downloadedFiles = 0;

    for (const model of models) {
      // Check for specific file aliases/candidates if needed, but here we simplify to the list
      // Note: For ONNX files, we might need to handle the candidate candidates logic if we want to be robust,
      // but since we are controlling the runtime download, we can try specific paths.
      // We will try 'onnx/model_quantized.onnx' then 'model_quantized.onnx' for the onnx file.
      // Simplified: Just try to download 'model_quantized.onnx'. If it fails, logic below handles error?
      // Actually, HuggingFace repo structure varies.
      // Let's use the candidates logic from the script but implemented here.
    }

    // Simplified logic: Just check key files. If any missing, download ALL for that model to be safe?
    // Or check each.

    // We will mimic the robustness of the script:
    const TASKS = [
      {
        id: 'embedding',
        repo: 'Xenova/multilingual-e5-base',
        files: [
          { name: 'config.json', candidates: ['config.json'] },
          { name: 'tokenizer.json', candidates: ['tokenizer.json'] },
          { name: 'tokenizer_config.json', candidates: ['tokenizer_config.json'] },
          { name: 'special_tokens_map.json', candidates: ['special_tokens_map.json'] },
          { name: 'model_quantized.onnx', candidates: ['onnx/model_quantized.onnx', 'model_quantized.onnx', 'model.onnx'] }
        ]
      },
      {
        id: 'generation',
        repo: 'onnx-community/Qwen2.5-0.5B-Instruct',
        files: [
          { name: 'config.json', candidates: ['config.json'] },
          { name: 'tokenizer.json', candidates: ['tokenizer.json'] },
          { name: 'tokenizer_config.json', candidates: ['tokenizer_config.json'] },
          { name: 'generation_config.json', candidates: ['generation_config.json'] },
          { name: 'special_tokens_map.json', candidates: ['special_tokens_map.json'] },
          { name: 'model_q4f16.onnx', candidates: ['onnx/model_q4f16.onnx'] }
        ]
      }
    ];

    for (const model of TASKS) {
      for (const file of model.files) {
        const filePath = `${model.id}/${file.name}`;
        const exists = await invoke<boolean>('check_model_exists', { modelPath: filePath });

        if (!exists) {
          let downloaded = false;
          for (const candidate of file.candidates) {
            const url = `https://huggingface.co/${model.repo}/resolve/main/${candidate}`;
            try {
              await invoke('download_model_file', {
                url,
                relativePath: filePath,
                modelId: model.id
              });
              downloaded = true;
              break;
            } catch (e) {
              console.warn(`[AIService] Failed to download candidate ${candidate}: ${e}`);
            }
          }
          if (!downloaded) {
            throw new Error(`Failed to download required file: ${file.name} for ${model.id}`);
          }
        }
      }
    }
  }

  // Generate embedding for text
  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.sendMessage<{ embedding: number[] }>('embed', { text });
    return result.embedding;
  }

  // Extract tags and summary using Lindera + TF-IDF (Rust backend)
  async extractTags(text: string): Promise<ExtractTagsResult> {
    // Use Rust backend for traditional NLP processing (no LLM)
    const result = await invoke<{ summary: string; tags: Array<{ tag: string; evidence: string | null }> }>('process_text', { text });
    return {
      summary: result.summary || '',
      tags: (result.tags || []).map(t => ({
        tag: t.tag,
        evidence: t.evidence || ''
      }))
    };
  }

  // Chat: generate AI response from conversation messages
  async chat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): Promise<string> {
    const result = await this.sendMessage<{ response: string }>('chat', { messages });
    return result.response || '';
  }

  // Generate embedding and save to database
  async generateAndSaveEmbedding(documentId: string, text: string): Promise<void> {
    const embedding = await this.generateEmbedding(text);
    await invoke('save_embedding', { documentId, embedding });
    console.log(`[AIService] Saved embedding for document ${documentId}`);
  }

  // Extract tags and save to database
  async extractAndSaveTags(documentId: string, text: string): Promise<ExtractTagsResult> {
    const result = await this.extractTags(text);

    if (result.tags.length > 0 || result.summary) {
      await invoke('save_tags', {
        documentId,
        summary: result.summary || null,
        tags: result.tags
      });
      console.log(`[AIService] Saved ${result.tags.length} tags for document ${documentId}`);
    }

    return result;
  }

  // Process document: extract summary/tags first, then embed combined text
  async processDocument(documentId: string, text: string): Promise<{
    embedding: number[];
    summary: string;
    tags: DocumentTag[];
  }> {
    // Step 1: Extract summary and tags using Rust backend (Lindera + TF-IDF)
    const tagResult = await this.extractTags(text);
    console.log(`[AIService] Extracted summary (${tagResult.summary.length} chars) and ${tagResult.tags.length} tags`);

    // Step 2: Build combined text for embedding (summary + tags + original)
    const tagTexts = tagResult.tags.map(t => t.tag).join(' ');
    const combinedText = `${tagResult.summary}\n\n키워드: ${tagTexts}\n\n${text}`;

    // Step 3: Generate embedding from combined text
    const embedding = await this.generateEmbedding(combinedText);

    // Step 4: Save to database
    await Promise.all([
      invoke('save_embedding', { documentId, embedding }),
      invoke('save_tags', {
        documentId,
        summary: tagResult.summary || null,
        tags: tagResult.tags
      })
    ]);

    console.log(`[AIService] Processed document ${documentId}: embedding (from combined text) + ${tagResult.tags.length} tags`);

    return {
      embedding,
      summary: tagResult.summary,
      tags: tagResult.tags
    };
  }

  // Cleanup
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
    this.pendingRequests.clear();
  }
}

// Singleton instance
export const aiService = new AIService();

// Export types
export type { DocumentTag, ExtractTagsResult };
