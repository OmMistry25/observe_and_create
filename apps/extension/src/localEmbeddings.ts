/**
 * Local Embeddings Generator
 * 
 * Uses Transformers.js with Xenova/all-MiniLM-L6-v2 model to generate embeddings locally
 * - 100% privacy: No data sent to cloud
 * - Fast: Model runs in browser using ONNX Runtime
 * - Small: ~23MB model size
 * - Quality: 384-dimensional embeddings optimized for semantic similarity
 */

import { pipeline, Pipeline, env } from '@xenova/transformers';

// Configure Transformers.js for Chrome extension service worker
// Service workers don't have access to URL.createObjectURL, so we need special config
env.allowLocalModels = false; // Always use remote models
env.allowRemoteModels = true; // Enable remote model loading
env.useBrowserCache = true; // Cache models in browser storage
env.backends.onnx.wasm.proxy = false; // Disable worker proxy (not available in service workers)

// Singleton pipeline instance
let embeddingPipeline: Pipeline | null = null;
let isInitializing = false;
let initializationPromise: Promise<Pipeline> | null = null;

/**
 * Initialize the embedding model
 * Model: Xenova/all-MiniLM-L6-v2
 * - Size: ~23MB
 * - Dimensions: 384
 * - Use case: Semantic similarity, clustering, search
 */
export async function initializeEmbeddings(): Promise<Pipeline> {
  // If already initialized, return existing pipeline
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  // If initialization is in progress, wait for it
  if (isInitializing && initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  isInitializing = true;
  console.log('[LocalEmbeddings] Initializing Xenova/all-MiniLM-L6-v2 model...');

  initializationPromise = (async () => {
    try {
      // Load the feature extraction pipeline with the MiniLM model
      embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        {
          // Configure for browser use
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              console.log(`[LocalEmbeddings] Downloading model: ${Math.round(progress.progress)}%`);
            } else if (progress.status === 'loading') {
              console.log('[LocalEmbeddings] Loading model into memory...');
            }
          },
        }
      );

      console.log('[LocalEmbeddings] ✅ Model initialized successfully');
      isInitializing = false;
      return embeddingPipeline;
    } catch (error) {
      console.error('[LocalEmbeddings] ❌ Failed to initialize model:', error);
      isInitializing = false;
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Generate embedding for a single text
 * @param text - Text to embed (will be truncated to 256 tokens)
 * @returns 384-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const pipeline = await initializeEmbeddings();

    // Truncate text to reasonable length (model max is 256 tokens)
    const truncatedText = text.substring(0, 1000);

    // Generate embedding
    const output = await pipeline(truncatedText, {
      pooling: 'mean', // Mean pooling for sentence embedding
      normalize: true, // L2 normalize for cosine similarity
    });

    // Extract the embedding array
    const embedding = Array.from(output.data as Float32Array);

    console.log(`[LocalEmbeddings] Generated embedding: ${embedding.length} dimensions`);
    return embedding;
  } catch (error) {
    console.error('[LocalEmbeddings] Failed to generate embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * More efficient than calling generateEmbedding multiple times
 * @param texts - Array of texts to embed
 * @returns Array of 384-dimensional embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const pipeline = await initializeEmbeddings();

    // Truncate all texts
    const truncatedTexts = texts.map(t => t.substring(0, 1000));

    // Generate embeddings in batch
    const outputs = await Promise.all(
      truncatedTexts.map(text =>
        pipeline(text, {
          pooling: 'mean',
          normalize: true,
        })
      )
    );

    // Extract embedding arrays
    const embeddings = outputs.map(output => Array.from(output.data as Float32Array));

    console.log(`[LocalEmbeddings] Generated ${embeddings.length} embeddings`);
    return embeddings;
  } catch (error) {
    console.error('[LocalEmbeddings] Failed to generate batch embeddings:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * @param embedding1 - First embedding vector
 * @param embedding2 - Second embedding vector
 * @returns Similarity score between 0 and 1 (1 = identical, 0 = unrelated)
 */
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

  // Since embeddings are L2 normalized, cosine similarity is just the dot product
  let dotProduct = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
  }

  // Clamp to [0, 1] range (normalized embeddings should naturally be in this range)
  return Math.max(0, Math.min(1, dotProduct));
}

/**
 * Find most similar embedding from a list
 * @param queryEmbedding - The query embedding to compare against
 * @param candidateEmbeddings - List of candidate embeddings with metadata
 * @param topK - Number of top results to return (default: 5)
 * @returns Top K most similar embeddings with their similarity scores
 */
export function findMostSimilar<T>(
  queryEmbedding: number[],
  candidateEmbeddings: Array<{ embedding: number[]; data: T }>,
  topK: number = 5
): Array<{ data: T; similarity: number }> {
  // Calculate similarities
  const similarities = candidateEmbeddings.map(candidate => ({
    data: candidate.data,
    similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
  }));

  // Sort by similarity (highest first) and take top K
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Embed text with context (combines multiple text fields)
 * Useful for embedding events with multiple attributes
 * @param fields - Object with text fields to embed
 * @returns Single embedding representing all fields
 */
export async function embedWithContext(fields: Record<string, string | null | undefined>): Promise<number[]> {
  // Combine all text fields into a single string
  const combinedText = Object.entries(fields)
    .filter(([_, value]) => value != null && value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join('. ');

  if (combinedText.length === 0) {
    throw new Error('No text content to embed');
  }

  return generateEmbedding(combinedText);
}

/**
 * Embed URL for semantic search
 * Extracts meaningful information from URL and generates embedding
 * @param url - URL to embed
 * @returns Embedding representing the URL's semantic content
 */
export async function embedUrl(url: string): Promise<number[]> {
  try {
    const urlObj = new URL(url);

    // Extract meaningful parts
    const domain = urlObj.hostname.replace('www.', '');
    const pathParts = urlObj.pathname
      .split('/')
      .filter(p => p.length > 0)
      .join(' ');
    const queryParams = Array.from(urlObj.searchParams.entries())
      .map(([key, value]) => `${key} ${value}`)
      .join(' ');

    // Combine into semantic text
    const semanticText = `${domain} ${pathParts} ${queryParams}`.trim();

    return generateEmbedding(semanticText);
  } catch (error) {
    console.error('[LocalEmbeddings] Failed to embed URL:', error);
    // Fallback: just embed the raw URL
    return generateEmbedding(url);
  }
}

/**
 * Embed event for pattern matching
 * Creates a semantic representation of a user event
 * @param event - Event object with type, url, context, etc.
 * @returns Embedding representing the event
 */
export async function embedEvent(event: {
  type: string;
  url: string;
  title?: string;
  semantic_context?: any;
  document_context?: any;
}): Promise<number[]> {
  // Build semantic description of the event
  const parts: string[] = [];

  // Event type
  parts.push(`Action: ${event.type}`);

  // Page info
  if (event.title) {
    parts.push(`Page: ${event.title}`);
  }

  // URL domain and path
  try {
    const urlObj = new URL(event.url);
    parts.push(`Site: ${urlObj.hostname.replace('www.', '')}`);
  } catch {
    // Invalid URL, skip
  }

  // Semantic context
  if (event.semantic_context?.purpose) {
    parts.push(`Intent: ${event.semantic_context.purpose}`);
  }
  if (event.semantic_context?.pageMetadata?.type) {
    parts.push(`PageType: ${event.semantic_context.pageMetadata.type}`);
  }

  // Document context (if available)
  if (event.document_context) {
    const docFields = Object.entries(event.document_context)
      .filter(([_, v]) => typeof v === 'string' && v.length > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .slice(0, 3); // Take top 3 fields
    parts.push(...docFields);
  }

  const semanticText = parts.join('. ');
  return generateEmbedding(semanticText);
}

/**
 * Check if model is ready (initialized)
 */
export function isModelReady(): boolean {
  return embeddingPipeline !== null;
}

/**
 * Get model information
 */
export function getModelInfo(): {
  initialized: boolean;
  modelName: string;
  dimensions: number;
  maxTokens: number;
} {
  return {
    initialized: embeddingPipeline !== null,
    modelName: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    maxTokens: 256,
  };
}

/**
 * Preload model in background
 * Call this during initialization to ensure model is ready when needed
 */
export function preloadModel(): void {
  if (!embeddingPipeline && !isInitializing) {
    console.log('[LocalEmbeddings] Preloading model in background...');
    initializeEmbeddings().catch(error => {
      console.warn('[LocalEmbeddings] Preload failed (will retry when needed):', error);
    });
  }
}

