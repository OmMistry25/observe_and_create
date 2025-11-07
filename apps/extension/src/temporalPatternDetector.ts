/**
 * Temporal Pattern Detector
 * 
 * Detects time-based behavioral patterns:
 * - Hourly patterns: "User checks email every hour"
 * - Daily patterns: "User browses news at 9am daily"
 * - Weekly patterns: "User does expense reports every Friday"
 * - Time-triggered sequences: "After checking Slack, user opens GitHub"
 * - Session patterns: "Morning sessions focus on code, afternoon on meetings"
 */

export interface TemporalEvent {
  id: string;
  type: string;
  url: string;
  domain: string;
  timestamp: string;
  client_timestamp: number;
  hour: number; // 0-23
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface TemporalPattern {
  id: string;
  type: 'hourly' | 'daily' | 'weekly' | 'time_triggered' | 'session';
  description: string;
  events: TemporalEvent[];
  occurrences: number;
  confidence: number; // 0-1
  schedule: {
    hours?: number[]; // Which hours (0-23)
    daysOfWeek?: number[]; // Which days (0-6)
    timeOfDay?: string[]; // morning/afternoon/evening/night
    avgInterval?: number; // Average time between occurrences (ms)
  };
  firstSeen: string;
  lastSeen: string;
  metadata?: any;
}

// Configuration
const MIN_OCCURRENCES = 3; // Need at least 3 occurrences to detect a pattern
const TIME_TOLERANCE_MS = 30 * 60 * 1000; // 30 minutes tolerance for "same time"
const WEEKLY_PATTERN_MIN_WEEKS = 2; // Need at least 2 weeks of data
const DAILY_PATTERN_MIN_DAYS = 3; // Need at least 3 days of data

// Storage
const eventHistory: TemporalEvent[] = [];
const detectedPatterns = new Map<string, TemporalPattern>();
const MAX_HISTORY = 1000; // Keep last 1000 events for analysis

/**
 * Add event to temporal analysis
 */
export function addTemporalEvent(event: any): TemporalPattern[] {
  const timestamp = new Date(event.local_timestamp || event.timestamp);
  
  const temporalEvent: TemporalEvent = {
    id: event.id,
    type: event.type,
    url: event.url,
    domain: event.domain || new URL(event.url).hostname,
    timestamp: timestamp.toISOString(),
    client_timestamp: event.client_timestamp || Date.now(),
    hour: timestamp.getHours(),
    dayOfWeek: timestamp.getDay(),
    timeOfDay: getTimeOfDay(timestamp.getHours()),
  };

  eventHistory.push(temporalEvent);

  // Trim history if too large
  if (eventHistory.length > MAX_HISTORY) {
    eventHistory.shift();
  }

  // Detect patterns
  const newPatterns: TemporalPattern[] = [];

  // Only analyze if we have enough data
  if (eventHistory.length >= MIN_OCCURRENCES) {
    newPatterns.push(...detectHourlyPatterns());
    newPatterns.push(...detectDailyPatterns());
    newPatterns.push(...detectWeeklyPatterns());
    newPatterns.push(...detectTimeTriggeredSequences());
    newPatterns.push(...detectSessionPatterns());
  }

  return newPatterns;
}

/**
 * Get time of day category
 */
function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Detect hourly patterns (e.g., "checks email every hour")
 */
function detectHourlyPatterns(): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const domainsByHour = new Map<string, Map<number, TemporalEvent[]>>();

  // Group events by domain and hour
  for (const event of eventHistory) {
    if (!domainsByHour.has(event.domain)) {
      domainsByHour.set(event.domain, new Map());
    }
    const hourMap = domainsByHour.get(event.domain)!;
    if (!hourMap.has(event.hour)) {
      hourMap.set(event.hour, []);
    }
    hourMap.get(event.hour)!.push(event);
  }

  // Look for domains visited consistently at specific hours
  for (const [domain, hourMap] of domainsByHour) {
    const consistentHours: number[] = [];
    
    for (const [hour, events] of hourMap) {
      if (events.length >= MIN_OCCURRENCES) {
        // Check if visits are spread across different days
        const uniqueDays = new Set(events.map(e => new Date(e.timestamp).toDateString()));
        if (uniqueDays.size >= DAILY_PATTERN_MIN_DAYS) {
          consistentHours.push(hour);
        }
      }
    }

    if (consistentHours.length > 0) {
      const allEvents = Array.from(hourMap.values()).flat();
      const patternId = `hourly-${domain}-${consistentHours.join('-')}`;
      
      const pattern: TemporalPattern = {
        id: patternId,
        type: 'hourly',
        description: `Visits ${domain} regularly at ${consistentHours.map(h => `${h}:00`).join(', ')}`,
        events: allEvents,
        occurrences: allEvents.length,
        confidence: Math.min(consistentHours.length / 8, 1), // More hours = higher confidence
        schedule: {
          hours: consistentHours,
        },
        firstSeen: allEvents[0].timestamp,
        lastSeen: allEvents[allEvents.length - 1].timestamp,
      };

      detectedPatterns.set(patternId, pattern);
      patterns.push(pattern);
    }
  }

  return patterns;
}

/**
 * Detect daily patterns (e.g., "browses news at 9am daily")
 */
function detectDailyPatterns(): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const domainsByTime = new Map<string, TemporalEvent[]>();

  // Group similar events by domain and approximate time
  for (const event of eventHistory) {
    const timeKey = `${event.domain}-${event.hour}`;
    if (!domainsByTime.has(timeKey)) {
      domainsByTime.set(timeKey, []);
    }
    domainsByTime.get(timeKey)!.push(event);
  }

  // Find patterns that occur on multiple different days
  for (const [timeKey, events] of domainsByTime) {
    if (events.length < MIN_OCCURRENCES) continue;

    const uniqueDays = new Set(events.map(e => new Date(e.timestamp).toDateString()));
    
    if (uniqueDays.size >= DAILY_PATTERN_MIN_DAYS) {
      const [domain, hour] = timeKey.split('-');
      const patternId = `daily-${domain}-${hour}`;

      // Calculate average interval between occurrences
      const sortedEvents = events.sort((a, b) => a.client_timestamp - b.client_timestamp);
      const intervals: number[] = [];
      for (let i = 1; i < sortedEvents.length; i++) {
        intervals.push(sortedEvents[i].client_timestamp - sortedEvents[i - 1].client_timestamp);
      }
      const avgInterval = intervals.length > 0 
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
        : 0;

      const pattern: TemporalPattern = {
        id: patternId,
        type: 'daily',
        description: `Daily routine: Visits ${domain} around ${hour}:00`,
        events: sortedEvents,
        occurrences: events.length,
        confidence: Math.min(uniqueDays.size / 7, 1), // More unique days = higher confidence
        schedule: {
          hours: [parseInt(hour)],
          avgInterval,
        },
        firstSeen: sortedEvents[0].timestamp,
        lastSeen: sortedEvents[sortedEvents.length - 1].timestamp,
      };

      detectedPatterns.set(patternId, pattern);
      patterns.push(pattern);
    }
  }

  return patterns;
}

/**
 * Detect weekly patterns (e.g., "does expense reports every Friday")
 */
function detectWeeklyPatterns(): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const domainsByDayOfWeek = new Map<string, Map<number, TemporalEvent[]>>();

  // Group events by domain and day of week
  for (const event of eventHistory) {
    if (!domainsByDayOfWeek.has(event.domain)) {
      domainsByDayOfWeek.set(event.domain, new Map());
    }
    const dayMap = domainsByDayOfWeek.get(event.domain)!;
    if (!dayMap.has(event.dayOfWeek)) {
      dayMap.set(event.dayOfWeek, []);
    }
    dayMap.get(event.dayOfWeek)!.push(event);
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Look for domains visited consistently on specific days
  for (const [domain, dayMap] of domainsByDayOfWeek) {
    for (const [dayOfWeek, events] of dayMap) {
      if (events.length < MIN_OCCURRENCES) continue;

      // Check if visits span multiple weeks
      const uniqueWeeks = new Set(events.map(e => {
        const d = new Date(e.timestamp);
        return `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;
      }));

      if (uniqueWeeks.size >= WEEKLY_PATTERN_MIN_WEEKS) {
        const patternId = `weekly-${domain}-${dayOfWeek}`;
        
        const pattern: TemporalPattern = {
          id: patternId,
          type: 'weekly',
          description: `Weekly routine: Visits ${domain} on ${dayNames[dayOfWeek]}s`,
          events: events,
          occurrences: events.length,
          confidence: Math.min(uniqueWeeks.size / 4, 1), // 4+ weeks = max confidence
          schedule: {
            daysOfWeek: [dayOfWeek],
          },
          firstSeen: events[0].timestamp,
          lastSeen: events[events.length - 1].timestamp,
        };

        detectedPatterns.set(patternId, pattern);
        patterns.push(pattern);
      }
    }
  }

  return patterns;
}

/**
 * Detect time-triggered sequences (e.g., "after Slack, opens GitHub")
 */
function detectTimeTriggeredSequences(): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const TRIGGER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  // Look for domain pairs that frequently occur within a time window
  const sequenceCounts = new Map<string, { events: [TemporalEvent, TemporalEvent][], count: number }>();

  for (let i = 0; i < eventHistory.length - 1; i++) {
    const event1 = eventHistory[i];
    const event2 = eventHistory[i + 1];

    const timeDiff = event2.client_timestamp - event1.client_timestamp;
    
    // If second event happens within trigger window
    if (timeDiff > 0 && timeDiff <= TRIGGER_WINDOW_MS && event1.domain !== event2.domain) {
      const sequenceKey = `${event1.domain}->${event2.domain}`;
      
      if (!sequenceCounts.has(sequenceKey)) {
        sequenceCounts.set(sequenceKey, { events: [], count: 0 });
      }
      
      const seq = sequenceCounts.get(sequenceKey)!;
      seq.events.push([event1, event2]);
      seq.count++;
    }
  }

  // Find significant sequences
  for (const [sequenceKey, data] of sequenceCounts) {
    if (data.count >= MIN_OCCURRENCES) {
      const [trigger, target] = sequenceKey.split('->');
      const patternId = `triggered-${trigger}-${target}`;
      
      const allEvents = data.events.flat();
      const avgInterval = data.events.reduce((sum, [e1, e2]) => 
        sum + (e2.client_timestamp - e1.client_timestamp), 0) / data.count;

      const pattern: TemporalPattern = {
        id: patternId,
        type: 'time_triggered',
        description: `After visiting ${trigger}, usually visits ${target} within ${Math.round(avgInterval / 60000)} minutes`,
        events: allEvents,
        occurrences: data.count,
        confidence: Math.min(data.count / 10, 1),
        schedule: {
          avgInterval,
        },
        firstSeen: allEvents[0].timestamp,
        lastSeen: allEvents[allEvents.length - 1].timestamp,
        metadata: {
          trigger,
          target,
        },
      };

      detectedPatterns.set(patternId, pattern);
      patterns.push(pattern);
    }
  }

  return patterns;
}

/**
 * Detect session patterns (e.g., "morning sessions focus on code, afternoon on meetings")
 */
function detectSessionPatterns(): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const sessionsByTimeOfDay = new Map<string, Map<string, TemporalEvent[]>>();

  // Group events by time of day and domain
  for (const event of eventHistory) {
    if (!sessionsByTimeOfDay.has(event.timeOfDay)) {
      sessionsByTimeOfDay.set(event.timeOfDay, new Map());
    }
    const domainMap = sessionsByTimeOfDay.get(event.timeOfDay)!;
    if (!domainMap.has(event.domain)) {
      domainMap.set(event.domain, []);
    }
    domainMap.get(event.domain)!.push(event);
  }

  // Find dominant domains for each time of day
  for (const [timeOfDay, domainMap] of sessionsByTimeOfDay) {
    const sortedDomains = Array.from(domainMap.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3); // Top 3 domains

    if (sortedDomains.length > 0 && sortedDomains[0][1].length >= MIN_OCCURRENCES) {
      const topDomains = sortedDomains.map(([domain]) => domain);
      const allEvents = sortedDomains.flatMap(([, events]) => events);
      const patternId = `session-${timeOfDay}-${topDomains.join('-')}`;

      const pattern: TemporalPattern = {
        id: patternId,
        type: 'session',
        description: `${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} sessions focus on: ${topDomains.join(', ')}`,
        events: allEvents,
        occurrences: allEvents.length,
        confidence: Math.min(allEvents.length / 20, 1),
        schedule: {
          timeOfDay: [timeOfDay],
        },
        firstSeen: allEvents[0].timestamp,
        lastSeen: allEvents[allEvents.length - 1].timestamp,
        metadata: {
          topDomains,
        },
      };

      detectedPatterns.set(patternId, pattern);
      patterns.push(pattern);
    }
  }

  return patterns;
}

/**
 * Get all detected temporal patterns
 */
export function getTemporalPatterns(): TemporalPattern[] {
  return Array.from(detectedPatterns.values())
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get patterns by type
 */
export function getPatternsByType(type: TemporalPattern['type']): TemporalPattern[] {
  return Array.from(detectedPatterns.values())
    .filter(p => p.type === type)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get high-confidence patterns (>0.7)
 */
export function getHighConfidenceTemporalPatterns(): TemporalPattern[] {
  return Array.from(detectedPatterns.values())
    .filter(p => p.confidence >= 0.7)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Clear all temporal patterns
 */
export function clearTemporalPatterns(): void {
  detectedPatterns.clear();
  eventHistory.length = 0;
}

/**
 * Get statistics
 */
export function getTemporalStats(): {
  totalEvents: number;
  totalPatterns: number;
  byType: Record<string, number>;
  avgConfidence: number;
} {
  const patterns = Array.from(detectedPatterns.values());
  const byType: Record<string, number> = {
    hourly: 0,
    daily: 0,
    weekly: 0,
    time_triggered: 0,
    session: 0,
  };

  patterns.forEach(p => {
    byType[p.type]++;
  });

  const avgConfidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;

  return {
    totalEvents: eventHistory.length,
    totalPatterns: patterns.length,
    byType,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
  };
}

