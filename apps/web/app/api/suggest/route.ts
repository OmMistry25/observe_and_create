import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * T19: Suggestion Generator
 * 
 * GET /api/suggest
 * 
 * Generate automation suggestions from user's patterns and templates
 * Returns candidates with name, description, confidence, and evidence
 */

interface AutomationSuggestion {
  id: string;
  source_type: 'pattern' | 'template';
  source_id: string;
  name: string;
  description: string;
  confidence: number;
  evidence: string;
  sequence: any[];
  created_at: string;
  metadata: {
    support?: number;
    pattern_type?: string;
    domains?: string[];
    temporal_info?: any;
    friction_score?: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse query params
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const minConfidence = parseFloat(searchParams.get('min_confidence') || '0.3'); // Lowered to 0.3 for demo

    // 3. Fetch user's patterns (high confidence patterns for suggestions)
    const { data: patterns, error: patternsError } = await supabase
      .from('patterns')
      .select('*')
      .eq('user_id', user.id)
      .gte('confidence', minConfidence)
      .gte('support', 3) // At least 3 occurrences (lowered for demo)
      .order('support', { ascending: false })
      .limit(limit * 2); // Fetch more than needed for filtering

    if (patternsError) {
      console.error('[Suggest] Error fetching patterns:', patternsError);
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 }
      );
    }

    console.log(`[Suggest] Found ${patterns?.length || 0} patterns for user ${user.id}`);
    if (patterns && patterns.length > 0) {
      console.log('[Suggest] Sample pattern:', JSON.stringify(patterns[0], null, 2));
    }

    // 4. Generate suggestions from patterns
    const suggestions: AutomationSuggestion[] = [];

    for (const pattern of patterns || []) {
      const suggestion = generatePatternSuggestion(pattern);
      if (suggestion && suggestion.confidence >= minConfidence) {
        suggestions.push(suggestion);
      }
    }

    // 5. Templates disabled - only show real detected patterns
    // Templates will be used for matching in the future, but not shown as suggestions
    // Users should only see automations based on their actual behavior

    // 6. Sort by confidence and limit
    suggestions.sort((a, b) => b.confidence - a.confidence);
    const topSuggestions = suggestions.slice(0, limit);

    console.log(`[Suggest] Generated ${topSuggestions.length} suggestions for user ${user.id}`);

    return NextResponse.json({
      success: true,
      suggestions: topSuggestions,
      count: topSuggestions.length,
    });
  } catch (error) {
    console.error('[Suggest] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate automation suggestion from a detected pattern
 */
function generatePatternSuggestion(pattern: any): AutomationSuggestion | null {
  if (!pattern.sequence || pattern.sequence.length === 0) {
    return null;
  }

  // Extract event types from sequence
  const eventTypes = pattern.sequence.map((e: any) => e.type);
  const uniqueTypes = [...new Set(eventTypes)];

  // Generate name based on sequence
  let name = 'Automate ';
  if (uniqueTypes.includes('click') && uniqueTypes.includes('form')) {
    name += 'form submission';
  } else if (uniqueTypes.includes('search')) {
    name += 'search workflow';
  } else if (uniqueTypes.includes('click')) {
    name += 'navigation pattern';
  } else {
    name += `${eventTypes.join(' → ')} workflow`;
  }

  // Generate description
  const description = `Detected ${pattern.sequence.length}-step workflow that you've repeated ${pattern.support} times with ${Math.round(pattern.confidence * 100)}% consistency`;

  // Generate evidence string
  const evidence = generateEvidence(pattern);

  // Extract domains from sequence
  const domains = [...new Set(
    pattern.sequence
      .map((e: any) => {
        try {
          return new URL(e.url).hostname;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  )];

  return {
    id: `pattern-${pattern.id}`,
    source_type: 'pattern',
    source_id: pattern.id,
    name,
    description,
    confidence: calculateSuggestionConfidence(pattern),
    evidence,
    sequence: pattern.sequence,
    created_at: pattern.created_at || new Date().toISOString(),
    metadata: {
      support: pattern.support,
      pattern_type: pattern.pattern_type,
      domains,
      temporal_info: pattern.temporal_pattern,
    },
  };
}

/**
 * Generate automation suggestion from a template
 */
async function generateTemplateSuggestion(
  supabase: any,
  userId: string,
  template: any
): Promise<AutomationSuggestion | null> {
  // Check if user has events matching this template's pattern
  // This is a simplified version - could be enhanced with fuzzy matching

  const { count, error } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('ts', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (error || !count || count < 10) {
    return null; // Not enough activity to suggest this template
  }

  return {
    id: `template-${template.id}`,
    source_type: 'template',
    source_id: template.id,
    name: template.name,
    description: template.description || `Common workflow template based on ${template.category}`,
    confidence: 0.6, // Lower confidence for templates than detected patterns
    evidence: `This is a common workflow in ${template.category}. You might benefit from automating it.`,
    sequence: template.pattern || [],
    created_at: new Date().toISOString(),
    metadata: {
      domains: template.domains || [],
    },
  };
}

/**
 * Calculate confidence score for a suggestion
 * Factors: pattern support, confidence, recency, friction
 */
function calculateSuggestionConfidence(pattern: any): number {
  let confidence = pattern.confidence || 0.5;

  // Boost confidence for high support (many occurrences)
  if (pattern.support >= 20) {
    confidence += 0.1;
  } else if (pattern.support >= 10) {
    confidence += 0.05;
  }

  // Boost confidence for recent patterns
  const patternAge = Date.now() - new Date(pattern.last_seen || pattern.created_at).getTime();
  const daysSinceLastSeen = patternAge / (1000 * 60 * 60 * 24);
  if (daysSinceLastSeen < 7) {
    confidence += 0.1;
  }

  // Boost confidence for temporal patterns (regular schedule)
  if (pattern.temporal_pattern) {
    confidence += 0.05;
  }

  // Cap at 1.0
  return Math.min(confidence, 1.0);
}

/**
 * Generate evidence string for a pattern
 */
function generateEvidence(pattern: any): string {
  const support = pattern.support || 0;
  const lastSeen = pattern.last_seen || pattern.created_at;

  // Calculate time range
  const firstSeen = new Date(pattern.first_seen || pattern.created_at);
  const lastSeenDate = new Date(lastSeen);
  const daysBetween = Math.ceil((lastSeenDate.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24));

  let evidence = `You've done this ${support} time${support > 1 ? 's' : ''}`;

  if (daysBetween > 0) {
    if (daysBetween === 1) {
      evidence += ' in the last day';
    } else if (daysBetween < 7) {
      evidence += ` in the last ${daysBetween} days`;
    } else if (daysBetween < 30) {
      const weeks = Math.floor(daysBetween / 7);
      evidence += ` in the last ${weeks} week${weeks > 1 ? 's' : ''}`;
    } else {
      const months = Math.floor(daysBetween / 30);
      evidence += ` in the last ${months} month${months > 1 ? 's' : ''}`;
    }
  }

  // Add temporal info if available
  if (pattern.temporal_pattern) {
    const temporal = pattern.temporal_pattern;
    if (temporal.recurrence_type === 'daily') {
      evidence += ', typically around the same time each day';
    } else if (temporal.recurrence_type === 'weekly') {
      evidence += ', typically on the same day each week';
    } else if (temporal.recurrence_type === 'specific_days' && temporal.day_of_week) {
      const daysMap: Record<number, string> = {
        0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
        4: 'Thursday', 5: 'Friday', 6: 'Saturday'
      };
      const dayNames = temporal.day_of_week.map((d: number) => daysMap[d]).join(', ');
      evidence += `, usually on ${dayNames}`;
    }
  }

  return evidence;
}

