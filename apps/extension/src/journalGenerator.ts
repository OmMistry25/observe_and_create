/**
 * Daily Digital Journal Generator
 * 
 * Processes locally stored events to generate daily journal entries with:
 * - Top 5 domains visited
 * - Time spent by intent category
 * - Pattern summary log
 * - Custom productivity insights
 */

import { getDetectedPatterns } from './patternDetector';
import { getTemporalPatterns } from './temporalPatternDetector';

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  generated_at: string; // ISO timestamp
  
  // Domain stats
  top_domains: Array<{
    domain: string;
    visits: number;
    time_spent_ms: number;
  }>;
  
  // Intent breakdown
  intent_breakdown: Record<string, {
    count: number;
    time_spent_ms: number;
  }>;
  
  // Pattern summary
  pattern_summary: {
    frequency_patterns: Array<{
      description: string;
      confidence: number;
      occurrences: number;
    }>;
    temporal_patterns: Array<{
      type: string;
      description: string;
      confidence: number;
    }>;
  };
  
  // LLM-generated insights
  productivity_insights: string[];
  
  // Metadata
  total_events: number;
  active_time_ms: number;
  sessions: number;
}

/**
 * Calculate domain statistics from events
 */
export function calculateDomainStats(
  events: Array<{ url: string; domain?: string; client_timestamp?: number; local_timestamp?: string }>
): Array<{ domain: string; visits: number; time_spent_ms: number }> {
  const domainMap = new Map<string, { visits: number; timestamps: number[] }>();

  // Group events by domain
  for (const event of events) {
    let domain = event.domain;
    if (!domain) {
      try {
        domain = new URL(event.url).hostname;
      } catch {
        domain = 'unknown';
      }
    }

    const timestamp = event.client_timestamp || Date.parse(event.local_timestamp || '');
    
    if (!domainMap.has(domain)) {
      domainMap.set(domain, { visits: 0, timestamps: [] });
    }
    
    const stats = domainMap.get(domain)!;
    stats.visits++;
    stats.timestamps.push(timestamp);
  }

  // Calculate time spent (rough estimate based on event gaps)
  const domainStats: Array<{ domain: string; visits: number; time_spent_ms: number }> = [];
  
  for (const [domain, stats] of domainMap.entries()) {
    // Sort timestamps
    stats.timestamps.sort((a, b) => a - b);
    
    // Estimate time spent: sum gaps between consecutive events (capped at 5 min per gap)
    let timeSpent = 0;
    for (let i = 1; i < stats.timestamps.length; i++) {
      const gap = stats.timestamps[i] - stats.timestamps[i - 1];
      // Cap gap at 5 minutes to avoid idle time inflation
      timeSpent += Math.min(gap, 5 * 60 * 1000);
    }
    
    // Add base time for first event (30 seconds)
    timeSpent += 30 * 1000;
    
    domainStats.push({
      domain,
      visits: stats.visits,
      time_spent_ms: timeSpent,
    });
  }

  // Sort by time spent (descending) and return top 5
  return domainStats
    .sort((a, b) => b.time_spent_ms - a.time_spent_ms)
    .slice(0, 5);
}

/**
 * Calculate total active time from events
 */
export function calculateActiveTime(
  events: Array<{ client_timestamp?: number; local_timestamp?: string }>
): number {
  if (events.length === 0) return 0;

  const timestamps = events
    .map(e => e.client_timestamp || Date.parse(e.local_timestamp || ''))
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return 0;

  let totalTime = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    // Only count gaps under 5 minutes as active time
    if (gap < 5 * 60 * 1000) {
      totalTime += gap;
    }
  }

  // Add base time for last event
  totalTime += 30 * 1000;

  return totalTime;
}

/**
 * Group events into sessions (gaps > 30 min = new session)
 */
export function calculateSessions(
  events: Array<{ client_timestamp?: number; local_timestamp?: string }>
): number {
  if (events.length === 0) return 0;

  const timestamps = events
    .map(e => e.client_timestamp || Date.parse(e.local_timestamp || ''))
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);

  let sessions = 1;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    // Gap > 30 minutes = new session
    if (gap > 30 * 60 * 1000) {
      sessions++;
    }
  }

  return sessions;
}

/**
 * Summarize frequency patterns
 */
function summarizeFrequencyPatterns(): Array<{
  description: string;
  confidence: number;
  occurrences: number;
}> {
  const patterns = getDetectedPatterns();
  
  return patterns.map(pattern => ({
    description: pattern.sequence.map(e => e.type).join(' → '),
    confidence: pattern.confidence,
    occurrences: pattern.occurrences,
  }));
}

/**
 * Summarize temporal patterns
 */
function summarizeTemporalPatterns(): Array<{
  type: string;
  description: string;
  confidence: number;
}> {
  const patterns = getTemporalPatterns();
  
  return patterns.map(pattern => ({
    type: pattern.type,
    description: pattern.description,
    confidence: pattern.confidence,
  }));
}

/**
 * Generate journal entry from events
 */
export async function generateDailyJournal(
  events: Array<any>,
  date: string, // YYYY-MM-DD
  options: {
    classifyIntents?: boolean; // Whether to use LLM for intent classification
  } = {}
): Promise<JournalEntry> {
  console.log(`[JournalGenerator] Generating journal for ${date} with ${events.length} events`);

  // Calculate domain stats
  const topDomains = calculateDomainStats(events);
  console.log(`[JournalGenerator] Top domains:`, topDomains);

  // Intent classification
  let intentBreakdown: Record<string, { count: number; time_spent_ms: number }> = {};
  
  if (options.classifyIntents) {
    // Use LLM to classify events (via offscreen document)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLASSIFY_EVENTS_BATCH',
        events: events.map(e => ({
          id: e.id,
          type: e.type,
          url: e.url,
          title: e.title,
          domain: e.domain,
        })),
      });

      if (response.success) {
        // Build intent breakdown from classifications
        const classifications = response.classifications as Array<{
          id: string;
          category: string;
          confidence: number;
        }>;

        const intentMap = new Map<string, { events: any[]; count: number }>();
        
        for (const classification of classifications) {
          const event = events.find(e => e.id === classification.id);
          if (event) {
            if (!intentMap.has(classification.category)) {
              intentMap.set(classification.category, { events: [], count: 0 });
            }
            const intent = intentMap.get(classification.category)!;
            intent.events.push(event);
            intent.count++;
          }
        }

        // Calculate time spent per intent
        for (const [category, data] of intentMap.entries()) {
          const timeSpent = calculateActiveTime(data.events);
          intentBreakdown[category] = {
            count: data.count,
            time_spent_ms: timeSpent,
          };
        }
      }
    } catch (error) {
      console.warn('[JournalGenerator] Intent classification failed, skipping:', error);
    }
  } else {
    // Fallback: simple categorization by event type
    intentBreakdown = {
      navigation: { count: 0, time_spent_ms: 0 },
      interaction: { count: 0, time_spent_ms: 0 },
    };
    
    for (const event of events) {
      if (['nav', 'load'].includes(event.type)) {
        intentBreakdown.navigation.count++;
      } else {
        intentBreakdown.interaction.count++;
      }
    }
    
    const totalTime = calculateActiveTime(events);
    intentBreakdown.navigation.time_spent_ms = totalTime / 2;
    intentBreakdown.interaction.time_spent_ms = totalTime / 2;
  }

  // Pattern summaries
  const frequencyPatterns = summarizeFrequencyPatterns();
  const temporalPatterns = summarizeTemporalPatterns();

  console.log(`[JournalGenerator] Patterns: ${frequencyPatterns.length} frequency, ${temporalPatterns.length} temporal`);

  // Calculate metadata
  const totalEvents = events.length;
  const activeTime = calculateActiveTime(events);
  const sessions = calculateSessions(events);

  // Generate productivity insights using LLM
  let productivityInsights: string[] = [];
  
  if (options.classifyIntents) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_INSIGHTS',
        data: {
          topDomains: topDomains.map(d => ({
            domain: d.domain,
            visits: d.visits,
            timeSpent: d.time_spent_ms,
          })),
          intentBreakdown: Object.fromEntries(
            Object.entries(intentBreakdown).map(([k, v]) => [k, {
              count: v.count,
              timeSpent: v.time_spent_ms,
            }])
          ),
          patterns: [...frequencyPatterns, ...temporalPatterns].map(p => ({
            description: p.description,
            confidence: p.confidence,
          })),
          totalEvents,
          activeTime,
        },
      });

      if (response.success) {
        productivityInsights = response.insights;
      }
    } catch (error) {
      console.warn('[JournalGenerator] Insight generation failed, using fallbacks:', error);
      productivityInsights = generateFallbackInsights(topDomains, intentBreakdown, activeTime);
    }
  } else {
    productivityInsights = generateFallbackInsights(topDomains, intentBreakdown, activeTime);
  }

  console.log(`[JournalGenerator] Generated ${productivityInsights.length} insights`);

  // Build journal entry
  const journalEntry: JournalEntry = {
    id: `journal-${date}`,
    date,
    generated_at: new Date().toISOString(),
    top_domains: topDomains,
    intent_breakdown: intentBreakdown,
    pattern_summary: {
      frequency_patterns: frequencyPatterns,
      temporal_patterns: temporalPatterns,
    },
    productivity_insights: productivityInsights,
    total_events: totalEvents,
    active_time_ms: activeTime,
    sessions,
  };

  return journalEntry;
}

/**
 * Generate fallback insights without LLM
 */
function generateFallbackInsights(
  topDomains: Array<{ domain: string; visits: number; time_spent_ms: number }>,
  intentBreakdown: Record<string, { count: number; time_spent_ms: number }>,
  activeTime: number
): string[] {
  const insights: string[] = [];

  if (topDomains.length > 0) {
    const top = topDomains[0];
    const minutes = Math.round(top.time_spent_ms / 60000);
    insights.push(`You spent ${minutes} minutes on ${top.domain} - your most visited site today.`);
  }

  const activeHours = (activeTime / 3600000).toFixed(1);
  insights.push(`You were actively browsing for ${activeHours} hours today.`);

  const intents = Object.entries(intentBreakdown).sort((a, b) => b[1].time_spent_ms - a[1].time_spent_ms);
  if (intents.length > 0) {
    const topIntent = intents[0];
    const percentage = Math.round((topIntent[1].time_spent_ms / activeTime) * 100);
    insights.push(`${percentage}% of your time was spent on ${topIntent[0]} activities.`);
  }

  return insights;
}

/**
 * Save journal entry to IndexedDB
 */
export async function saveJournalEntry(entry: JournalEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ObserveCreateDB', 1);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('journals')) {
        db.createObjectStore('journals', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['journals'], 'readwrite');
      const store = transaction.objectStore('journals');
      
      const putRequest = store.put(entry);
      
      putRequest.onsuccess = () => {
        console.log(`[JournalGenerator] ✅ Saved journal entry: ${entry.id}`);
        resolve();
      };
      
      putRequest.onerror = () => reject(putRequest.error);
    };
  });
}

/**
 * Get journal entry for a specific date
 */
export async function getJournalEntry(date: string): Promise<JournalEntry | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ObserveCreateDB', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('journals')) {
        resolve(null);
        return;
      }

      const transaction = db.transaction(['journals'], 'readonly');
      const store = transaction.objectStore('journals');
      const getRequest = store.get(`journal-${date}`);
      
      getRequest.onsuccess = () => {
        resolve(getRequest.result || null);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    };
  });
}

/**
 * Get all journal entries
 */
export async function getAllJournalEntries(): Promise<JournalEntry[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ObserveCreateDB', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('journals')) {
        resolve([]);
        return;
      }

      const transaction = db.transaction(['journals'], 'readonly');
      const store = transaction.objectStore('journals');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        // Sort by date (newest first)
        const entries = (getAllRequest.result || []) as JournalEntry[];
        entries.sort((a, b) => b.date.localeCompare(a.date));
        resolve(entries);
      };
      
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

