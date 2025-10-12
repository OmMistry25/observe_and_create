/**
 * Template Matching Module (T16.1)
 * 
 * Matches user activity against pre-built workflow templates using:
 * 1. Sequence similarity (fuzzy matching)
 * 2. Event embedding similarity
 * 3. Confidence thresholds
 * 
 * Goal: Provide template suggestions even with sparse data (first week users)
 */

interface Event {
  id: string;
  type: string;
  domain?: string;
  url?: string;
  text?: string;
  tagName?: string;
  meta?: any;
  ts: number;
}

interface Template {
  id: string;
  name: string;
  description: string;
  template_pattern: {
    sequence: Array<{
      type?: string;
      domain_contains?: string;
      url_contains?: string;
      text_contains?: string;
      tagName?: string;
      min_dwell_ms?: number;
      url_change?: boolean;
      domain_change?: boolean;
      [key: string]: any;
    }>;
  };
  match_criteria: {
    min_support?: number;
    min_confidence?: number;
    fuzzy_match?: boolean;
    temporal_pattern?: string;
  };
  category: string;
  confidence_threshold: number;
}

interface TemplateMatch {
  template_id: string;
  template_name: string;
  category: string;
  confidence: number;
  matched_events: string[]; // Event IDs
  match_reason: string;
}

/**
 * Check if an event matches a template pattern step
 */
function eventMatchesPattern(event: Event, pattern: any): boolean {
  // Type match
  if (pattern.type && event.type !== pattern.type) {
    return false;
  }

  // Domain contains match
  if (pattern.domain_contains) {
    if (!event.domain || !event.domain.includes(pattern.domain_contains)) {
      return false;
    }
  }

  // URL contains match
  if (pattern.url_contains) {
    if (!event.url || !event.url.includes(pattern.url_contains)) {
      return false;
    }
  }

  // Text contains match
  if (pattern.text_contains) {
    if (!event.text || !event.text.toLowerCase().includes(pattern.text_contains.toLowerCase())) {
      return false;
    }
  }

  // Tag name match
  if (pattern.tagName && event.tagName !== pattern.tagName) {
    return false;
  }

  // Dwell time match
  if (pattern.min_dwell_ms && event.meta?.dwell_ms) {
    if (event.meta.dwell_ms < pattern.min_dwell_ms) {
      return false;
    }
  }

  return true;
}

/**
 * Find subsequences in user events that match template pattern
 */
function findMatchingSequences(events: Event[], template: Template): Array<Event[]> {
  const pattern = template.template_pattern.sequence;
  const matches: Array<Event[]> = [];

  // Sliding window approach
  for (let i = 0; i <= events.length - pattern.length; i++) {
    const window = events.slice(i, i + pattern.length);
    let matchCount = 0;

    for (let j = 0; j < pattern.length; j++) {
      if (eventMatchesPattern(window[j], pattern[j])) {
        matchCount++;
      }
    }

    // Fuzzy match: at least 70% of pattern must match
    const fuzzyThreshold = template.match_criteria.fuzzy_match ? 0.7 : 1.0;
    const matchRatio = matchCount / pattern.length;

    if (matchRatio >= fuzzyThreshold) {
      matches.push(window);
    }
  }

  return matches;
}

/**
 * Calculate confidence score for a template match
 */
function calculateConfidence(
  matchingSequences: Array<Event[]>,
  template: Template,
  totalEvents: number
): number {
  if (matchingSequences.length === 0) return 0;

  const support = matchingSequences.length; // How many times pattern appears
  const minSupport = template.match_criteria.min_support || 1;

  // Support score (0-1)
  const supportScore = Math.min(support / minSupport, 1.0);

  // Coverage score: how much of user's activity matches this template
  const eventsInMatches = matchingSequences.reduce((sum, seq) => sum + seq.length, 0);
  const coverageScore = Math.min(eventsInMatches / totalEvents, 1.0);

  // Combined confidence (weighted average)
  const confidence = (supportScore * 0.7) + (coverageScore * 0.3);

  return Number(confidence.toFixed(2));
}

/**
 * Match user events against all templates
 * 
 * @param events - User's recent events (last 7 days)
 * @param templates - All available templates
 * @returns Array of template matches sorted by confidence
 */
export function matchTemplates(events: Event[], templates: Template[]): TemplateMatch[] {
  const matches: TemplateMatch[] = [];

  for (const template of templates) {
    // Find matching sequences
    const matchingSequences = findMatchingSequences(events, template);

    if (matchingSequences.length > 0) {
      // Calculate confidence
      const confidence = calculateConfidence(matchingSequences, template, events.length);

      // Check if confidence meets threshold
      if (confidence >= template.confidence_threshold) {
        // Get IDs of matched events
        const matchedEventIds = new Set<string>();
        matchingSequences.forEach(seq => {
          seq.forEach(event => matchedEventIds.add(event.id));
        });

        matches.push({
          template_id: template.id,
          template_name: template.name,
          category: template.category,
          confidence,
          matched_events: Array.from(matchedEventIds),
          match_reason: `Found ${matchingSequences.length} matching sequences (${Math.round(confidence * 100)}% confidence)`,
        });
      }
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Get template suggestions for new users (day 1-7)
 * Uses more lenient matching for users with sparse data
 */
export function getTemplateSuggestionsForNewUsers(
  events: Event[],
  templates: Template[],
  userAgeInDays: number
): TemplateMatch[] {
  // For very new users (day 1-3), lower the confidence threshold
  const confidenceMultiplier = userAgeInDays <= 3 ? 0.5 : userAgeInDays <= 7 ? 0.7 : 1.0;

  // Adjust template thresholds
  const adjustedTemplates = templates.map(t => ({
    ...t,
    confidence_threshold: t.confidence_threshold * confidenceMultiplier,
    match_criteria: {
      ...t.match_criteria,
      min_support: Math.max(1, Math.floor((t.match_criteria.min_support || 3) * confidenceMultiplier)),
    },
  }));

  return matchTemplates(events, adjustedTemplates);
}

/**
 * Get top N template suggestions
 */
export function getTopTemplateSuggestions(
  events: Event[],
  templates: Template[],
  limit: number = 5
): TemplateMatch[] {
  const matches = matchTemplates(events, templates);
  return matches.slice(0, limit);
}

