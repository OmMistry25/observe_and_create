/**
 * Workflow Analyzer
 * 
 * Compares user workflows to optimal approaches and identifies improvement opportunities.
 */

import type {
  Pattern,
  Event,
  WorkflowComparison,
  WorkflowStep,
} from './types';

/**
 * Compare current workflow to an optimized version
 */
export function compareWorkflows(pattern: Pattern): WorkflowComparison {
  const currentSteps = describeWorkflow(pattern.sequence);
  const suggestedSteps = optimizeWorkflow(currentSteps);
  
  const currentTime = estimateTimeFromSteps(currentSteps);
  const suggestedTime = estimateTimeFromSteps(suggestedSteps);
  
  const currentFriction = countFrictionPoints(currentSteps);
  const suggestedFriction = countFrictionPoints(suggestedSteps);
  
  return {
    pattern_id: pattern.id,
    current: {
      steps: currentSteps,
      total_time: currentTime,
      total_steps: currentSteps.length,
      friction_points: currentFriction,
    },
    suggested: {
      steps: suggestedSteps,
      total_time: suggestedTime,
      total_steps: suggestedSteps.length,
      friction_points: suggestedFriction,
    },
    improvement: {
      steps_saved: currentSteps.length - suggestedSteps.length,
      time_saved: currentTime - suggestedTime,
      friction_reduced: currentFriction - suggestedFriction,
      efficiency_gain: ((currentTime - suggestedTime) / currentTime) * 100,
    },
    explanation: generateComparisonExplanation(currentSteps, suggestedSteps),
  };
}

/**
 * Convert event sequence to workflow steps with descriptions
 */
export function describeWorkflow(sequence: any[]): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  
  sequence.forEach((event, index) => {
    const domain = extractDomain(event.url);
    const purpose = event.semantic_context?.purpose || event.type;
    const pageType = event.semantic_context?.pageMetadata?.type;
    
    let action = '';
    
    // Describe the action based on event type and semantic context
    switch (event.type) {
      case 'click':
        action = `Click on ${event.tagName || 'element'}`;
        if (purpose === 'navigation') {
          action = `Navigate to new page`;
        } else if (purpose === 'purchase_intent') {
          action = `Click to purchase/checkout`;
        }
        break;
      case 'search':
        action = `Search for information`;
        break;
      case 'dwell':
        action = `Read/review content on ${domain}`;
        break;
      case 'scroll':
        action = `Scroll through page`;
        break;
      case 'form_field':
        action = `Fill out form field`;
        break;
      case 'navigation':
        action = event.metadata?.direction === 'back' 
          ? `Go back to previous page` 
          : `Navigate to ${domain}`;
        break;
      default:
        action = `${event.type} on ${domain}`;
    }
    
    // Detect if this is a redundant step
    const isRedundant = steps.some(s => 
      s.domain === domain && 
      s.action.includes(action.split(' ')[0])
    );
    
    // Detect friction indicators
    const isFriction = 
      event.type === 'friction' ||
      (event.metadata?.direction === 'back') ||
      purpose === 'form_submission' ||
      (event.semantic_context?.contentSignals?.hasForms && event.type === 'form_field');
    
    steps.push({
      step: index + 1,
      action,
      domain,
      purpose,
      time_estimate: estimateTimeFromEvent(event),
      is_redundant: isRedundant,
      is_friction: isFriction,
    });
  });
  
  return steps;
}

/**
 * Optimize workflow by removing redundant steps and suggesting improvements
 */
export function optimizeWorkflow(steps: WorkflowStep[]): WorkflowStep[] {
  const optimized: WorkflowStep[] = [];
  
  steps.forEach((step, index) => {
    // Skip redundant steps
    if (step.is_redundant) {
      return;
    }
    
    // Combine consecutive searches into one refined search
    if (step.action.includes('Search')) {
      const nextSearch = steps[index + 1];
      if (nextSearch && nextSearch.action.includes('Search')) {
        optimized.push({
          ...step,
          step: optimized.length + 1,
          action: 'Perform refined search with specific keywords',
          time_estimate: (step.time_estimate || 0) * 0.7, // More efficient
        });
        return;
      }
    }
    
    // Skip back button navigation
    if (step.action.includes('Go back')) {
      return;
    }
    
    // Combine multiple form fills into autofill
    if (step.action.includes('Fill out form')) {
      const formCount = steps.filter(s => s.action.includes('Fill out form')).length;
      if (formCount >= 2 && !optimized.some(s => s.action.includes('autofill'))) {
        optimized.push({
          ...step,
          step: optimized.length + 1,
          action: 'Use browser autofill for form',
          time_estimate: (step.time_estimate || 0) * 0.3, // Much faster
          is_friction: false,
        });
        return;
      } else if (formCount >= 2) {
        // Skip additional form fills if we already have autofill
        return;
      }
    }
    
    // Add the step
    optimized.push({
      ...step,
      step: optimized.length + 1,
    });
  });
  
  return optimized;
}

/**
 * Estimate time from pattern (sum of event times)
 */
export function estimateTimeFromPattern(pattern: Pattern): number {
  return estimateTimeFromSteps(describeWorkflow(pattern.sequence));
}

/**
 * Estimate time from workflow steps
 */
function estimateTimeFromSteps(steps: WorkflowStep[]): number {
  return steps.reduce((sum, step) => sum + (step.time_estimate || 0), 0);
}

/**
 * Estimate time for a single event (in seconds)
 */
function estimateTimeFromEvent(event: any): number {
  switch (event.type) {
    case 'click':
      return 2;
    case 'search':
      return 30;
    case 'dwell':
      return event.metadata?.dwell_ms 
        ? event.metadata.dwell_ms / 1000 
        : 15;
    case 'scroll':
      return 5;
    case 'form_field':
      return 10;
    case 'navigation':
      return event.metadata?.direction === 'back' ? 3 : 5;
    default:
      return 3;
  }
}

/**
 * Count friction points in workflow
 */
function countFrictionPoints(steps: WorkflowStep[]): number {
  return steps.filter(s => s.is_friction).length;
}

/**
 * Identify causes of friction in a workflow
 */
export function identifyFrictionCauses(pattern: Pattern): string[] {
  const causes: string[] = [];
  const sequence = pattern.sequence;
  
  // Back button usage
  const backCount = sequence.filter((e: any) => 
    e.type === 'navigation' && e.metadata?.direction === 'back'
  ).length;
  if (backCount >= 2) {
    causes.push(`Frequent back button usage (${backCount}x) suggests poor navigation flow`);
  }
  
  // Form abandonment
  const formAbandons = sequence.filter((e: any) => 
    e.type === 'friction' && e.metadata?.frictionType === 'form_abandon'
  ).length;
  if (formAbandons > 0) {
    causes.push(`Form abandonment detected (${formAbandons}x)`);
  }
  
  // Rage clicks
  const rageClicks = sequence.filter((e: any) => 
    e.type === 'friction' && e.metadata?.frictionType === 'rage_click'
  ).length;
  if (rageClicks > 0) {
    causes.push(`Rage clicking detected (${rageClicks}x) - element may not be responsive`);
  }
  
  // Slow loading
  const slowLoads = sequence.filter((e: any) => 
    e.type === 'friction' && e.metadata?.frictionType === 'slow_load'
  ).length;
  if (slowLoads > 0) {
    causes.push(`Slow page loads (${slowLoads}x) causing delays`);
  }
  
  // Rapid scrolling (looking for something)
  const rapidScrolls = sequence.filter((e: any) => 
    e.type === 'friction' && e.metadata?.frictionType === 'rapid_scroll'
  ).length;
  if (rapidScrolls > 0) {
    causes.push(`Rapid scrolling (${rapidScrolls}x) suggests difficulty finding content`);
  }
  
  return causes;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Generate explanation comparing workflows
 */
function generateComparisonExplanation(
  current: WorkflowStep[],
  suggested: WorkflowStep[]
): string {
  const stepsSaved = current.length - suggested.length;
  const redundantSteps = current.filter(s => s.is_redundant).length;
  const frictionSteps = current.filter(s => s.is_friction).length;
  
  let explanation = '';
  
  if (stepsSaved > 0) {
    explanation += `By eliminating ${stepsSaved} unnecessary step${stepsSaved > 1 ? 's' : ''}, `;
  }
  
  if (redundantSteps > 0) {
    explanation += `removing ${redundantSteps} redundant action${redundantSteps > 1 ? 's' : ''}, `;
  }
  
  if (frictionSteps > 0) {
    explanation += `and reducing ${frictionSteps} friction point${frictionSteps > 1 ? 's' : ''}, `;
  }
  
  explanation += 'you can complete this task more efficiently.';
  
  return explanation;
}

