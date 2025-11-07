/**
 * Semantic Pattern Clustering
 * 
 * Groups similar patterns together using local embeddings and cosine similarity
 * - No cloud calls: All clustering happens locally
 * - Semantic understanding: Groups by meaning, not just exact matches
 * - Hierarchical: Can create nested clusters
 */

import {
  generateEmbedding,
  embedEvent,
  cosineSimilarity,
  findMostSimilar,
} from './localEmbeddings';

/**
 * Cluster of similar patterns
 */
export interface PatternCluster {
  id: string;
  label: string; // Human-readable cluster name
  centroid: number[]; // Average embedding of all patterns in cluster
  patterns: any[]; // Actual pattern objects
  size: number; // Number of patterns in cluster
  confidence: number; // How tightly grouped (0-1, higher = more similar)
  keywords: string[]; // Common keywords extracted from patterns
}

/**
 * Clustering configuration
 */
interface ClusteringConfig {
  minSimilarity: number; // Minimum similarity to be in same cluster (0-1)
  minClusterSize: number; // Minimum number of patterns to form a cluster
  maxClusters: number; // Maximum number of clusters to create
}

const DEFAULT_CONFIG: ClusteringConfig = {
  minSimilarity: 0.7, // 70% similarity threshold
  minClusterSize: 2, // At least 2 patterns
  maxClusters: 20, // Max 20 clusters
};

/**
 * Cluster patterns using k-means-like algorithm
 * @param patterns - Array of patterns with embeddings
 * @param config - Clustering configuration
 * @returns Array of clusters
 */
export async function clusterPatterns(
  patterns: Array<{ id: string; embedding: number[]; data: any }>,
  config: Partial<ClusteringConfig> = {}
): Promise<PatternCluster[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (patterns.length < cfg.minClusterSize) {
    console.log('[SemanticClustering] Not enough patterns to cluster');
    return [];
  }

  console.log(`[SemanticClustering] Clustering ${patterns.length} patterns...`);

  // Use hierarchical agglomerative clustering
  // 1. Start with each pattern as its own cluster
  let clusters: PatternCluster[] = patterns.map((p, i) => ({
    id: `cluster-${i}`,
    label: `Cluster ${i + 1}`,
    centroid: p.embedding,
    patterns: [p.data],
    size: 1,
    confidence: 1.0,
    keywords: extractKeywords([p.data]),
  }));

  // 2. Iteratively merge most similar clusters
  while (clusters.length > 1) {
    // Find most similar pair of clusters
    let maxSimilarity = -1;
    let mergeIdx1 = -1;
    let mergeIdx2 = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const similarity = cosineSimilarity(clusters[i].centroid, clusters[j].centroid);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mergeIdx1 = i;
          mergeIdx2 = j;
        }
      }
    }

    // If similarity is below threshold, stop merging
    if (maxSimilarity < cfg.minSimilarity) {
      break;
    }

    // If we're down to max clusters, stop
    if (clusters.length <= cfg.maxClusters) {
      break;
    }

    // Merge the two most similar clusters
    const cluster1 = clusters[mergeIdx1];
    const cluster2 = clusters[mergeIdx2];

    const mergedPatterns = [...cluster1.patterns, ...cluster2.patterns];
    const mergedCentroid = computeCentroid([cluster1.centroid, cluster2.centroid]);

    const mergedCluster: PatternCluster = {
      id: `cluster-${mergeIdx1}-${mergeIdx2}`,
      label: `${cluster1.label} + ${cluster2.label}`,
      centroid: mergedCentroid,
      patterns: mergedPatterns,
      size: mergedPatterns.length,
      confidence: maxSimilarity,
      keywords: extractKeywords(mergedPatterns),
    };

    // Remove old clusters and add merged one
    clusters = [
      ...clusters.slice(0, mergeIdx1),
      ...clusters.slice(mergeIdx1 + 1, mergeIdx2),
      ...clusters.slice(mergeIdx2 + 1),
      mergedCluster,
    ];
  }

  // Filter out clusters that are too small
  clusters = clusters.filter(c => c.size >= cfg.minClusterSize);

  // Generate better labels based on content
  clusters = clusters.map((cluster, idx) => ({
    ...cluster,
    label: generateClusterLabel(cluster, idx),
  }));

  console.log(`[SemanticClustering] ✅ Created ${clusters.length} clusters`);
  return clusters;
}

/**
 * Compute centroid (average) of multiple embeddings
 */
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('Cannot compute centroid of empty array');
  }

  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += embedding[i];
    }
  }

  // Average and normalize
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  // L2 normalize
  const magnitude = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0));
  for (let i = 0; i < dim; i++) {
    centroid[i] /= magnitude;
  }

  return centroid;
}

/**
 * Extract common keywords from patterns
 */
function extractKeywords(patterns: any[]): string[] {
  const wordCounts = new Map<string, number>();

  for (const pattern of patterns) {
    // Extract words from various fields
    const text = [
      pattern.description || '',
      pattern.url || '',
      pattern.title || '',
      pattern.type || '',
    ].join(' ').toLowerCase();

    const words = text
      .split(/\W+/)
      .filter(w => w.length > 3) // Only words with 4+ characters
      .filter(w => !isStopWord(w));

    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  // Get top 5 most common words
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Check if word is a common stop word
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'this', 'that', 'these', 'those', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'may', 'might', 'can', 'https', 'http', 'www', 'com', 'html',
  ]);
  return stopWords.has(word);
}

/**
 * Generate human-readable label for a cluster
 */
function generateClusterLabel(cluster: PatternCluster, index: number): string {
  if (cluster.keywords.length > 0) {
    // Use top 2-3 keywords
    return cluster.keywords.slice(0, 3).join(', ');
  }

  // Fallback to generic label
  return `Pattern Group ${index + 1}`;
}

/**
 * Find which cluster a new pattern belongs to
 * @param patternEmbedding - Embedding of the new pattern
 * @param clusters - Existing clusters
 * @param threshold - Minimum similarity to assign to cluster
 * @returns Cluster ID or null if no good match
 */
export function assignToCluster(
  patternEmbedding: number[],
  clusters: PatternCluster[],
  threshold: number = 0.7
): string | null {
  let bestMatch: { clusterId: string; similarity: number } | null = null;

  for (const cluster of clusters) {
    const similarity = cosineSimilarity(patternEmbedding, cluster.centroid);
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        clusterId: cluster.id,
        similarity,
      };
    }
  }

  return bestMatch?.clusterId || null;
}

/**
 * Cluster events by semantic similarity
 * @param events - Array of events to cluster
 * @returns Array of event clusters
 */
export async function clusterEvents(
  events: Array<{
    id: string;
    type: string;
    url: string;
    title?: string;
    semantic_context?: any;
  }>,
  config: Partial<ClusteringConfig> = {}
): Promise<PatternCluster[]> {
  console.log(`[SemanticClustering] Generating embeddings for ${events.length} events...`);

  // Generate embeddings for all events
  const eventsWithEmbeddings = await Promise.all(
    events.map(async event => {
      const embedding = await embedEvent(event);
      return {
        id: event.id,
        embedding,
        data: event,
      };
    })
  );

  // Cluster using embeddings
  return clusterPatterns(eventsWithEmbeddings, config);
}

/**
 * Cluster URLs by semantic similarity
 * Groups URLs that are semantically related even if exact URLs differ
 * @param urls - Array of URLs to cluster
 * @returns Array of URL clusters
 */
export async function clusterUrls(
  urls: string[],
  config: Partial<ClusteringConfig> = {}
): Promise<PatternCluster[]> {
  console.log(`[SemanticClustering] Clustering ${urls.length} URLs...`);

  // Generate embeddings for URLs
  const urlsWithEmbeddings = await Promise.all(
    urls.map(async (url, idx) => {
      // Extract semantic meaning from URL
      let semanticText = url;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        const path = urlObj.pathname.split('/').filter(p => p.length > 0).join(' ');
        semanticText = `${domain} ${path}`;
      } catch {
        // Invalid URL, use as-is
      }

      const embedding = await generateEmbedding(semanticText);
      return {
        id: `url-${idx}`,
        embedding,
        data: { url, semanticText },
      };
    })
  );

  return clusterPatterns(urlsWithEmbeddings, config);
}

/**
 * Get cluster statistics
 */
export function getClusterStats(clusters: PatternCluster[]): {
  totalClusters: number;
  avgClusterSize: number;
  largestCluster: number;
  smallestCluster: number;
  avgConfidence: number;
} {
  if (clusters.length === 0) {
    return {
      totalClusters: 0,
      avgClusterSize: 0,
      largestCluster: 0,
      smallestCluster: 0,
      avgConfidence: 0,
    };
  }

  const sizes = clusters.map(c => c.size);
  const confidences = clusters.map(c => c.confidence);

  return {
    totalClusters: clusters.length,
    avgClusterSize: sizes.reduce((a, b) => a + b, 0) / sizes.length,
    largestCluster: Math.max(...sizes),
    smallestCluster: Math.min(...sizes),
    avgConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
  };
}

/**
 * Visualize clusters as a simple text summary
 * Useful for debugging and understanding cluster structure
 */
export function visualizeClusters(clusters: PatternCluster[]): string {
  let output = `\n📊 Pattern Clusters (${clusters.length} total)\n`;
  output += '='.repeat(50) + '\n\n';

  clusters.forEach((cluster, idx) => {
    output += `Cluster ${idx + 1}: "${cluster.label}"\n`;
    output += `  Size: ${cluster.size} patterns\n`;
    output += `  Confidence: ${(cluster.confidence * 100).toFixed(1)}%\n`;
    output += `  Keywords: ${cluster.keywords.join(', ')}\n`;
    output += `  Patterns: ${cluster.patterns.slice(0, 3).map((p: any) => p.id || p.url || p.type).join(', ')}`;
    if (cluster.patterns.length > 3) {
      output += ` ... and ${cluster.patterns.length - 3} more`;
    }
    output += '\n\n';
  });

  return output;
}

