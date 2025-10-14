/**
 * Insight Generator
 * 
 * Analyzes patterns to generate actionable workflow insights and recommendations.
 * Focus: Understanding user behavior and suggesting improvements (not automation).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Pattern,
  Event,
  InteractionQuality,
  WorkflowInsight,
  InsightType,
  ImpactLevel,
  Evidence,
  InefficiencyInsight,
  AlternativeInsight,
} from './types';

/**
 * Enrich a pattern with semantic data from actual events
 * Patterns only store simplified sequences (type:domain), so we fetch the real events
 * to get semantic_context and other rich data for analysis
 */
async function enrichPatternWithSemanticData(
  supabase: SupabaseClient,
  pattern: Pattern,
  userId: string
): Promise<Pattern> {
  // Extract domains from the pattern sequence
  // Pattern sequences are already full event objects with url fields!
  const domains: string[] = [];
  
  if (Array.isArray(pattern.sequence)) {
    pattern.sequence.forEach((item: any) => {
      // Pattern events are already full objects with url field
      if (item && typeof item === 'object' && item.url) {
        try {
          const url = new URL(item.url);
          const domain = url.hostname.replace('www.', '');
          if (domain && !domains.includes(domain)) {
            domains.push(domain);
          }
        } catch (e) {
          // Invalid URL, skip
        }
      } else if (typeof item === 'string' && item.includes(':')) {
        // Fallback: old format "type:domain"
        const domain = item.split(':')[1];
        if (domain && !domains.includes(domain)) {
          domains.push(domain);
        }
      }
    });
  }

  if (domains.length === 0) {
    console.log(`[EnrichPattern] No domains found in pattern ${pattern.id?.slice(0, 8)}`);
    return pattern;
  }

  console.log(`[EnrichPattern] Extracting events for pattern ${pattern.id?.slice(0, 8)} with domains:`, domains.slice(0, 3));

  // The pattern sequence already contains full event objects, but they might not have semantic_context
  // So we need to fetch the same events with their semantic_context
  
  // Extract event IDs from the pattern sequence
  const eventIds = pattern.sequence
    .map((e: any) => e?.id)
    .filter(Boolean);

  if (eventIds.length === 0) {
    console.log(`[EnrichPattern] No event IDs in pattern ${pattern.id?.slice(0, 8)}, falling back to domain search`);
    
    // Fallback: fetch by domains using domain column
    const { data: events, error } = await supabase
      .from('events')
      .select('id, type, url, domain, text, ts, semantic_context, meta, dwell_ms, title')
      .eq('user_id', userId)
      .in('domain', domains)
      .not('semantic_context', 'is', null)
      .order('ts', { ascending: false })
      .limit(100);

    if (error || !events || events.length === 0) {
      console.log(`[EnrichPattern] No semantic events found for domains:`, domains);
      return pattern;
    }

    console.log(`[EnrichPattern] Found ${events.length} semantic events by domain`);
    return {
      ...pattern,
      semantic_enriched_sequence: events as any[],
    };
  }

  // Fetch the exact same events but with semantic_context
  const { data: events, error } = await supabase
    .from('events')
    .select('id, type, url, domain, text, ts, semantic_context, meta, dwell_ms, title')
    .in('id', eventIds)
    .not('semantic_context', 'is', null);

  if (error) {
    console.log(`[EnrichPattern] Error fetching semantic events:`, error);
    return pattern;
  }

  if (!events || events.length === 0) {
    console.log(`[EnrichPattern] Pattern ${pattern.id?.slice(0, 8)} events don't have semantic_context yet`);
    return pattern;
  }

  console.log(`[EnrichPattern] Enriched ${events.length}/${eventIds.length} events with semantic context for pattern ${pattern.id?.slice(0, 8)}`);

  // Return enriched pattern with semantic_enriched_sequence
  return {
    ...pattern,
    semantic_enriched_sequence: events as any[],
  };
}

/**
 * Generate insights for a specific user based on their patterns
 */
export async function generateInsights(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkflowInsight[]> {
  const insights: WorkflowInsight[] = [];

  // First, check total patterns
  const { count: totalCount } = await supabase
    .from('patterns')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`[InsightGenerator] User has ${totalCount} total patterns`);

  // Fetch user's patterns (very low threshold to capture all patterns)
  const { data: patterns, error: patternsError } = await supabase
    .from('patterns')
    .select('*')
    .eq('user_id', userId)
    .gte('support', 1)
    // No confidence filter - analyze all patterns regardless of confidence
    .order('support', { ascending: false })
    .limit(50);

  console.log(`[InsightGenerator] Fetched ${patterns?.length || 0} patterns for analysis`);

  if (patternsError || !patterns || patterns.length === 0) {
    console.log('[InsightGenerator] No patterns found for user:', userId);
    return insights;
  }

  console.log(`[InsightGenerator] Analyzing ${patterns.length} patterns for user ${userId}`);
  
  // Log first few patterns for debugging
  console.log(`[InsightGenerator] Sample patterns:`, patterns.slice(0, 3).map(p => ({
    id: p.id.slice(0, 8),
    support: p.support,
    confidence: p.confidence,
    sequence_length: p.sequence?.length || 0,
  })));

  // STEP 1: Enrich all patterns with semantic data from events
  console.log(`[InsightGenerator] Enriching patterns with semantic data...`);
  const enrichedPatterns = await Promise.all(
    patterns.map(p => enrichPatternWithSemanticData(supabase, p, userId))
  );
  
  const patternsWithSemantic = enrichedPatterns.filter(
    p => p.semantic_enriched_sequence && p.semantic_enriched_sequence.length > 0
  );
  
  console.log(`[InsightGenerator] ${patternsWithSemantic.length}/${patterns.length} patterns enriched with semantic data`);

  // STEP 2: Analyze each enriched pattern for inefficiencies and improvements
  for (const pattern of patternsWithSemantic) {
    // Check for inefficiencies (back button, repeated searches, etc.)
    const inefficiency = analyzeInefficiency(pattern);
    if (inefficiency) {
      const insight = await createInsightFromInefficiency(supabase, pattern, inefficiency);
      if (insight) {
        console.log(`[InsightGenerator] Found inefficiency: ${inefficiency.inefficiency_type}`);
        insights.push(insight);
      }
    }

    // Check for better alternatives (only for specific scenarios)
    const alternative = findBetterAlternative(pattern);
    if (alternative) {
      const insight = await createInsightFromAlternative(supabase, pattern, alternative);
      if (insight) {
        console.log(`[InsightGenerator] Found alternative approach`);
        insights.push(insight);
      }
    }

    // Check for high friction
    const frictionInsight = await analyzePatternFriction(supabase, pattern);
    if (frictionInsight) {
      console.log(`[InsightGenerator] Found high friction pattern`);
      insights.push(frictionInsight);
    }

    // Generate productivity insights for frequently used patterns
    if (pattern.support >= 5) {
      const productivityInsight = generateProductivityInsight(pattern);
      if (productivityInsight) {
        console.log(`[InsightGenerator] Generated productivity insight for frequent pattern`);
        insights.push(productivityInsight);
      }
    }
  }

  console.log(`[InsightGenerator] Generated ${insights.length} insights from ${patternsWithSemantic.length} semantic patterns`);
  return insights;
}

/**
 * Analyze a pattern for inefficiencies using semantic context
 */
export function analyzeInefficiency(pattern: Pattern): InefficiencyInsight | null {
  // Use enriched semantic sequence if available, otherwise fall back to original
  const sequence = pattern.semantic_enriched_sequence || pattern.sequence;
  
  if (!sequence || sequence.length < 2) {
    return null;
  }

  // 1. SEMANTIC: Detect quick bounces (left pages quickly without engaging)
  const quickBounces = sequence.filter((e: any) => {
    const sessionDuration = e.semantic_context?.journeyState?.sessionDuration;
    const scrollDepth = e.semantic_context?.journeyState?.scrollDepth;
    const interactionDepth = e.semantic_context?.journeyState?.interactionDepth;
    
    // Quick bounce = < 10 seconds, < 20% scroll, < 3 interactions
    return sessionDuration && sessionDuration < 10000 && 
           (scrollDepth || 0) < 20 && 
           (interactionDepth || 0) < 3;
  }).length;

  if (quickBounces >= 3) {
    return {
      pattern_id: pattern.id,
      inefficiency_type: 'repeated_searches',
      wasted_actions: quickBounces,
      wasted_time: quickBounces * 15,
      explanation: `You quickly bounce from ${quickBounces} pages without engaging (< 10s, minimal scroll). This suggests difficulty finding the right content or poor search results.`,
    };
  }

  // 2. SEMANTIC: Detect form abandonment with context
  const formPages = sequence.filter((e: any) => 
    e.semantic_context?.contentSignals?.hasForms
  );
  
  const formAbandonment = formPages.filter((e: any) => {
    const sessionDuration = e.semantic_context?.journeyState?.sessionDuration;
    const interactionDepth = e.semantic_context?.journeyState?.interactionDepth;
    const purpose = e.semantic_context?.purpose;
    
    // Abandonment = visited form page, some interactions, but left quickly without submitting
    return interactionDepth && interactionDepth > 3 && 
           sessionDuration && sessionDuration < 30000 &&
           purpose !== 'form_submission';
  }).length;

  if (formAbandonment >= 2) {
    return {
      pattern_id: pattern.id,
      inefficiency_type: 'form_refilling',
      wasted_actions: formAbandonment,
      wasted_time: formAbandonment * 20,
      explanation: `You started filling out forms ${formAbandonment} times but abandoned them quickly. Forms might be too complex, asking for too much information, or have unclear requirements.`,
    };
  }

  // 3. SEMANTIC: Detect shopping intent without conversion
  const shoppingPages = sequence.filter((e: any) => {
    const purpose = e.semantic_context?.purpose;
    const hasPricing = e.semantic_context?.contentSignals?.hasPricing;
    const pageType = e.semantic_context?.pageMetadata?.type;
    
    return purpose === 'purchase_intent' || hasPricing || pageType === 'product';
  });

  const checkoutPages = sequence.filter((e: any) =>
    e.semantic_context?.pageMetadata?.type === 'checkout'
  );

  if (shoppingPages.length >= 3 && checkoutPages.length === 0) {
    return {
      pattern_id: pattern.id,
      inefficiency_type: 'repeated_searches',
      wasted_actions: shoppingPages.length,
      wasted_time: shoppingPages.length * 30,
      explanation: `You viewed ${shoppingPages.length} product/pricing pages but didn't proceed to checkout. This might indicate comparison shopping, unclear pricing, or friction in the buying process.`,
    };
  }

  // 4. CLASSIC: Detect repeated navigation (back button usage)
  const backButtonCount = sequence.filter((e: any) => 
    e.type === 'navigation' && e.metadata?.direction === 'back'
  ).length;
  
  if (backButtonCount >= 3) {
    return {
      pattern_id: pattern.id,
      inefficiency_type: 'excessive_navigation',
      wasted_actions: backButtonCount,
      wasted_time: backButtonCount * 5,
      explanation: `You use the back button ${backButtonCount}x in this workflow, suggesting navigation could be optimized with better tab management or bookmarks.`,
    };
  }

  // 5. SEMANTIC: Detect repeated information seeking on same topic
  const infoSeekingEvents = sequence.filter((e: any) =>
    e.semantic_context?.purpose === 'information_seeking'
  );

  if (infoSeekingEvents.length >= 4) {
    return {
      pattern_id: pattern.id,
      inefficiency_type: 'repeated_searches',
      wasted_actions: infoSeekingEvents.length - 1,
      wasted_time: (infoSeekingEvents.length - 1) * 25,
      explanation: `You performed ${infoSeekingEvents.length} information-seeking actions. Try using more specific search terms, advanced operators (site:, "exact phrase"), or consult documentation directly.`,
    };
  }

  // Detect redundant steps (same domain visited multiple times)
  // BUT: Ignore workflows where alternating between 2-3 sites is the pattern
  // (e.g., Supabase <-> ChatGPT, GitHub <-> Documentation)
  const domains = sequence.map((e: any) => {
    try {
      const url = new URL(e.url);
      return url.hostname;
    } catch {
      return null;
    }
  }).filter(Boolean);
  
  const uniqueDomains = new Set(domains);
  const domainCount = domains.length;
  const uniqueCount = uniqueDomains.size;
  
  // Only flag as inefficient if:
  // 1. More than 5 total visits
  // 2. More than 3 unique domains (not just alternating between 2-3 sites)
  // 3. Significant redundancy (> 2x unique domains)
  if (domainCount > 5 && uniqueCount > 3 && domainCount > uniqueCount * 2) {
    const redundantVisits = domainCount - uniqueCount;
    return {
      pattern_id: pattern.id,
      inefficiency_type: 'redundant_steps',
      wasted_actions: redundantVisits,
      wasted_time: redundantVisits * 15,
      explanation: `You revisit ${uniqueCount} different sites ${redundantVisits} extra times in this workflow, suggesting scattered navigation.`,
    };
  }

  // If alternating between 2-3 sites, this is likely intentional work, not inefficiency
  return null;
}

/**
 * Find better alternatives for a workflow using semantic context
 */
export function findBetterAlternative(pattern: Pattern): AlternativeInsight | null {
  // Use enriched semantic sequence if available
  const sequence = pattern.semantic_enriched_sequence || pattern.sequence;
  const goal = pattern.inferred_goal;
  
  if (!sequence || sequence.length < 2) {
    return null;
  }

  // SEMANTIC: Deep reading detection - suggest read-later tools
  const deepReadingPages = sequence.filter((e: any) => {
    const scrollDepth = e.semantic_context?.journeyState?.scrollDepth;
    const sessionDuration = e.semantic_context?.journeyState?.sessionDuration;
    const pageType = e.semantic_context?.pageMetadata?.type;
    
    // Deep reading = scrolled > 60%, spent > 2 minutes, article/documentation
    return (scrollDepth || 0) > 60 && 
           (sessionDuration || 0) > 120000 &&
           (pageType === 'article' || pageType === 'documentation');
  }).length;

  if (deepReadingPages >= 2) {
    return {
      pattern_id: pattern.id,
      current_method: `Reading ${deepReadingPages} long articles in your browser`,
      better_method: 'Use a read-later service like Pocket, Instapaper, or Reader Mode',
      improvement_explanation: `You spend 2+ minutes deeply reading articles. Read-later services offer distraction-free reading, offline access, highlighting, and better typography for long-form content.`,
      confidence: 0.8,
    };
  }

  // SEMANTIC: Comparison shopping with pricing pages
  const pricingPages = sequence.filter((e: any) =>
    e.semantic_context?.contentSignals?.hasPricing || 
    e.semantic_context?.contentSignals?.hasComparison ||
    e.semantic_context?.pageMetadata?.type === 'product'
  ).length;

  if (pricingPages >= 3) {
    const domains = new Set(sequence.map((e: any) => {
      try {
        return new URL(e.url).hostname;
      } catch {
        return null;
      }
    })).size;

    return {
      pattern_id: pattern.id,
      current_method: `Manually comparing prices across ${domains} sites`,
      better_method: 'Use a price tracking extension like Honey, CamelCamelCamel, or Keepa',
      improvement_explanation: `You viewed ${pricingPages} pricing/product pages across multiple sites. Price trackers automatically compare prices, show price history, and alert you to deals.`,
      confidence: 0.85,
    };
  }

  // SEMANTIC: Work outside work hours
  const afterHoursWork = sequence.filter((e: any) => {
    const isWorkHours = e.semantic_context?.temporalContext?.isWorkHours;
    const category = e.semantic_context?.pageMetadata?.category;
    
    return isWorkHours === false && 
           (category === 'development' || category === 'professional' || category === 'productivity');
  }).length;

  if (afterHoursWork >= 3 && goal) {
    return {
      pattern_id: pattern.id,
      current_method: `Working on ${goal} outside of work hours`,
      better_method: 'Set work boundaries and use time-boxing',
      improvement_explanation: `You're doing work-related activities outside work hours ${afterHoursWork} times in this pattern. Consider setting browser profiles for work/personal, or using tools like RescueTime to enforce boundaries.`,
      confidence: 0.7,
    };
  }

  // CLASSIC: Research workflow improvements
  if (goal && (goal.toLowerCase().includes('research') || goal.toLowerCase().includes('learning'))) {
    const infoSeeking = sequence.filter((e: any) => 
      e.semantic_context?.purpose === 'information_seeking'
    ).length;
    
    if (infoSeeking >= 4) {
      return {
        pattern_id: pattern.id,
        current_method: `Searching and browsing multiple sources for information`,
        better_method: 'Use a research tool like Notion, Obsidian, or a web clipper',
        improvement_explanation: `You perform ${infoSeeking} information-seeking actions. A dedicated research tool helps you collect, organize, and connect information in one place, reducing context switching.`,
        confidence: 0.75,
      };
    }
  }

  // SEMANTIC: Form filling improvements - only if forms appear multiple times
  const formPages = sequence.filter((e: any) =>
    e.semantic_context?.contentSignals?.hasForms
  ).length;
  
  if (formPages >= 2 && pattern.support >= 2) {
    return {
      pattern_id: pattern.id,
      current_method: 'Manually filling out forms repeatedly',
      better_method: 'Enable browser autofill or use a password manager',
      improvement_explanation: `You encounter ${formPages} forms in this workflow, and repeat it ${pattern.support} times. Browser autofill or password managers with form-filling can save significant time.`,
      confidence: 0.75,
    };
  }

  return null;
}

/**
 * Analyze pattern for friction points
 */
async function analyzePatternFriction(
  supabase: SupabaseClient,
  pattern: Pattern
): Promise<WorkflowInsight | null> {
  // Use enriched sequence if available
  const sequence = pattern.semantic_enriched_sequence || pattern.sequence;
  const eventIds = sequence.map((e: any) => e.id).filter(Boolean);
  
  if (eventIds.length === 0) return null;

  // Fetch interaction quality data for these events
  const { data: qualityData } = await supabase
    .from('interaction_quality')
    .select('*')
    .in('event_id', eventIds);

  if (!qualityData || qualityData.length === 0) return null;

  const avgFriction = qualityData.reduce((sum, q) => sum + (q.friction_score || 0), 0) / qualityData.length;
  
  if (avgFriction >= 0.6) {
    const impact = calculateImpact(pattern);
    
    // Extract specific friction details from events
    const domains = new Set(sequence.map((e: any) => {
      try {
        return new URL(e.url).hostname.replace('www.', '');
      } catch {
        return e.domain || 'unknown';
      }
    }));
    
    const frictionTypes = qualityData
      .map(q => q.friction_types || [])
      .flat()
      .filter(Boolean);
    
    const frictionTypeCounts: Record<string, number> = {};
    frictionTypes.forEach(type => {
      frictionTypeCounts[type] = (frictionTypeCounts[type] || 0) + 1;
    });
    
    // Identify primary friction source
    const primaryFriction = Object.entries(frictionTypeCounts)
      .sort(([, a], [, b]) => b - a)[0];
    
    // Build specific description
    let specificDesc = `This workflow on **${Array.from(domains).join(', ')}** has an average friction score of **${(avgFriction * 100).toFixed(0)}%**.`;
    
    if (primaryFriction) {
      const [frictionType, count] = primaryFriction;
      const frictionDescriptions: Record<string, string> = {
        'rapid_scrolling': `You scrolled rapidly ${count} time(s), suggesting difficulty finding information`,
        'back_button': `You used the back button ${count} time(s), indicating navigation confusion`,
        'form_abandonment': `You abandoned forms ${count} time(s), suggesting frustration with data entry`,
        'error_state': `You encountered errors ${count} time(s)`,
        'slow_loading': `You experienced slow page loads ${count} time(s)`,
        'rage_clicks': `You clicked repeatedly on non-responsive elements ${count} time(s)`,
      };
      
      specificDesc += ` ${frictionDescriptions[frictionType] || `Detected ${frictionType} friction ${count} time(s)`}.`;
    }
    
    // Goal-specific recommendation
    let specificRec = 'Review this workflow to identify pain points.';
    if (pattern.inferred_goal) {
      specificRec = `Your goal was "${pattern.inferred_goal}". Consider alternative tools or approaches for this task.`;
    }
    
    return {
      id: `friction-${pattern.id}`,
      user_id: pattern.user_id,
      pattern_id: pattern.id,
      insight_type: 'friction_point',
      title: `⚠️ High Friction Detected`,
      description: specificDesc,
      recommendation: specificRec,
      impact_score: avgFriction * pattern.support,
      impact_level: impact,
      confidence: 0.85,
      evidence: {
        pattern_occurrences: pattern.support,
        total_time_spent: 0,
        friction_events: qualityData.filter(q => (q.friction_score || 0) > 0.7).length,
        supporting_events: eventIds,
        friction_breakdown: frictionTypeCounts,
      },
      status: 'new',
      created_at: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Create insight from inefficiency analysis
 */
async function createInsightFromInefficiency(
  supabase: SupabaseClient,
  pattern: Pattern,
  inefficiency: InefficiencyInsight
): Promise<WorkflowInsight | null> {
  const impact = calculateImpact(pattern);
  
  let title = '';
  let recommendation = '';
  
  switch (inefficiency.inefficiency_type) {
    case 'excessive_navigation':
      title = '🔄 Excessive Back Button Usage';
      recommendation = 'Consider using browser tabs or bookmarks to organize your workflow, reducing the need to navigate back and forth.';
      break;
    case 'repeated_searches':
      title = '🔍 Repeated Search Pattern';
      recommendation = 'Try refining your search queries or using site-specific search operators (e.g., "site:example.com") to find information faster.';
      break;
    case 'form_refilling':
      title = '📝 Repetitive Form Filling';
      recommendation = 'Enable browser autofill or use a password manager with form-filling capabilities to save time on repetitive data entry.';
      break;
    case 'redundant_steps':
      title = '🔁 Redundant Site Visits';
      recommendation = 'Consider pinning frequently visited tabs or using browser workspaces to keep relevant sites accessible without redundant navigation.';
      break;
  }

  return {
    id: `inefficiency-${pattern.id}`,
    user_id: pattern.user_id,
    pattern_id: pattern.id,
    insight_type: 'inefficient_navigation',
    title,
    description: inefficiency.explanation,
    recommendation,
    impact_score: (inefficiency.wasted_time / 60) * pattern.support, // minutes wasted
    impact_level: impact,
    confidence: 0.75,
    evidence: {
      pattern_occurrences: pattern.support,
      total_time_spent: inefficiency.wasted_time * pattern.support,
      friction_events: inefficiency.wasted_actions,
      supporting_events: pattern.sequence.map((e: any) => e.id).filter(Boolean),
    },
    time_saved_estimate: inefficiency.wasted_time,
    effort_saved_estimate: Math.min(inefficiency.wasted_actions, 10),
    status: 'new',
    created_at: new Date().toISOString(),
  };
}

/**
 * Create insight from alternative analysis
 */
async function createInsightFromAlternative(
  supabase: SupabaseClient,
  pattern: Pattern,
  alternative: AlternativeInsight
): Promise<WorkflowInsight | null> {
  const impact = calculateImpact(pattern);
  
  return {
    id: `alternative-${pattern.id}`,
    user_id: pattern.user_id,
    pattern_id: pattern.id,
    insight_type: 'better_alternative',
    title: '💡 Better Approach Available',
    description: `Current: ${alternative.current_method}`,
    recommendation: `Better: ${alternative.better_method}\n\n${alternative.improvement_explanation}`,
    impact_score: pattern.support * alternative.confidence,
    impact_level: impact,
    confidence: alternative.confidence,
    evidence: {
      pattern_occurrences: pattern.support,
      total_time_spent: 0,
      friction_events: 0,
      supporting_events: pattern.sequence.map((e: any) => e.id).filter(Boolean),
    },
    status: 'new',
    created_at: new Date().toISOString(),
  };
}

/**
 * Generate productivity insight for frequently used patterns
 * These are informational, not about problems
 */
function generateProductivityInsight(pattern: Pattern): WorkflowInsight | null {
  // Only generate for patterns with inferred goals
  if (!pattern.inferred_goal || !pattern.sequence || pattern.sequence.length < 2) {
    return null;
  }

  // Use enriched sequence if available
  const sequence = (pattern as any).semantic_enriched_sequence || pattern.sequence;

  const domains = new Set(sequence.map((e: any) => {
    try {
      return new URL(e.url).hostname.replace('www.', '');
    } catch {
      return e.domain || 'unknown';
    }
  }));

  const domainList = Array.from(domains).slice(0, 3).join(', ');
  
  // Build a workflow step description
  const stepDescriptions = sequence.slice(0, 3).map((e: any, idx: number) => {
    const stepNum = idx + 1;
    const actionType = e.type === 'click' ? 'Click' : e.type === 'nav' ? 'Navigate to' : e.type;
    const pageName = e.title ? `"${e.title.substring(0, 50)}${e.title.length > 50 ? '...' : ''}"` : 
                     e.domain || new URL(e.url).hostname.replace('www.', '');
    return `${stepNum}. ${actionType} ${pageName}`;
  }).join('\n');
  
  // Build specific description
  const specificDesc = `You perform this workflow **${pattern.support} time${pattern.support > 1 ? 's' : ''}** across ${domains.size} site${domains.size > 1 ? 's' : ''}: **${domainList}**${domains.size > 3 ? '...' : ''}.\n\n**Typical steps:**\n${stepDescriptions}${sequence.length > 3 ? `\n...and ${sequence.length - 3} more step${sequence.length - 3 > 1 ? 's' : ''}` : ''}`;
  
  // Build recommendation based on goal
  let specificRec = `This is a core part of your **${pattern.inferred_goal}** workflow. Consider:\n`;
  
  if (pattern.support >= 10) {
    specificRec += `• Creating a dedicated browser workspace for this frequent task\n`;
    specificRec += `• Setting up keyboard shortcuts to access these sites instantly\n`;
    specificRec += `• Bookmarking the exact pages you visit most often`;
  } else if (pattern.support >= 5) {
    specificRec += `• Pinning these tabs to save time on navigation\n`;
    specificRec += `• Bookmarking the starting point of this workflow\n`;
    specificRec += `• Grouping these sites in a bookmark folder for quick access`;
  } else {
    specificRec += `• Bookmarking these sites for easier access\n`;
    specificRec += `• Using browser history search to revisit this workflow quickly`;
  }
  
  return {
    id: `productivity-${pattern.id}`,
    user_id: pattern.user_id,
    pattern_id: pattern.id,
    insight_type: 'workflow_improvement',
    title: `📊 Frequent Workflow: ${pattern.inferred_goal}`,
    description: specificDesc,
    recommendation: specificRec,
    impact_score: pattern.support * 0.5,
    impact_level: pattern.support >= 10 ? 'medium' : 'low',
    confidence: pattern.confidence,
    evidence: {
      pattern_occurrences: pattern.support,
      total_time_spent: 0,
      friction_events: 0,
      supporting_events: sequence.map((e: any) => e.id).filter(Boolean),
      workflow_steps: stepDescriptions,
    },
    status: 'new',
    created_at: new Date().toISOString(),
  };
}

/**
 * Calculate impact level based on pattern support and time
 */
export function calculateImpact(pattern: Pattern): ImpactLevel {
  const support = pattern.support;
  const sequenceLength = pattern.sequence?.length || 0;
  
  // High impact: frequent pattern with many steps
  if (support >= 10 && sequenceLength >= 5) {
    return 'high';
  }
  
  // Medium impact: moderate frequency or moderate steps
  if (support >= 5 || sequenceLength >= 4) {
    return 'medium';
  }
  
  // Low impact: infrequent or simple
  return 'low';
}

