/**
 * LEVEL 3: Goal Inference with OpenAI API
 * 
 * Analyzes event sequences to infer user goals and intent
 * Uses GPT-4 for semantic understanding with heuristic fallback
 */

import OpenAI from 'openai';

export interface EventSequence {
  events: Array<{
    type: string;
    timestamp: string;
    url: string;
    title: string;
    semantic_context?: {
      purpose?: string;
      pageMetadata?: {
        type?: string;
        category?: string;
        mainHeading?: string;
        keyEntities?: string[];
      };
      journeyState?: {
        sessionDuration?: number;
        scrollDepth?: number;
        interactionDepth?: number;
      };
      temporal?: {
        timeOfDay?: number;
        dayOfWeek?: number;
        isWorkHours?: boolean;
      };
      contentSignals?: {
        hasVideo?: boolean;
        hasImages?: boolean;
        hasForms?: boolean;
        hasPricing?: boolean;
        hasReviews?: boolean;
        hasComparison?: boolean;
      };
    };
  }>;
}

export interface InferredGoal {
  goal: string;                    // e.g., "price_comparison", "research_topic", "troubleshoot_issue"
  goal_category: string;            // "shopping", "learning", "productivity", "entertainment", "maintenance"
  confidence: number;               // 0-1
  reasoning: string;                // Why we think this is the goal
  automation_potential: number;     // 0-1, how automatable is this workflow?
}

/**
 * Infer user goal from event sequence using OpenAI GPT-4
 */
export async function inferGoalFromSequence(
  sequence: EventSequence,
  apiKey?: string
): Promise<InferredGoal> {
  // If no API key, fall back to heuristics
  if (!apiKey) {
    console.log('[GoalInference] No OpenAI API key, using heuristic fallback');
    return inferGoalHeuristic(sequence);
  }

  try {
    const openai = new OpenAI({ apiKey });

    // Prepare context summary for LLM
    const contextSummary = sequence.events.map((e, idx) => ({
      step: idx + 1,
      action: e.type,
      page_title: e.title,
      page_type: e.semantic_context?.pageMetadata?.type || 'unknown',
      page_category: e.semantic_context?.pageMetadata?.category || 'unknown',
      element_purpose: e.semantic_context?.purpose || 'unknown',
      main_heading: e.semantic_context?.pageMetadata?.mainHeading || '',
      time_of_day: e.semantic_context?.temporal?.timeOfDay,
      is_work_hours: e.semantic_context?.temporal?.isWorkHours,
      content_signals: e.semantic_context?.contentSignals,
      url_domain: extractDomain(e.url),
    }));

    const prompt = `You are analyzing a user's browsing behavior to understand their goal.

User Action Sequence:
${JSON.stringify(contextSummary, null, 2)}

Based on this sequence, determine:

1. **Primary Goal**: What is the user trying to accomplish? (1-3 words, lowercase with underscores)
   Examples: "price_comparison", "research_topic", "check_email", "troubleshoot_error", "book_flight", "status_monitoring"

2. **Goal Category**: Which category does this fall into?
   - shopping (purchasing products/services)
   - learning (educational, research, tutorials)
   - productivity (work tasks, communication, organization)
   - entertainment (media consumption, social)
   - maintenance (account management, updates, monitoring)

3. **Confidence**: How confident are you in this assessment? (0.0-1.0)
   Consider: consistency of actions, clarity of intent, pattern repetition
   - 0.9-1.0: Very clear pattern with consistent signals
   - 0.7-0.9: Strong indicators with minor ambiguity
   - 0.5-0.7: Reasonable inference but some uncertainty
   - 0.3-0.5: Weak signals, multiple interpretations possible
   - 0.0-0.3: Very unclear, mostly guessing

4. **Reasoning**: Why do you think this is the goal? (1-2 sentences, concise)

5. **Automation Potential**: How automatable is this workflow? (0.0-1.0)
   - 0.9-1.0: Highly repetitive, clear steps, deterministic (e.g., checking dashboard, form filling)
   - 0.7-0.9: Mostly automatable, few decisions (e.g., price comparison, status checks)
   - 0.5-0.7: Partially automatable, some human judgment (e.g., research with filtering)
   - 0.3-0.5: Limited automation, requires decisions (e.g., content discovery)
   - 0.0-0.3: Requires human judgment, creative work (e.g., writing, design)

Respond in JSON format (no markdown, just raw JSON):
{
  "goal": "...",
  "goal_category": "...",
  "confidence": 0.0,
  "reasoning": "...",
  "automation_potential": 0.0
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using gpt-4o-mini for cost efficiency
      messages: [{
        role: 'user',
        content: prompt
      }],
      temperature: 0.3, // Lower temperature for more consistent analysis
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Validate response
    if (!parsed.goal || !parsed.goal_category || typeof parsed.confidence !== 'number') {
      throw new Error('Invalid response format from OpenAI');
    }

    console.log(`[GoalInference] OpenAI inferred goal: ${parsed.goal} (confidence: ${parsed.confidence})`);
    
    return {
      goal: parsed.goal,
      goal_category: parsed.goal_category,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1), // Clamp 0-1
      reasoning: parsed.reasoning || 'OpenAI inference',
      automation_potential: Math.min(Math.max(parsed.automation_potential || 0.5, 0), 1),
    };

  } catch (error) {
    console.error('[GoalInference] OpenAI API error:', error);
    console.log('[GoalInference] Falling back to heuristic inference');
    return inferGoalHeuristic(sequence);
  }
}

/**
 * Heuristic-based goal inference (fallback)
 * Uses rule-based logic when OpenAI API is unavailable
 */
export function inferGoalHeuristic(sequence: EventSequence): InferredGoal {
  const events = sequence.events;
  
  // Extract characteristics
  const pageTypes = events.map(e => e.semantic_context?.pageMetadata?.type).filter(Boolean);
  const purposes = events.map(e => e.semantic_context?.purpose).filter(Boolean);
  const categories = events.map(e => e.semantic_context?.pageMetadata?.category).filter(Boolean);
  const urls = events.map(e => e.url);
  
  // Check for specific signals
  const hasSearch = events.some(e => e.type === 'search');
  const hasProduct = pageTypes.includes('product');
  const hasArticle = pageTypes.includes('article');
  const hasCheckout = pageTypes.includes('checkout');
  const hasDashboard = pageTypes.includes('dashboard');
  const hasCart = urls.some(url => url.includes('cart') || url.includes('shopping'));
  const hasPurchaseIntent = purposes.includes('purchase_intent');
  const hasComparison = purposes.includes('comparison_research');
  const hasInfoSeeking = purposes.includes('information_seeking');
  const stepCount = events.length;
  
  // Apply heuristic rules
  
  // SHOPPING: Product pages + purchase intent or cart/checkout
  if (hasProduct && (hasPurchaseIntent || hasCart || hasCheckout)) {
    return {
      goal: 'online_purchase',
      goal_category: 'shopping',
      confidence: 0.8,
      reasoning: 'Pattern includes product pages with purchase signals and/or cart/checkout steps',
      automation_potential: 0.7,
    };
  }
  
  // PRICE COMPARISON: Multiple product pages with comparison signals
  if (hasProduct && stepCount >= 3 && hasComparison) {
    return {
      goal: 'price_comparison',
      goal_category: 'shopping',
      confidence: 0.75,
      reasoning: 'Multiple product pages with comparison research signals',
      automation_potential: 0.8,
    };
  }
  
  // RESEARCH: Search + multiple articles
  if (hasSearch && hasArticle && stepCount >= 3) {
    return {
      goal: 'research_topic',
      goal_category: 'learning',
      confidence: 0.75,
      reasoning: 'Search followed by multiple article views indicates research behavior',
      automation_potential: 0.5,
    };
  }
  
  // CONTENT CONSUMPTION: Multiple article reads
  if (hasArticle && stepCount >= 2) {
    return {
      goal: 'content_consumption',
      goal_category: 'learning',
      confidence: 0.65,
      reasoning: 'Reading multiple articles suggests information gathering',
      automation_potential: 0.4,
    };
  }
  
  // STATUS MONITORING: Dashboard checks
  if (hasDashboard && stepCount >= 2) {
    return {
      goal: 'status_monitoring',
      goal_category: 'maintenance',
      confidence: 0.7,
      reasoning: 'Repeated dashboard visits indicate status checking behavior',
      automation_potential: 0.9,
    };
  }
  
  // NAVIGATION: Pure navigation pattern
  if (purposes.filter(p => p === 'navigation').length >= 3) {
    return {
      goal: 'site_navigation',
      goal_category: 'productivity',
      confidence: 0.6,
      reasoning: 'Consistent navigation pattern detected',
      automation_potential: 0.7,
    };
  }
  
  // SOCIAL INTERACTION
  if (purposes.includes('social_interaction')) {
    return {
      goal: 'social_engagement',
      goal_category: 'entertainment',
      confidence: 0.65,
      reasoning: 'Social interaction actions detected',
      automation_potential: 0.3,
    };
  }
  
  // FORM WORKFLOW
  if (purposes.includes('form_submission')) {
    return {
      goal: 'form_completion',
      goal_category: 'productivity',
      confidence: 0.7,
      reasoning: 'Form submission pattern indicates data entry workflow',
      automation_potential: 0.8,
    };
  }
  
  // INFORMATION SEEKING
  if (hasInfoSeeking || categories.includes('reference')) {
    return {
      goal: 'information_lookup',
      goal_category: 'learning',
      confidence: 0.6,
      reasoning: 'Information seeking behavior detected',
      automation_potential: 0.5,
    };
  }
  
  // DEFAULT: Unknown pattern
  return {
    goal: 'general_browsing',
    goal_category: 'unknown',
    confidence: 0.3,
    reasoning: 'No clear pattern detected from available signals',
    automation_potential: 0.2,
  };
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Calculate dwell time between events
 */
function calculateDwellTime(events: any[], currentIdx: number): number {
  if (currentIdx >= events.length - 1) return 0;
  const current = new Date(events[currentIdx].timestamp).getTime();
  const next = new Date(events[currentIdx + 1].timestamp).getTime();
  return Math.round((next - current) / 1000); // seconds
}

