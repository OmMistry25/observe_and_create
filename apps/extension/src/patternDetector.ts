/**
 * Enhanced Real-Time Pattern Detection
 * 
 * Features:
 * - Dynamic sliding windows (2-7 events) instead of fixed 3-event sequences
 * - Frequency-based confidence scoring
 * - Recency weighting (recent patterns weighted higher)
 * - Time-gap consistency checking
 * - Pattern storage to local database
 */

import { getDB, type Pattern } from '@observe-create/storage';

export interface EventSummary {
  id: string;
  type: string;
  url: string;
  domPath: string;
  timestamp: string;
  client_timestamp: number;
}

export interface DetectedPattern {
  id: string;
  sequence: EventSummary[];
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  confidence: number;
  avgTimeGap: number; // Average time between events in pattern (ms)
  windowSize: number; // Length of the pattern (2-7)
}

// Configuration
const EVENT_BUFFER_SIZE = 100; // Increased for better pattern detection
const MIN_WINDOW_SIZE = 2;
const MAX_WINDOW_SIZE = 7;
const MIN_OCCURRENCES = 3;
const MIN_CONFIDENCE = 0.1; // Only report patterns with >10% confidence

// State
const eventBuffer: EventSummary[] = [];
const detectedPatterns = new Map<string, DetectedPattern>();
const frequencyMaps: Map<number, Map<string, number>> = new Map(); // windowSize -> (sequenceKey -> count)

// Initialize frequency maps for each window size
for (let L = MIN_WINDOW_SIZE; L <= MAX_WINDOW_SIZE; L++) {
  frequencyMaps.set(L, new Map());
}

/**
 * Add event to buffer and check for patterns
 * Now checks ALL window sizes (2-7) for patterns
 */
export function addEventAndDetect(event: any): DetectedPattern | null {
  // Create event summary
  const eventSummary: EventSummary = {
    id: event.id,
    type: event.type,
    url: event.url,
    domPath: event.domPath || event.element || '',
    timestamp: event.timestamp || event.local_timestamp,
    client_timestamp: event.client_timestamp || Date.now(),
  };

  // Add to buffer
  eventBuffer.push(eventSummary);

  // Trim buffer if too large
  if (eventBuffer.length > EVENT_BUFFER_SIZE) {
    eventBuffer.shift();
  }

  // Update frequency maps for all window sizes
  updateFrequencyMaps();

  // Check for new patterns across all window sizes
  const newPattern = detectPatterns();

  return newPattern;
}

/**
 * Update frequency maps for all window sizes
 * Scans the buffer and counts occurrences of each sequence
 */
function updateFrequencyMaps(): void {
  // Clear all maps
  frequencyMaps.forEach(map => map.clear());

  // For each window size
  for (let L = MIN_WINDOW_SIZE; L <= MAX_WINDOW_SIZE; L++) {
    const freqMap = frequencyMaps.get(L)!;

    // Extract all L-length sequences from buffer
    for (let i = 0; i <= eventBuffer.length - L; i++) {
      const sequence = eventBuffer.slice(i, i + L);
      const key = createSequenceKey(sequence);
      freqMap.set(key, (freqMap.get(key) || 0) + 1);
    }
  }
}

/**
 * Detect patterns across all window sizes
 * Returns the most confident new pattern, if any
 */
function detectPatterns(): DetectedPattern | null {
  let bestNewPattern: DetectedPattern | null = null;
  let highestConfidence = 0;

  // Check each window size
  for (let L = MIN_WINDOW_SIZE; L <= MAX_WINDOW_SIZE; L++) {
    const freqMap = frequencyMaps.get(L)!;

    // Check all sequences of this length
    for (const [sequenceKey, occurrences] of freqMap.entries()) {
      if (occurrences < MIN_OCCURRENCES) continue;

      // Get the latest instance of this sequence
      const sequence = findLatestSequence(sequenceKey, L);
      if (!sequence) continue;

      // Calculate confidence
      const confidence = calculateConfidence(occurrences, L, sequence);
      if (confidence < MIN_CONFIDENCE) continue;

      // Check if this is a new pattern or an update
      const existing = detectedPatterns.get(sequenceKey);
      
      if (!existing) {
        // New pattern detected!
        const avgTimeGap = calculateAverageTimeGap(sequence);
        const pattern: DetectedPattern = {
          id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sequence,
          occurrences,
          firstSeen: findFirstOccurrence(sequenceKey, L),
          lastSeen: sequence[sequence.length - 1].timestamp,
          confidence,
          avgTimeGap,
          windowSize: L,
        };

        detectedPatterns.set(sequenceKey, pattern);

        console.log('[PatternDetector] 🎯 New pattern detected!', {
          windowSize: L,
          sequence: sequence.map(e => e.type).join(' → '),
          occurrences,
          confidence: Math.round(confidence * 100) + '%',
          avgTimeGap: Math.round(avgTimeGap / 1000) + 's'
        });

        // Save to database
        savePatternToDatabase(pattern);

        // Track best pattern for return
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestNewPattern = pattern;
        }
      } else {
        // Update existing pattern
        existing.occurrences = occurrences;
        existing.lastSeen = sequence[sequence.length - 1].timestamp;
        existing.confidence = confidence;
        existing.avgTimeGap = calculateAverageTimeGap(sequence);
        detectedPatterns.set(sequenceKey, existing);

        // Update database
        savePatternToDatabase(existing);
      }
    }
  }

  return bestNewPattern;
}

/**
 * Create a unique key for a sequence
 * Uses fuzzy matching to handle slight variations
 */
function createSequenceKey(sequence: EventSummary[]): string {
  return sequence
    .map(e => {
      const normalizedPath = normalizeDomPath(e.domPath);
      // Include both type and normalized path
      return `${e.type}:${normalizedPath}`;
    })
    .join('|');
}

/**
 * Normalize DOM path to handle slight variations
 */
function normalizeDomPath(path: string): string {
  if (!path) return '';
  
  // Remove array indices
  let normalized = path.replace(/\[\d+\]/g, '[]');
  
  // Remove specific IDs
  normalized = normalized.replace(/#[^\s.>\[]+/g, '');
  
  // Simplify class selectors
  normalized = normalized.replace(/(\.[^\s.>\[]+)+/g, '.class');
  
  return normalized;
}

/**
 * Find the latest occurrence of a sequence in the buffer
 */
function findLatestSequence(sequenceKey: string, windowSize: number): EventSummary[] | null {
  // Search backwards for efficiency
  for (let i = eventBuffer.length - windowSize; i >= 0; i--) {
    const sequence = eventBuffer.slice(i, i + windowSize);
    if (createSequenceKey(sequence) === sequenceKey) {
      return sequence;
    }
  }
  return null;
}

/**
 * Find the first occurrence timestamp of a sequence
 */
function findFirstOccurrence(sequenceKey: string, windowSize: number): string {
  for (let i = 0; i <= eventBuffer.length - windowSize; i++) {
    const sequence = eventBuffer.slice(i, i + windowSize);
    if (createSequenceKey(sequence) === sequenceKey) {
      return sequence[0].timestamp;
    }
  }
  return new Date().toISOString();
}

/**
 * Calculate confidence score for a pattern
 * Factors:
 * - Frequency (how often it occurs)
 * - Recency (recent occurrences weighted higher)
 * - Consistency (time gaps between events)
 * - Density (pattern concentration in buffer)
 */
function calculateConfidence(occurrences: number, windowSize: number, sequence: EventSummary[]): number {
  // 1. Frequency score (0-1, saturates at 10 occurrences)
  const frequencyScore = Math.min(occurrences / 10, 1);

  // 2. Recency score (recent patterns weighted higher)
  const latestTimestamp = sequence[sequence.length - 1].client_timestamp;
  const oldestTimestamp = eventBuffer[0]?.client_timestamp || latestTimestamp;
  const bufferDuration = latestTimestamp - oldestTimestamp;
  const recencyScore = bufferDuration > 0 ? 0.5 + 0.5 * (1 - (latestTimestamp - sequence[0].client_timestamp) / bufferDuration) : 1;

  // 3. Consistency score (time gaps should be similar)
  const timeGaps = [];
  for (let i = 1; i < sequence.length; i++) {
    const gap = sequence[i].client_timestamp - sequence[i - 1].client_timestamp;
    timeGaps.push(gap);
  }
  const avgGap = timeGaps.reduce((sum, gap) => sum + gap, 0) / timeGaps.length;
  const variance = timeGaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / timeGaps.length;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = avgGap > 0 ? Math.max(0, 1 - (stdDev / avgGap)) : 1;

  // 4. Density score (pattern concentration in buffer)
  const densityScore = (occurrences * windowSize) / eventBuffer.length;

  // Weighted combination
  const confidence = (
    frequencyScore * 0.4 +
    recencyScore * 0.2 +
    consistencyScore * 0.2 +
    densityScore * 0.2
  );

  return Math.round(confidence * 100) / 100;
}

/**
 * Calculate average time gap between events in sequence
 */
function calculateAverageTimeGap(sequence: EventSummary[]): number {
  if (sequence.length < 2) return 0;

  let totalGap = 0;
  for (let i = 1; i < sequence.length; i++) {
    const gap = sequence[i].client_timestamp - sequence[i - 1].client_timestamp;
    totalGap += gap;
  }

  return totalGap / (sequence.length - 1);
}

/**
 * Save pattern to local database
 */
async function savePatternToDatabase(pattern: DetectedPattern): Promise<void> {
  try {
    const db = await getDB();
    
    const dbPattern: Pattern = {
      id: pattern.id,
      sequence: pattern.sequence.map(e => ({
        id: e.id,
        type: e.type,
        url: e.url,
        domPath: e.domPath,
        timestamp: e.timestamp
      })),
      occurrences: pattern.occurrences,
      confidence: pattern.confidence,
      first_seen: pattern.firstSeen,
      last_seen: pattern.lastSeen,
      pattern_type: 'frequency',
      temporal_metadata: {
        avgTimeGap: pattern.avgTimeGap,
        windowSize: pattern.windowSize
      }
    };

    db.upsertPattern(dbPattern);
    console.log(`[PatternDetector] Saved pattern ${pattern.id} to database`);
  } catch (error) {
    console.error('[PatternDetector] Failed to save pattern to database:', error);
  }
}

/**
 * Get all detected patterns in current session
 */
export function getDetectedPatterns(): DetectedPattern[] {
  return Array.from(detectedPatterns.values())
    .sort((a, b) => b.confidence - a.confidence); // Sort by confidence
}

/**
 * Get patterns by window size
 */
export function getPatternsByWindowSize(windowSize: number): DetectedPattern[] {
  return Array.from(detectedPatterns.values())
    .filter(p => p.windowSize === windowSize)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get high confidence patterns (>0.7)
 */
export function getHighConfidencePatterns(): DetectedPattern[] {
  return Array.from(detectedPatterns.values())
    .filter(p => p.confidence >= 0.7)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Clear all detected patterns (e.g., on session end)
 */
export function clearPatterns(): void {
  detectedPatterns.clear();
  eventBuffer.length = 0;
  frequencyMaps.forEach(map => map.clear());
}

/**
 * Get current event buffer for debugging
 */
export function getEventBuffer(): EventSummary[] {
  return [...eventBuffer];
}

/**
 * Get statistics about pattern detection
 */
export function getPatternStats(): {
  totalPatterns: number;
  byWindowSize: Record<number, number>;
  avgConfidence: number;
  highConfidenceCount: number;
} {
  const patterns = Array.from(detectedPatterns.values());
  const byWindowSize: Record<number, number> = {};

  for (let L = MIN_WINDOW_SIZE; L <= MAX_WINDOW_SIZE; L++) {
    byWindowSize[L] = patterns.filter(p => p.windowSize === L).length;
  }

  const avgConfidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;

  const highConfidenceCount = patterns.filter(p => p.confidence >= 0.7).length;

  return {
    totalPatterns: patterns.length,
    byWindowSize,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    highConfidenceCount
  };
}
