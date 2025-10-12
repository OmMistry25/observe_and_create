/**
 * Pattern Detection Service (T12: MVP)
 * 
 * Implements frequency-based pattern mining to detect recurring workflows
 * 
 * Algorithm:
 * 1. Fetch recent events for user (last 7-30 days)
 * 2. Group events by domain and session
 * 3. Extract sequences of 3-5 consecutive events
 * 4. Find sequences that repeat 3+ times
 * 5. Calculate support and confidence metrics
 * 6. Store patterns in database
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface Event {
  id: string;
  user_id: string;
  ts: string;
  type: string;
  url: string;
  title?: string;
  dom_path?: string;
  text?: string;
  meta?: Record<string, any>;
  dwell_ms?: number;
}

export interface EventSequence {
  events: Event[];
  domain: string;
  hash: string; // Unique identifier for the sequence
}

export interface Pattern {
  user_id: string;
  pattern_type: 'frequency' | 'temporal' | 'semantic';
  sequence: Event[];
  support: number; // Number of times this pattern occurs
  confidence: number; // Reliability score (0-1)
}

const MIN_SUPPORT = 3; // Minimum occurrences to be considered a pattern
const MIN_SEQUENCE_LENGTH = 3;
const MAX_SEQUENCE_LENGTH = 5;
const TIME_WINDOW_DAYS = 7;

/**
 * Domains to ignore in pattern detection
 * These are typically development/testing environments or non-productive sites
 */
const IGNORED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'localhost:3000',
  'localhost:3001',
  'localhost:3002',
  'localhost:8080',
];

/**
 * Check if a URL should be ignored based on domain
 */
function shouldIgnoreDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const hostnameWithPort = urlObj.host; // includes port
    
    return IGNORED_DOMAINS.some(ignored => 
      hostname === ignored || 
      hostnameWithPort === ignored ||
      hostname.includes(ignored)
    );
  } catch {
    return false; // If URL is invalid, don't ignore it
  }
}

/**
 * Mine frequency-based patterns from user events
 */
export async function mineFrequencyPatterns(
  supabase: SupabaseClient,
  userId: string
): Promise<Pattern[]> {
  // 1. Fetch recent events
  const events = await fetchRecentEvents(supabase, userId);
  
  if (events.length < MIN_SEQUENCE_LENGTH) {
    console.log('[PatternDetection] Not enough events for pattern mining');
    return [];
  }

  // 2. Group events by domain
  const eventsByDomain = groupEventsByDomain(events);

  // 3. Extract all possible sequences
  const allSequences: EventSequence[] = [];
  for (const [domain, domainEvents] of Object.entries(eventsByDomain)) {
    const sequences = extractSequences(domainEvents, domain);
    allSequences.push(...sequences);
  }

  // 4. Find frequent sequences
  const frequentSequences = findFrequentSequences(allSequences);

  // 5. Convert to patterns with metrics
  const patterns = frequentSequences.map(seq => ({
    user_id: userId,
    pattern_type: 'frequency' as const,
    sequence: seq.events,
    support: seq.count,
    confidence: calculateConfidence(seq.events, events),
  }));

  console.log(`[PatternDetection] Found ${patterns.length} frequency patterns`);
  return patterns;
}

/**
 * Fetch recent events for a user
 */
async function fetchRecentEvents(
  supabase: SupabaseClient,
  userId: string
): Promise<Event[]> {
  const since = new Date();
  since.setDate(since.getDate() - TIME_WINDOW_DAYS);

  const { data, error } = await supabase
    .from('events')
    .select('id, user_id, ts, type, url, title, dom_path, text, meta, dwell_ms')
    .eq('user_id', userId)
    .gte('ts', since.toISOString())
    .order('ts', { ascending: true });

  if (error) {
    console.error('[PatternDetection] Error fetching events:', error);
    return [];
  }

  // Filter out events from ignored domains
  const filtered = (data || []).filter(event => !shouldIgnoreDomain(event.url));
  
  console.log(`[PatternDetection] Fetched ${data?.length || 0} events, ${filtered.length} after filtering ignored domains`);
  
  return filtered;
}

/**
 * Group events by domain
 */
function groupEventsByDomain(events: Event[]): Record<string, Event[]> {
  const grouped: Record<string, Event[]> = {};

  for (const event of events) {
    try {
      const url = new URL(event.url);
      const domain = url.hostname;

      if (!grouped[domain]) {
        grouped[domain] = [];
      }
      grouped[domain].push(event);
    } catch (e) {
      // Skip invalid URLs
      continue;
    }
  }

  return grouped;
}

/**
 * Extract all possible sequences of length 3-5 from events
 */
function extractSequences(events: Event[], domain: string): EventSequence[] {
  const sequences: EventSequence[] = [];

  for (let length = MIN_SEQUENCE_LENGTH; length <= MAX_SEQUENCE_LENGTH; length++) {
    for (let i = 0; i <= events.length - length; i++) {
      const sequence = events.slice(i, i + length);
      
      // Only consider sequences where events are close together in time (< 5 minutes)
      if (isTemporallyContiguous(sequence)) {
        sequences.push({
          events: sequence,
          domain,
          hash: generateSequenceHash(sequence),
        });
      }
    }
  }

  return sequences;
}

/**
 * Check if events in sequence are temporally contiguous (< 5 minutes apart)
 */
function isTemporallyContiguous(events: Event[]): boolean {
  const MAX_GAP_MS = 5 * 60 * 1000; // 5 minutes

  for (let i = 1; i < events.length; i++) {
    const gap = new Date(events[i].ts).getTime() - new Date(events[i - 1].ts).getTime();
    if (gap > MAX_GAP_MS) {
      return false;
    }
  }

  return true;
}

/**
 * Generate a hash for a sequence based on event types and DOM paths
 */
function generateSequenceHash(events: Event[]): string {
  // Hash based on: event type, normalized URL path, and DOM path
  return events
    .map(e => {
      try {
        const url = new URL(e.url);
        const path = url.pathname;
        return `${e.type}:${path}:${e.dom_path || ''}`;
      } catch {
        return `${e.type}:${e.url}:${e.dom_path || ''}`;
      }
    })
    .join('|');
}

/**
 * Find sequences that occur frequently (MIN_SUPPORT times)
 */
function findFrequentSequences(
  sequences: EventSequence[]
): Array<{ events: Event[]; count: number }> {
  // Count occurrences of each hash
  const hashCounts = new Map<string, { events: Event[]; count: number }>();

  for (const seq of sequences) {
    const existing = hashCounts.get(seq.hash);
    if (existing) {
      existing.count++;
    } else {
      hashCounts.set(seq.hash, { events: seq.events, count: 1 });
    }
  }

  // Filter for frequent patterns
  return Array.from(hashCounts.values())
    .filter(item => item.count >= MIN_SUPPORT)
    .sort((a, b) => b.count - a.count); // Sort by frequency
}

/**
 * Calculate confidence for a pattern
 * Confidence = (occurrences of sequence) / (occurrences of first event)
 */
function calculateConfidence(sequence: Event[], allEvents: Event[]): number {
  if (sequence.length === 0) return 0;

  const firstEventType = sequence[0].type;
  const firstEventCount = allEvents.filter(e => e.type === firstEventType).length;

  if (firstEventCount === 0) return 0;

  // Count how many times this specific sequence appears
  const sequenceHash = generateSequenceHash(sequence);
  let sequenceCount = 0;

  // Simple scan for sequence occurrences
  for (let i = 0; i <= allEvents.length - sequence.length; i++) {
    const candidateSeq = allEvents.slice(i, i + sequence.length);
    if (generateSequenceHash(candidateSeq) === sequenceHash) {
      sequenceCount++;
    }
  }

  return Math.min(sequenceCount / firstEventCount, 1);
}

/**
 * Store detected patterns in database
 * Uses upsert to update existing patterns or insert new ones
 */
export async function storePatterns(
  supabase: SupabaseClient,
  patterns: Pattern[]
): Promise<number> {
  if (patterns.length === 0) return 0;

  const patternsToInsert = patterns.map(p => ({
    user_id: p.user_id,
    pattern_type: p.pattern_type,
    sequence: p.sequence,
    support: p.support,
    confidence: p.confidence,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  }));

  // Use upsert to handle existing patterns
  // onConflict specifies the unique constraint column(s)
  const { data, error } = await supabase
    .from('patterns')
    .upsert(patternsToInsert, {
      onConflict: 'user_id,sequence',
      ignoreDuplicates: false, // Update existing records
    })
    .select('id');

  if (error) {
    console.error('[PatternDetection] Error storing patterns:', error);
    return 0;
  }

  console.log(`[PatternDetection] Stored ${data?.length || 0} patterns`);
  return data?.length || 0;
}

