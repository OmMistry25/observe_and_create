/**
 * Intelligence Package Types
 * Core type definitions for workflow insights and recommendations
 */

export interface Pattern {
  id: string;
  user_id: string;
  sequence: any[];
  support: number;
  confidence: number;
  first_seen: string;
  last_seen: string;
  inferred_goal?: string | null;
  goal_confidence?: number | null;
  goal_category?: string | null;
  automation_potential?: number | null;
  goal_reasoning?: string | null;
  temporal_pattern?: any;
  cluster_id?: number | null;
  // Enriched with actual event data including semantic context
  semantic_enriched_sequence?: any[];
}

export interface Event {
  id: string;
  user_id: string;
  type: string;
  url: string;
  title: string;
  timestamp: string;
  metadata: any;
  semantic_context?: {
    purpose?: string;
    pageMetadata?: {
      type?: string;
      category?: string;
      heading?: string;
      description?: string;
    };
    journeyState?: {
      sessionDuration?: number;
      scrollDepth?: number;
      interactionDepth?: number;
      previousPages?: string[];
    };
    temporalContext?: {
      timeOfDay?: string;
      dayOfWeek?: string;
      isWorkHours?: boolean;
      isWeekend?: boolean;
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
  context?: string[];
}

export interface InteractionQuality {
  id: string;
  event_id: string;
  user_id: string;
  intent?: string | null;
  entities?: any;
  friction_score?: number | null;
  timestamp: string;
}

export type InsightType = 
  | 'repetitive_workflow'
  | 'inefficient_navigation'
  | 'time_sink'
  | 'friction_point'
  | 'wasted_effort'
  | 'better_alternative'
  | 'workflow_improvement';

export type ImpactLevel = 'high' | 'medium' | 'low';

export type GoalCategory = 
  | 'shopping'
  | 'learning'
  | 'productivity'
  | 'entertainment'
  | 'maintenance'
  | 'research'
  | 'communication'
  | 'unknown';

export interface WorkflowInsight {
  id: string;
  user_id: string;
  pattern_id: string;
  insight_type: InsightType;
  title: string;
  description: string;
  recommendation: string;
  current_workflow?: WorkflowStep[];
  suggested_workflow?: WorkflowStep[];
  impact_score: number;
  impact_level: ImpactLevel;
  confidence: number;
  evidence: Evidence;
  time_saved_estimate?: number; // in seconds
  effort_saved_estimate?: number; // 1-10 scale
  status: 'new' | 'acknowledged' | 'helpful' | 'not_helpful' | 'dismissed';
  created_at: string;
}

export interface WorkflowStep {
  step: number;
  action: string;
  domain?: string;
  purpose?: string;
  time_estimate?: number;
  is_redundant?: boolean;
  is_friction?: boolean;
}

export interface Evidence {
  pattern_occurrences: number;
  total_time_spent: number;
  friction_events: number;
  supporting_events: string[]; // event IDs
  similar_patterns?: number;
}

export interface WorkflowComparison {
  pattern_id: string;
  current: {
    steps: WorkflowStep[];
    total_time: number;
    total_steps: number;
    friction_points: number;
  };
  suggested: {
    steps: WorkflowStep[];
    total_time: number;
    total_steps: number;
    friction_points: number;
  };
  improvement: {
    steps_saved: number;
    time_saved: number;
    friction_reduced: number;
    efficiency_gain: number; // percentage
  };
  explanation: string;
}

export interface Recommendation {
  title: string;
  description: string;
  current_approach: string;
  suggested_approach: string;
  why_better: string;
  time_saved: number;
  effort_saved: number;
  confidence: number;
}

export interface Connection {
  type: 'sequential' | 'trigger' | 'parallel';
  patterns: string[]; // pattern IDs
  relationship: string;
  confidence: number;
  evidence: {
    co_occurrence_count: number;
    time_proximity_avg: number; // seconds between patterns
  };
}

export interface SequentialConnection extends Connection {
  type: 'sequential';
  sequence: string[]; // pattern IDs in order
  always_in_order: boolean;
}

export interface TriggerConnection extends Connection {
  type: 'trigger';
  trigger_pattern: string;
  response_pattern: string;
  trigger_probability: number;
}

export interface ParallelConnection extends Connection {
  type: 'parallel';
  patterns: string[];
  same_goal: boolean;
  preferred_pattern?: string; // more efficient one
}

export interface InefficiencyInsight {
  pattern_id: string;
  inefficiency_type: 'redundant_steps' | 'excessive_navigation' | 'repeated_searches' | 'form_refilling';
  wasted_actions: number;
  wasted_time: number;
  explanation: string;
}

export interface AlternativeInsight {
  pattern_id: string;
  current_method: string;
  better_method: string;
  improvement_explanation: string;
  confidence: number;
}

