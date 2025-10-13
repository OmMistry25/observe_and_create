-- ============================================================================
-- SEMANTIC INTELLIGENCE: Level 1 + Level 3
-- Add semantic context capture and goal inference capabilities
-- ============================================================================

-- LEVEL 1: Add semantic_context column to events table
-- Stores rich context: element purpose, page type, content signals, journey state
ALTER TABLE events ADD COLUMN IF NOT EXISTS semantic_context JSONB DEFAULT '{}'::jsonb;

-- Index for querying by page type, category, purpose
-- Use nested JSONB path: semantic_context->'pageMetadata'->>'type'
CREATE INDEX IF NOT EXISTS idx_events_semantic_page_type ON events ((semantic_context->'pageMetadata'->>'type'));
CREATE INDEX IF NOT EXISTS idx_events_semantic_category ON events ((semantic_context->'pageMetadata'->>'category'));
CREATE INDEX IF NOT EXISTS idx_events_semantic_purpose ON events ((semantic_context->>'purpose'));

-- LEVEL 3: Add goal inference columns to patterns table
-- Stores LLM-inferred or heuristic-based user goals
ALTER TABLE patterns 
  ADD COLUMN IF NOT EXISTS inferred_goal TEXT,
  ADD COLUMN IF NOT EXISTS goal_confidence NUMERIC(3,2) CHECK (goal_confidence >= 0 AND goal_confidence <= 1),
  ADD COLUMN IF NOT EXISTS goal_category TEXT CHECK (goal_category IN ('shopping', 'learning', 'productivity', 'entertainment', 'maintenance', 'unknown')),
  ADD COLUMN IF NOT EXISTS automation_potential NUMERIC(3,2) CHECK (automation_potential >= 0 AND automation_potential <= 1),
  ADD COLUMN IF NOT EXISTS goal_reasoning TEXT;

-- Indexes for goal-based queries
CREATE INDEX IF NOT EXISTS idx_patterns_goal ON patterns(inferred_goal) WHERE inferred_goal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patterns_goal_category ON patterns(goal_category) WHERE goal_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patterns_automation_potential ON patterns(automation_potential DESC) WHERE automation_potential IS NOT NULL;

-- ============================================================================
-- HEURISTIC GOAL INFERENCE FUNCTION
-- Analyzes pattern sequence and infers user goal using rule-based logic
-- ============================================================================

CREATE OR REPLACE FUNCTION infer_goal_heuristic(sequence JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_event JSONB;
  v_page_types TEXT[];
  v_purposes TEXT[];
  v_urls TEXT[];
  v_has_search BOOLEAN := FALSE;
  v_has_cart BOOLEAN := FALSE;
  v_has_checkout BOOLEAN := FALSE;
  v_has_product BOOLEAN := FALSE;
  v_has_article BOOLEAN := FALSE;
  v_has_dashboard BOOLEAN := FALSE;
  v_step_count INT;
BEGIN
  -- Extract event characteristics
  v_step_count := jsonb_array_length(sequence);
  
  FOR v_event IN SELECT * FROM jsonb_array_elements(sequence)
  LOOP
    -- Extract page types
    IF v_event->'semantic_context'->'pageMetadata'->>'type' IS NOT NULL THEN
      v_page_types := array_append(v_page_types, v_event->'semantic_context'->'pageMetadata'->>'type');
    END IF;
    
    -- Extract purposes
    IF v_event->'semantic_context'->>'purpose' IS NOT NULL THEN
      v_purposes := array_append(v_purposes, v_event->'semantic_context'->>'purpose');
    END IF;
    
    -- Extract URLs
    IF v_event->>'url' IS NOT NULL THEN
      v_urls := array_append(v_urls, v_event->>'url');
    END IF;
    
    -- Check for specific signals
    IF v_event->>'type' = 'search' THEN v_has_search := TRUE; END IF;
    IF v_event->'semantic_context'->'pageMetadata'->>'type' = 'product' THEN v_has_product := TRUE; END IF;
    IF v_event->'semantic_context'->'pageMetadata'->>'type' = 'article' THEN v_has_article := TRUE; END IF;
    IF v_event->'semantic_context'->'pageMetadata'->>'type' = 'checkout' THEN v_has_checkout := TRUE; END IF;
    IF v_event->'semantic_context'->'pageMetadata'->>'type' = 'dashboard' THEN v_has_dashboard := TRUE; END IF;
    
    -- Check URL patterns
    IF v_event->>'url' LIKE '%cart%' OR v_event->>'url' LIKE '%shopping%' THEN 
      v_has_cart := TRUE; 
    END IF;
  END LOOP;
  
  -- Apply heuristic rules
  
  -- SHOPPING: Product pages + purchase intent or cart/checkout
  IF v_has_product AND ('purchase_intent' = ANY(v_purposes) OR v_has_cart OR v_has_checkout) THEN
    v_result := jsonb_build_object(
      'goal', 'online_purchase',
      'goal_category', 'shopping',
      'confidence', 0.8,
      'automation_potential', 0.7,
      'reasoning', 'Pattern includes product pages with purchase signals and/or cart/checkout steps'
    );
  
  -- PRICE COMPARISON: Multiple product pages, comparison signals
  ELSIF v_has_product AND v_step_count >= 3 AND 'comparison_research' = ANY(v_purposes) THEN
    v_result := jsonb_build_object(
      'goal', 'price_comparison',
      'goal_category', 'shopping',
      'confidence', 0.75,
      'automation_potential', 0.8,
      'reasoning', 'Multiple product pages with comparison research signals'
    );
  
  -- RESEARCH: Search + multiple articles
  ELSIF v_has_search AND v_has_article AND v_step_count >= 3 THEN
    v_result := jsonb_build_object(
      'goal', 'research_topic',
      'goal_category', 'learning',
      'confidence', 0.75,
      'automation_potential', 0.5,
      'reasoning', 'Search followed by multiple article views indicates research behavior'
    );
  
  -- INFORMATION SEEKING: Multiple article reads
  ELSIF v_has_article AND v_step_count >= 2 THEN
    v_result := jsonb_build_object(
      'goal', 'content_consumption',
      'goal_category', 'learning',
      'confidence', 0.65,
      'automation_potential', 0.4,
      'reasoning', 'Reading multiple articles suggests information gathering'
    );
  
  -- STATUS MONITORING: Dashboard checks
  ELSIF v_has_dashboard AND v_step_count >= 2 THEN
    v_result := jsonb_build_object(
      'goal', 'status_monitoring',
      'goal_category', 'maintenance',
      'confidence', 0.7,
      'automation_potential', 0.9,
      'reasoning', 'Repeated dashboard visits indicate status checking behavior'
    );
  
  -- NAVIGATION: Pure navigation pattern
  ELSIF 'navigation' = ANY(v_purposes) AND v_step_count >= 3 THEN
    v_result := jsonb_build_object(
      'goal', 'site_navigation',
      'goal_category', 'productivity',
      'confidence', 0.6,
      'automation_potential', 0.7,
      'reasoning', 'Consistent navigation pattern detected'
    );
  
  -- SOCIAL INTERACTION: Social signals
  ELSIF 'social_interaction' = ANY(v_purposes) THEN
    v_result := jsonb_build_object(
      'goal', 'social_engagement',
      'goal_category', 'entertainment',
      'confidence', 0.65,
      'automation_potential', 0.3,
      'reasoning', 'Social interaction actions detected'
    );
  
  -- FORM WORKFLOW: Form submissions
  ELSIF 'form_submission' = ANY(v_purposes) THEN
    v_result := jsonb_build_object(
      'goal', 'form_completion',
      'goal_category', 'productivity',
      'confidence', 0.7,
      'automation_potential', 0.8,
      'reasoning', 'Form submission pattern indicates data entry workflow'
    );
  
  -- DEFAULT: Unknown pattern
  ELSE
    v_result := jsonb_build_object(
      'goal', 'general_browsing',
      'goal_category', 'unknown',
      'confidence', 0.3,
      'automation_potential', 0.2,
      'reasoning', 'No clear pattern detected from available signals'
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PATTERN GOAL INFERENCE JOB
-- Analyzes patterns without goals and infers their purpose
-- ============================================================================

CREATE OR REPLACE FUNCTION infer_pattern_goals()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_pattern_count INT := 0;
  v_pattern RECORD;
  v_inferred_goal JSONB;
BEGIN
  -- Loop through patterns without goals that have reasonable support
  FOR v_pattern IN
    SELECT p.id, p.sequence, p.user_id
    FROM patterns p
    WHERE p.inferred_goal IS NULL
      AND p.support >= 3  -- At least 3 occurrences
      AND p.confidence >= 0.3  -- Reasonable confidence
    ORDER BY p.support DESC, p.confidence DESC
    LIMIT 100  -- Process 100 patterns per run
  LOOP
    -- Infer goal using heuristic function
    v_inferred_goal := infer_goal_heuristic(v_pattern.sequence);
    
    -- Update pattern with inferred goal
    UPDATE patterns
    SET 
      inferred_goal = v_inferred_goal->>'goal',
      goal_confidence = (v_inferred_goal->>'confidence')::NUMERIC,
      goal_category = v_inferred_goal->>'goal_category',
      automation_potential = (v_inferred_goal->>'automation_potential')::NUMERIC,
      goal_reasoning = v_inferred_goal->>'reasoning'
    WHERE id = v_pattern.id;
    
    v_pattern_count := v_pattern_count + 1;
  END LOOP;
  
  RETURN 'Inferred goals for ' || v_pattern_count || ' patterns';
END;
$$;

-- ============================================================================
-- SCHEDULE WEEKLY GOAL INFERENCE
-- Runs every Sunday at 5 AM to analyze patterns and infer goals
-- ============================================================================

SELECT cron.schedule(
  'weekly-goal-inference',
  '0 5 * * 0',  -- Sunday at 5 AM
  $$SELECT infer_pattern_goals();$$
);

-- ============================================================================
-- HELPER VIEWS FOR SEMANTIC ANALYSIS
-- ============================================================================

-- View: Patterns with high automation potential
CREATE OR REPLACE VIEW automatable_patterns AS
SELECT 
  p.*,
  p.automation_potential * p.confidence AS automation_score
FROM patterns p
WHERE p.automation_potential >= 0.6
  AND p.confidence >= 0.4
  AND p.inferred_goal IS NOT NULL
ORDER BY automation_score DESC;

-- View: Goal-based pattern summary
CREATE OR REPLACE VIEW goal_pattern_summary AS
SELECT 
  goal_category,
  inferred_goal,
  COUNT(*) as pattern_count,
  AVG(confidence) as avg_confidence,
  AVG(automation_potential) as avg_automation_potential,
  SUM(support) as total_occurrences
FROM patterns
WHERE inferred_goal IS NOT NULL
GROUP BY goal_category, inferred_goal
ORDER BY total_occurrences DESC;

-- Comment for documentation
COMMENT ON COLUMN events.semantic_context IS 'Level 1: Rich semantic context including element purpose, page type, content signals, and journey state';
COMMENT ON COLUMN patterns.inferred_goal IS 'Level 3: User goal inferred from pattern sequence (e.g., price_comparison, research_topic, status_monitoring)';
COMMENT ON COLUMN patterns.goal_confidence IS 'Level 3: Confidence in the inferred goal (0-1)';
COMMENT ON COLUMN patterns.automation_potential IS 'Level 3: How automatable this workflow is (0-1, higher = more automatable)';

