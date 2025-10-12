/**
 * T18: Real-Time Pattern Detection
 * 
 * Detects when user repeats a 3-step sequence within session (3+ times)
 * Buffers recent events in memory and identifies repetitive workflows
 */

export interface EventSummary {
  id: string;
  type: string;
  url: string;
  domPath: string;
  timestamp: string;
}

export interface DetectedPattern {
  sequence: EventSummary[];
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  confidence: number;
}

// Buffer for recent events (keep last 50 events)
const EVENT_BUFFER_SIZE = 50;
const eventBuffer: EventSummary[] = [];

// Detected patterns in current session
const detectedPatterns = new Map<string, DetectedPattern>();

// Sequence length for pattern detection
const SEQUENCE_LENGTH = 3;
const MIN_OCCURRENCES = 3;

/**
 * Add event to buffer and check for patterns
 */
export function addEventAndDetect(event: any): DetectedPattern | null {
  // Create event summary
  const eventSummary: EventSummary = {
    id: event.id,
    type: event.type,
    url: event.url,
    domPath: event.domPath || event.element || '',
    timestamp: event.timestamp,
  };

  // Add to buffer
  eventBuffer.push(eventSummary);

  // Trim buffer if too large
  if (eventBuffer.length > EVENT_BUFFER_SIZE) {
    eventBuffer.shift();
  }

  // Check for patterns if we have enough events
  if (eventBuffer.length >= SEQUENCE_LENGTH) {
    return detectPattern();
  }

  return null;
}

/**
 * Detect if the last SEQUENCE_LENGTH events match any previous sequence
 */
function detectPattern(): DetectedPattern | null {
  // Get the latest sequence
  const latestSequence = eventBuffer.slice(-SEQUENCE_LENGTH);
  const sequenceKey = createSequenceKey(latestSequence);

  // Look for matching sequences in the buffer
  let matches = 0;
  
  // Scan through buffer for matching sequences
  for (let i = 0; i <= eventBuffer.length - SEQUENCE_LENGTH; i++) {
    const candidateSequence = eventBuffer.slice(i, i + SEQUENCE_LENGTH);
    const candidateKey = createSequenceKey(candidateSequence);
    
    if (candidateKey === sequenceKey) {
      matches++;
    }
  }

  // If we found enough matches, this is a detected pattern
  if (matches >= MIN_OCCURRENCES) {
    const existing = detectedPatterns.get(sequenceKey);
    
    if (!existing) {
      // New pattern detected!
      const pattern: DetectedPattern = {
        sequence: latestSequence,
        occurrences: matches,
        firstSeen: findFirstOccurrence(sequenceKey),
        lastSeen: latestSequence[latestSequence.length - 1].timestamp,
        confidence: calculateConfidence(matches, eventBuffer.length),
      };
      
      detectedPatterns.set(sequenceKey, pattern);
      
      console.log('[PatternDetector] 🎯 Pattern detected!', {
        sequence: latestSequence.map(e => e.type).join(' → '),
        occurrences: matches,
        confidence: pattern.confidence,
      });
      
      return pattern;
    } else {
      // Update existing pattern
      existing.occurrences = matches;
      existing.lastSeen = latestSequence[latestSequence.length - 1].timestamp;
      existing.confidence = calculateConfidence(matches, eventBuffer.length);
      detectedPatterns.set(sequenceKey, existing);
    }
  }

  return null;
}

/**
 * Create a unique key for a sequence based on event types and DOM paths
 * Uses fuzzy matching to handle slight variations
 */
function createSequenceKey(sequence: EventSummary[]): string {
  return sequence
    .map(e => {
      // Normalize DOM path to handle variations
      const normalizedPath = normalizeDomPath(e.domPath);
      // Include type and normalized path for matching
      return `${e.type}:${normalizedPath}`;
    })
    .join('|');
}

/**
 * Normalize DOM path to handle slight variations
 * Removes indices and IDs to make patterns more generic
 */
function normalizeDomPath(path: string): string {
  if (!path) return '';
  
  // Remove array indices like [0], [1], etc.
  let normalized = path.replace(/\[\d+\]/g, '[]');
  
  // Remove specific IDs (keep class names and tag names)
  normalized = normalized.replace(/#[^\s.>\[]+/g, '');
  
  // Simplify consecutive class selectors
  normalized = normalized.replace(/(\.[^\s.>\[]+)+/g, '.class');
  
  return normalized;
}

/**
 * Find the first occurrence of this sequence in the buffer
 */
function findFirstOccurrence(sequenceKey: string): string {
  for (let i = 0; i <= eventBuffer.length - SEQUENCE_LENGTH; i++) {
    const candidateSequence = eventBuffer.slice(i, i + SEQUENCE_LENGTH);
    const candidateKey = createSequenceKey(candidateSequence);
    
    if (candidateKey === sequenceKey) {
      return candidateSequence[0].timestamp;
    }
  }
  
  return new Date().toISOString();
}

/**
 * Calculate confidence score for a pattern
 * Higher frequency = higher confidence
 */
function calculateConfidence(occurrences: number, bufferSize: number): number {
  // Confidence increases with occurrences
  const frequencyScore = Math.min(occurrences / 10, 1); // Max at 10 occurrences
  
  // Confidence decreases if pattern is diluted across large buffer
  const densityScore = (occurrences * SEQUENCE_LENGTH) / bufferSize;
  
  // Combined score (0-1)
  const confidence = (frequencyScore * 0.7 + densityScore * 0.3);
  
  return Math.round(confidence * 100) / 100;
}

/**
 * Get all detected patterns in current session
 */
export function getDetectedPatterns(): DetectedPattern[] {
  return Array.from(detectedPatterns.values());
}

/**
 * Get a specific pattern by its sequence key
 */
export function getPatternByKey(sequenceKey: string): DetectedPattern | undefined {
  return detectedPatterns.get(sequenceKey);
}

/**
 * Clear all detected patterns (e.g., on session end)
 */
export function clearPatterns(): void {
  detectedPatterns.clear();
  eventBuffer.length = 0;
}

/**
 * Get current event buffer for debugging
 */
export function getEventBuffer(): EventSummary[] {
  return [...eventBuffer];
}

