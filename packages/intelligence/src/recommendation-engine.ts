/**
 * Recommendation Engine
 * 
 * Generates actionable recommendations based on workflow analysis and insights.
 */

import type {
  Pattern,
  WorkflowStep,
  Recommendation,
} from './types';
import { describeWorkflow, optimizeWorkflow, estimateTimeFromPattern } from './workflow-analyzer';

/**
 * Generate recommendation for a pattern
 */
export function generateRecommendation(pattern: Pattern): Recommendation {
  const currentSteps = describeWorkflow(pattern.sequence);
  const suggestedSteps = optimizeWorkflow(currentSteps);
  
  const currentTime = estimateTimeFromPattern(pattern);
  const suggestedTime = suggestedSteps.reduce((sum, s) => sum + (s.time_estimate || 0), 0);
  const timeSaved = currentTime - suggestedTime;
  const stepsSaved = currentSteps.length - suggestedSteps.length;
  
  const currentApproach = describeCurrentApproach(currentSteps, pattern);
  const suggestedApproach = describeSuggestedApproach(suggestedSteps, pattern);
  const whyBetter = explainImprovement(currentSteps, suggestedSteps, pattern);
  
  return {
    title: generateTitle(pattern),
    description: `You perform this workflow ${pattern.support} times with an average of ${currentSteps.length} steps.`,
    current_approach: currentApproach,
    suggested_approach: suggestedApproach,
    why_better: whyBetter,
    time_saved: timeSaved,
    effort_saved: Math.min(stepsSaved, 10),
    confidence: pattern.confidence,
  };
}

/**
 * Generate a concise title for the recommendation
 */
function generateTitle(pattern: Pattern): string {
  if (pattern.inferred_goal) {
    return `Optimize: ${pattern.inferred_goal}`;
  }
  
  const domains = extractDomains(pattern.sequence);
  if (domains.length === 1) {
    return `Streamline ${domains[0]} workflow`;
  } else if (domains.length > 1) {
    return `Optimize multi-site workflow`;
  }
  
  return 'Workflow optimization available';
}

/**
 * Describe current approach
 */
function describeCurrentApproach(steps: WorkflowStep[], pattern: Pattern): string {
  const domains = extractDomains(pattern.sequence);
  const uniqueDomains = [...new Set(domains)];
  
  let description = `Currently, you:\n`;
  
  // Highlight key steps
  const keySteps = steps.filter(s => !s.is_redundant).slice(0, 5);
  keySteps.forEach(step => {
    description += `• ${step.action}`;
    if (step.domain && step.domain !== 'unknown') {
      description += ` on ${step.domain}`;
    }
    description += '\n';
  });
  
  if (steps.length > 5) {
    description += `• ... and ${steps.length - 5} more steps\n`;
  }
  
  // Add statistics
  const redundantCount = steps.filter(s => s.is_redundant).length;
  const frictionCount = steps.filter(s => s.is_friction).length;
  
  if (redundantCount > 0) {
    description += `\n⚠️ Includes ${redundantCount} redundant step${redundantCount > 1 ? 's' : ''}`;
  }
  if (frictionCount > 0) {
    description += `\n⚠️ Includes ${frictionCount} friction point${frictionCount > 1 ? 's' : ''}`;
  }
  
  return description;
}

/**
 * Describe suggested approach
 */
function describeSuggestedApproach(steps: WorkflowStep[], pattern: Pattern): string {
  let description = `Suggested approach:\n`;
  
  steps.forEach(step => {
    description += `• ${step.action}`;
    if (step.domain && step.domain !== 'unknown') {
      description += ` on ${step.domain}`;
    }
    description += '\n';
  });
  
  return description;
}

/**
 * Explain why the suggested approach is better
 */
export function explainImprovement(
  current: WorkflowStep[],
  suggested: WorkflowStep[],
  pattern?: Pattern
): string {
  const improvements: string[] = [];
  
  const stepsSaved = current.length - suggested.length;
  if (stepsSaved > 0) {
    improvements.push(`Eliminates ${stepsSaved} unnecessary step${stepsSaved > 1 ? 's' : ''}`);
  }
  
  const currentRedundant = current.filter(s => s.is_redundant).length;
  if (currentRedundant > 0) {
    improvements.push(`Removes ${currentRedundant} redundant action${currentRedundant > 1 ? 's' : ''}`);
  }
  
  const currentFriction = current.filter(s => s.is_friction).length;
  const suggestedFriction = suggested.filter(s => s.is_friction).length;
  if (currentFriction > suggestedFriction) {
    const frictionReduced = currentFriction - suggestedFriction;
    improvements.push(`Reduces ${frictionReduced} friction point${frictionReduced > 1 ? 's' : ''}`);
  }
  
  // Check for specific improvements
  const hasBackButton = current.some(s => s.action.includes('Go back'));
  if (hasBackButton && !suggested.some(s => s.action.includes('Go back'))) {
    improvements.push('Eliminates need for back button navigation');
  }
  
  const currentSearches = current.filter(s => s.action.includes('Search')).length;
  const suggestedSearches = suggested.filter(s => s.action.includes('Search')).length;
  if (currentSearches > suggestedSearches) {
    improvements.push('Uses more refined search queries to find information faster');
  }
  
  const currentForms = current.filter(s => s.action.includes('form')).length;
  const suggestedForms = suggested.filter(s => s.action.includes('form')).length;
  if (currentForms > 1 && suggestedForms <= 1) {
    improvements.push('Leverages browser autofill to speed up data entry');
  }
  
  if (improvements.length === 0) {
    return 'Streamlines the workflow for better efficiency.';
  }
  
  return improvements.join('. ') + '.';
}

/**
 * Calculate time saved estimate
 */
export function calculateTimeSaved(
  current: WorkflowStep[],
  suggested: WorkflowStep[]
): number {
  const currentTime = current.reduce((sum, s) => sum + (s.time_estimate || 0), 0);
  const suggestedTime = suggested.reduce((sum, s) => sum + (s.time_estimate || 0), 0);
  return Math.max(0, currentTime - suggestedTime);
}

/**
 * Extract unique domains from event sequence
 */
function extractDomains(sequence: any[]): string[] {
  return sequence.map(event => {
    try {
      const url = new URL(event.url);
      return url.hostname;
    } catch {
      return 'unknown';
    }
  }).filter(d => d !== 'unknown');
}

/**
 * Generate browser-specific recommendations
 */
export function generateBrowserTips(pattern: Pattern): string[] {
  const tips: string[] = [];
  const sequence = pattern.sequence;
  
  // Tab management tips
  const domains = extractDomains(sequence);
  const uniqueDomains = [...new Set(domains)];
  if (uniqueDomains.length >= 3 && pattern.support >= 5) {
    tips.push('💡 Tip: Pin these tabs or save as a browser workspace to access them quickly');
  }
  
  // Search tips
  const searches = sequence.filter((e: any) => 
    e.type === 'search' || e.semantic_context?.purpose === 'information_seeking'
  );
  if (searches.length >= 2) {
    tips.push('💡 Tip: Use advanced search operators like "site:" or quotes for exact matches to find information faster');
  }
  
  // Form filling tips
  const formFields = sequence.filter((e: any) => 
    e.type === 'form_field' || e.semantic_context?.purpose === 'form_submission'
  );
  if (formFields.length >= 2) {
    tips.push('💡 Tip: Enable browser autofill in Settings → Autofill to save time on forms');
  }
  
  // Bookmark tips
  if (pattern.support >= 10 && uniqueDomains.length <= 2) {
    tips.push('💡 Tip: Bookmark this workflow or create a keyboard shortcut for quick access');
  }
  
  // Extension recommendations
  if (pattern.goal_category === 'shopping') {
    tips.push('💡 Tip: Try a price comparison extension to check multiple sites automatically');
  }
  
  if (pattern.goal_category === 'research' || pattern.goal_category === 'learning') {
    tips.push('💡 Tip: Consider using a web clipper extension to save research in one place');
  }
  
  return tips;
}

/**
 * Generate keyboard shortcut recommendations
 */
export function generateKeyboardShortcuts(pattern: Pattern): string[] {
  const shortcuts: string[] = [];
  const sequence = pattern.sequence;
  
  const hasTabSwitching = sequence.some((e: any) => e.type === 'tab_switch');
  if (hasTabSwitching) {
    shortcuts.push('⌨️ Cmd+Tab (Mac) or Ctrl+Tab (Windows): Switch between tabs faster');
  }
  
  const hasBackButton = sequence.some((e: any) => 
    e.type === 'navigation' && e.metadata?.direction === 'back'
  );
  if (hasBackButton) {
    shortcuts.push('⌨️ Cmd+[ or Alt+← : Go back without clicking');
  }
  
  const hasSearch = sequence.some((e: any) => e.type === 'search');
  if (hasSearch) {
    shortcuts.push('⌨️ Cmd+L or Ctrl+L: Jump to address bar to search instantly');
  }
  
  return shortcuts;
}

