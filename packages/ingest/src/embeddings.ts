import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to use local cache
env.cacheDir = './.cache/transformers';

// Model configuration
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSION = 384;

// Singleton instance of the embedding pipeline
let embeddingPipeline: any = null;

/**
 * Initialize the embedding pipeline
 * This loads the model into memory (first time may take a while)
 */
async function initEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log(`[Embeddings] Loading model: ${MODEL_NAME}...`);
    embeddingPipeline = await pipeline('feature-extraction', MODEL_NAME);
    console.log(`[Embeddings] Model loaded successfully`);
  }
  return embeddingPipeline;
}

/**
 * Generate embedding vector for a single text string
 * 
 * @param text - The text to embed
 * @returns Array of 384 numbers (the embedding vector)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const pipe = await initEmbeddingPipeline();
  
  // Generate embedding
  const result = await pipe(text, {
    pooling: 'mean',
    normalize: true,
  });

  // Extract the embedding array
  const embedding = Array.from(result.data) as number[];

  if (embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected embedding dimension ${EMBEDDING_DIMENSION}, got ${embedding.length}`
    );
  }

  return embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 * More efficient than calling generateEmbedding multiple times
 * 
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Filter out empty texts
  const validTexts = texts.filter((t) => t && t.trim().length > 0);
  
  if (validTexts.length === 0) {
    throw new Error('No valid texts provided for embedding');
  }

  const pipe = await initEmbeddingPipeline();

  // Process in batch
  const result = await pipe(validTexts, {
    pooling: 'mean',
    normalize: true,
  });

  // Extract embeddings
  const embeddings: number[][] = [];
  
  if (validTexts.length === 1) {
    // Single result
    embeddings.push(Array.from(result.data) as number[]);
  } else {
    // Multiple results
    for (let i = 0; i < validTexts.length; i++) {
      const start = i * EMBEDDING_DIMENSION;
      const end = start + EMBEDDING_DIMENSION;
      embeddings.push(Array.from(result.data.slice(start, end)) as number[]);
    }
  }

  return embeddings;
}

/**
 * Create a searchable text from an event for embedding
 * Combines title, text, and URL into a single string
 * 
 * @param event - Event data with title, text, and url
 * @returns Combined text suitable for embedding
 */
export function createEventText(event: {
  title?: string;
  text?: string;
  url: string;
}): string {
  const parts: string[] = [];

  if (event.title) {
    parts.push(event.title);
  }

  if (event.text) {
    parts.push(event.text);
  }

  // Extract meaningful parts from URL
  try {
    const url = new URL(event.url);
    // Add domain
    parts.push(url.hostname);
    // Add path segments (without query params)
    if (url.pathname && url.pathname !== '/') {
      const pathParts = url.pathname
        .split('/')
        .filter((p) => p.length > 0)
        .join(' ');
      parts.push(pathParts);
    }
  } catch (e) {
    // If URL parsing fails, just use the raw URL
    parts.push(event.url);
  }

  return parts.join(' ').trim();
}

/**
 * Calculate cosine similarity between two embedding vectors
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 * 
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Cosine similarity score
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimensions must match: ${a.length} vs ${b.length}`
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

export { MODEL_NAME, EMBEDDING_DIMENSION };

