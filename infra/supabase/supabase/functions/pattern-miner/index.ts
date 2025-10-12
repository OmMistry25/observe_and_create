// Supabase Edge Function for nightly pattern mining
// Run via pg_cron: SELECT cron.schedule('mine-patterns', '0 2 * * *', 'SELECT * FROM mine_patterns_for_all_users()');

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Event {
  id: string;
  user_id: string;
  type: string;
  url: string;
  text: string | null;
  ts: string;
  meta: any;
}

interface Pattern {
  sequence: string[];
  support: number;
  confidence: number;
  user_id: string;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Group events by contiguous sequences on same domain
 */
function groupByDomain(events: Event[]): Event[][] {
  if (events.length === 0) return [];

  const sequences: Event[][] = [];
  let currentSequence: Event[] = [events[0]];
  let currentDomain = extractDomain(events[0].url);

  for (let i = 1; i < events.length; i++) {
    const event = events[i];
    const domain = extractDomain(event.url);

    if (domain === currentDomain) {
      currentSequence.push(event);
    } else {
      if (currentSequence.length >= 3) {
        sequences.push(currentSequence);
      }
      currentSequence = [event];
      currentDomain = domain;
    }
  }

  // Don't forget the last sequence
  if (currentSequence.length >= 3) {
    sequences.push(currentSequence);
  }

  return sequences;
}

/**
 * Mine frequent patterns from event sequences
 */
function minePatterns(sequences: Event[][], minSupport: number = 3): Pattern[] {
  const patternCounts = new Map<string, { count: number; user_id: string }>();

  for (const sequence of sequences) {
    // Extract patterns of length 3-5
    for (let length = 3; length <= Math.min(5, sequence.length); length++) {
      for (let start = 0; start <= sequence.length - length; start++) {
        const pattern = sequence.slice(start, start + length);
        const key = pattern.map((e) => `${e.type}:${extractDomain(e.url)}`).join('->');

        if (!patternCounts.has(key)) {
          patternCounts.set(key, { count: 0, user_id: sequence[0].user_id });
        }
        const entry = patternCounts.get(key)!;
        entry.count += 1;
      }
    }
  }

  // Filter by support threshold
  const patterns: Pattern[] = [];
  for (const [key, { count, user_id }] of patternCounts) {
    if (count >= minSupport) {
      const sequence = key.split('->');
      // Confidence: frequency / total sequences
      const confidence = count / sequences.length;

      patterns.push({
        sequence,
        support: count,
        confidence: parseFloat(confidence.toFixed(3)),
        user_id,
      });
    }
  }

  // Sort by support (descending)
  patterns.sort((a, b) => b.support - a.support);

  return patterns;
}

/**
 * Store patterns in database
 */
async function storePatterns(supabase: any, patterns: Pattern[]): Promise<number> {
  let stored = 0;

  for (const pattern of patterns) {
    const { error } = await supabase.from('patterns').upsert({
      user_id: pattern.user_id,
      pattern_sequence: pattern.sequence,
      support: pattern.support,
      confidence: pattern.confidence,
      frequency: pattern.support,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    if (!error) {
      stored++;
    } else {
      console.error('[Pattern Miner] Error storing pattern:', error);
    }
  }

  return stored;
}

/**
 * Mine patterns for a single user
 */
async function minePatternsForUser(supabase: any, userId: string): Promise<number> {
  console.log(`[Pattern Miner] Mining patterns for user ${userId}`);

  // Fetch last 7 days of events
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: events, error } = await supabase
    .from('events')
    .select('id, user_id, type, url, text, ts, meta')
    .eq('user_id', userId)
    .gte('ts', sevenDaysAgo.toISOString())
    .order('ts', { ascending: true })
    .limit(10000);

  if (error) {
    console.error(`[Pattern Miner] Error fetching events for user ${userId}:`, error);
    return 0;
  }

  if (!events || events.length < 3) {
    console.log(`[Pattern Miner] Not enough events for user ${userId} (${events?.length || 0})`);
    return 0;
  }

  // Group by domain sequences
  const domainSequences = groupByDomain(events);
  console.log(`[Pattern Miner] Found ${domainSequences.length} domain sequences for user ${userId}`);

  // Mine patterns
  const patterns = minePatterns(domainSequences, 3);
  console.log(`[Pattern Miner] Mined ${patterns.length} patterns for user ${userId}`);

  // Store patterns
  const stored = await storePatterns(supabase, patterns);
  console.log(`[Pattern Miner] Stored ${stored} patterns for user ${userId}`);

  return stored;
}

/**
 * Main handler
 */
serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all users with events in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: users, error: usersError } = await supabase
      .from('events')
      .select('user_id')
      .gte('ts', sevenDaysAgo.toISOString())
      .then((res) => {
        if (res.error) return res;
        const uniqueUsers = Array.from(new Set(res.data.map((e: any) => e.user_id)));
        return { data: uniqueUsers, error: null };
      });

    if (usersError) {
      console.error('[Pattern Miner] Error fetching users:', usersError);
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Pattern Miner] Mining patterns for ${users.length} users`);

    let totalPatterns = 0;
    for (const userId of users) {
      const stored = await minePatternsForUser(supabase, userId);
      totalPatterns += stored;
    }

    return new Response(
      JSON.stringify({
        success: true,
        users_processed: users.length,
        patterns_stored: totalPatterns,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[Pattern Miner] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

