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
  type: 'status' | 'progress' | 'result' | 'error';
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
    if (this.worker) {
      console.log('[AIService] Worker already exists');
      return;
    }
    if (this.isInitializing) {
      console.log('[AIService] Worker is initializing, waiting...');
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;
    console.log('[AIService] Creating new Web Worker...');

    try {
      // Use Vite's imported worker constructor
      this.worker = new AIWorker();
      console.log('[AIService] Worker created successfully');

      // Handle worker errors
      this.worker.onerror = (error) => {
        console.error('[AIService] Worker error event:', error);
        console.error('[AIService] Error message:', error.message);
        console.error('[AIService] Error filename:', error.filename);
        console.error('[AIService] Error lineno:', error.lineno);
      };

      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        console.log('[AIService] Received from worker:', event.data.type);
        const { type, id, status, message, model, progress, success, embedding, summary, tags, error } = event.data;

        switch (type) {
          case 'status':
            console.log('[AIService] Status:', status, message);
            this.onStatus?.(status || '', message || '');
            break;

          case 'progress':
            console.log('[AIService] Progress:', model, progress);
            this.onProgress?.(progress || 0, model || 'unknown');
            break;

          case 'result':
            console.log('[AIService] Result received for id:', id);
            if (id !== undefined && this.pendingRequests.has(id)) {
              const { resolve } = this.pendingRequests.get(id)!;
              this.pendingRequests.delete(id);
              resolve({ success, embedding, summary, tags });
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
        }
      };

      console.log('[AIService] Worker event handlers set up');
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
    console.log('[AIService] Preloading AI models in background...');
    try {
      await this.initEmbedding();
      console.log('[AIService] Embedding model preloaded');
      await this.initGeneration();
      console.log('[AIService] Generation model preloaded');
    } catch (error) {
      console.error('[AIService] Model preloading failed:', error);
    }
  }

  // Generate embedding for text
  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.sendMessage<{ embedding: number[] }>('embed', { text });
    return result.embedding;
  }

  // Extract tags and summary from text
  async extractTags(text: string): Promise<ExtractTagsResult> {
    const result = await this.sendMessage<{ summary: string; tags: DocumentTag[] }>('extract_tags', { text });
    return {
      summary: result.summary || '',
      tags: result.tags || []
    };
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

  // Process document: generate embedding + extract tags
  async processDocument(documentId: string, text: string): Promise<{
    embedding: number[];
    summary: string;
    tags: DocumentTag[];
  }> {
    // Run embedding and tag extraction in parallel for speed
    const [embedding, tagResult] = await Promise.all([
      this.generateEmbedding(text),
      this.extractTags(text)
    ]);

    // Save to database
    await Promise.all([
      invoke('save_embedding', { documentId, embedding }),
      invoke('save_tags', {
        documentId,
        summary: tagResult.summary || null,
        tags: tagResult.tags
      })
    ]);

    console.log(`[AIService] Processed document ${documentId}: embedding + ${tagResult.tags.length} tags`);

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
