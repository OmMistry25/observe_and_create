/**
 * Connection Detector
 * 
 * Finds relationships and connections between patterns to understand
 * user workflows and behavioral chains.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Pattern,
  Connection,
  SequentialConnection,
  TriggerConnection,
  ParallelConnection,
} from './types';

/**
 * Detect all types of connections between patterns
 */
export async function detectConnections(
  supabase: SupabaseClient,
  userId: string
): Promise<Connection[]> {
  const { data: patterns, error } = await supabase
    .from('patterns')
    .select('*')
    .eq('user_id', userId)
    .gte('support', 3)
    .order('last_seen', { ascending: false })
    .limit(100);

  if (error || !patterns || patterns.length < 2) {
    console.log('[ConnectionDetector] Not enough patterns to detect connections');
    return [];
  }

  const connections: Connection[] = [];

  // Detect sequential patterns (A always followed by B)
  const sequential = findSequentialPatterns(patterns);
  connections.push(...sequential);

  // Detect trigger patterns (A triggers B)
  const triggers = findTriggerPatterns(patterns);
  connections.push(...triggers);

  // Detect parallel patterns (A and B achieve same goal differently)
  const parallel = findParallelApproaches(patterns);
  connections.push(...parallel);

  console.log(`[ConnectionDetector] Found ${connections.length} connections between patterns`);
  return connections;
}

/**
 * Find patterns that always occur in sequence
 */
export function findSequentialPatterns(patterns: Pattern[]): SequentialConnection[] {
  const connections: SequentialConnection[] = [];

  // Compare patterns by time proximity
  for (let i = 0; i < patterns.length - 1; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const patternA = patterns[i];
      const patternB = patterns[j];

      // Check if patterns have temporal relationship
      const timeProximity = analyzeTimeProximity(patternA, patternB);
      
      if (timeProximity.avgGapSeconds < 300 && timeProximity.occurrences >= 3) {
        // Patterns occur within 5 minutes of each other frequently
        connections.push({
          type: 'sequential',
          patterns: [patternA.id, patternB.id],
          sequence: [patternA.id, patternB.id],
          relationship: `"${describePattern(patternA)}" is typically followed by "${describePattern(patternB)}"`,
          confidence: Math.min(timeProximity.occurrences / patternA.support, 1),
          always_in_order: timeProximity.occurrences >= patternA.support * 0.8,
          evidence: {
            co_occurrence_count: timeProximity.occurrences,
            time_proximity_avg: timeProximity.avgGapSeconds,
          },
        });
      }
    }
  }

  return connections;
}

/**
 * Find trigger-response relationships (A frequently triggers B)
 */
export function findTriggerPatterns(patterns: Pattern[]): TriggerConnection[] {
  const connections: TriggerConnection[] = [];

  for (let i = 0; i < patterns.length - 1; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const triggerPattern = patterns[i];
      const responsePattern = patterns[j];

      // Check if trigger pattern's last event is close to response pattern's first event
      const timeProximity = analyzeTimeProximity(triggerPattern, responsePattern);
      
      // Calculate probability of B happening after A
      const triggerProbability = timeProximity.occurrences / triggerPattern.support;
      
      if (triggerProbability >= 0.6 && timeProximity.occurrences >= 3) {
        connections.push({
          type: 'trigger',
          patterns: [triggerPattern.id, responsePattern.id],
          trigger_pattern: triggerPattern.id,
          response_pattern: responsePattern.id,
          relationship: `"${describePattern(triggerPattern)}" triggers "${describePattern(responsePattern)}" ${(triggerProbability * 100).toFixed(0)}% of the time`,
          confidence: triggerProbability,
          trigger_probability: triggerProbability,
          evidence: {
            co_occurrence_count: timeProximity.occurrences,
            time_proximity_avg: timeProximity.avgGapSeconds,
          },
        });
      }
    }
  }

  return connections;
}

/**
 * Find patterns that achieve the same goal through different approaches
 */
export function findParallelApproaches(patterns: Pattern[]): ParallelConnection[] {
  const connections: ParallelConnection[] = [];

  // Group patterns by inferred goal
  const goalGroups = new Map<string, Pattern[]>();
  
  patterns.forEach(pattern => {
    if (pattern.inferred_goal) {
      const goal = pattern.inferred_goal.toLowerCase();
      if (!goalGroups.has(goal)) {
        goalGroups.set(goal, []);
      }
      goalGroups.get(goal)!.push(pattern);
    }
  });

  // Find groups with multiple approaches to the same goal
  goalGroups.forEach((patternsInGroup, goal) => {
    if (patternsInGroup.length >= 2) {
      // Sort by efficiency (confidence * support, lower is more inconsistent)
      const sorted = [...patternsInGroup].sort((a, b) => 
        (b.confidence * b.support) - (a.confidence * a.support)
      );

      const preferred = sorted[0]; // Most consistent/frequent
      const alternatives = sorted.slice(1);

      alternatives.forEach(alt => {
        connections.push({
          type: 'parallel',
          patterns: [preferred.id, alt.id],
          relationship: `Both achieve "${goal}" but through different methods`,
          confidence: 0.8,
          same_goal: true,
          preferred_pattern: preferred.id,
          evidence: {
            co_occurrence_count: 0, // They don't co-occur, they're alternatives
            time_proximity_avg: 0,
          },
        });
      });
    }
  });

  return connections;
}

/**
 * Analyze time proximity between two patterns
 */
function analyzeTimeProximity(
  patternA: Pattern,
  patternB: Pattern
): { avgGapSeconds: number; occurrences: number } {
  // Get last event time of pattern A and first event time of pattern B
  const lastA = new Date(patternA.last_seen).getTime();
  const firstB = new Date(patternB.first_seen).getTime();
  
  // Simple heuristic: if B started close to when A was last seen
  const gapSeconds = Math.abs(firstB - lastA) / 1000;
  
  // Estimate occurrences based on support overlap
  const minSupport = Math.min(patternA.support, patternB.support);
  const occurrences = Math.floor(minSupport * 0.7); // Estimate 70% overlap
  
  return {
    avgGapSeconds: gapSeconds,
    occurrences,
  };
}

/**
 * Generate human-readable description of a pattern
 */
function describePattern(pattern: Pattern): string {
  if (pattern.inferred_goal) {
    return pattern.inferred_goal;
  }
  
  // Fallback: describe by sequence
  const sequence = pattern.sequence;
  if (!sequence || sequence.length === 0) {
    return 'Unknown workflow';
  }
  
  const eventTypes = sequence.map((e: any) => e.type);
  const uniqueTypes = [...new Set(eventTypes)];
  
  if (uniqueTypes.length === 1) {
    return `${uniqueTypes[0]} workflow`;
  }
  
  return `${uniqueTypes.slice(0, 3).join(' → ')} workflow`;
}

/**
 * Find workflows that always happen together (composite workflows)
 */
export function findCompositeWorkflows(
  patterns: Pattern[]
): { workflow: Pattern[]; description: string; frequency: number }[] {
  const composites: { workflow: Pattern[]; description: string; frequency: number }[] = [];
  
  // Look for patterns with the same goal category that occur together
  const categoryGroups = new Map<string, Pattern[]>();
  
  patterns.forEach(pattern => {
    const category = pattern.goal_category || 'unknown';
    if (!categoryGroups.has(category)) {
      categoryGroups.set(category, []);
    }
    categoryGroups.get(category)!.push(pattern);
  });
  
  categoryGroups.forEach((patternsInCategory, category) => {
    if (patternsInCategory.length >= 2) {
      const avgSupport = patternsInCategory.reduce((sum, p) => sum + p.support, 0) / patternsInCategory.length;
      
      composites.push({
        workflow: patternsInCategory,
        description: `${category} workflow with ${patternsInCategory.length} related patterns`,
        frequency: Math.floor(avgSupport),
      });
    }
  });
  
  return composites;
}

