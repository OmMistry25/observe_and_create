-- ============================================================================
-- Migration: Workflow Insights
-- Description: Create table to store generated insights and recommendations
-- Date: 2025-10-14
-- ============================================================================

-- Create workflow_insights table
CREATE TABLE IF NOT EXISTS workflow_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pattern_id UUID REFERENCES patterns(id) ON DELETE CASCADE,
  
  -- Insight classification
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'repetitive_workflow',
    'inefficient_navigation',
    'time_sink',
    'friction_point',
    'wasted_effort',
    'better_alternative',
    'workflow_improvement'
  )),
  
  -- Insight content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  
  -- Workflow comparisons (current vs suggested)
  current_workflow JSONB,
  suggested_workflow JSONB,
  
  -- Scoring
  impact_score NUMERIC NOT NULL DEFAULT 0,
  impact_level TEXT NOT NULL CHECK (impact_level IN ('high', 'medium', 'low')),
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Evidence
  evidence JSONB NOT NULL DEFAULT '{
    "pattern_occurrences": 0,
    "total_time_spent": 0,
    "friction_events": 0,
    "supporting_events": []
  }'::jsonb,
  
  -- Savings estimates
  time_saved_estimate INT, -- seconds
  effort_saved_estimate INT CHECK (effort_saved_estimate >= 1 AND effort_saved_estimate <= 10),
  
  -- User feedback
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',
    'acknowledged',
    'helpful',
    'not_helpful',
    'dismissed'
  )),
  feedback_timestamp TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_insights_user_id ON workflow_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_pattern_id ON workflow_insights(pattern_id);
CREATE INDEX IF NOT EXISTS idx_insights_status ON workflow_insights(status);
CREATE INDEX IF NOT EXISTS idx_insights_impact_level ON workflow_insights(impact_level);
CREATE INDEX IF NOT EXISTS idx_insights_type ON workflow_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON workflow_insights(created_at DESC);

-- Composite index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_insights_user_status_impact ON workflow_insights(user_id, status, impact_level, created_at DESC);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_workflow_insights_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_insights_updated_at
  BEFORE UPDATE ON workflow_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_insights_timestamp();

-- RLS Policies
ALTER TABLE workflow_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own insights"
  ON workflow_insights
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own insights"
  ON workflow_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights"
  ON workflow_insights
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own insights"
  ON workflow_insights
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Views for common queries
-- ============================================================================

-- High-impact insights for a user
CREATE OR REPLACE VIEW high_impact_insights AS
SELECT 
  wi.*,
  p.sequence,
  p.support,
  p.confidence as pattern_confidence,
  p.inferred_goal
FROM workflow_insights wi
LEFT JOIN patterns p ON wi.pattern_id = p.id
WHERE wi.impact_level = 'high'
  AND wi.status = 'new'
ORDER BY wi.impact_score DESC;

-- Insights summary by type
CREATE OR REPLACE VIEW insights_by_type AS
SELECT 
  user_id,
  insight_type,
  COUNT(*) as count,
  AVG(impact_score) as avg_impact,
  AVG(confidence) as avg_confidence,
  SUM(CASE WHEN status = 'helpful' THEN 1 ELSE 0 END) as helpful_count,
  SUM(CASE WHEN status = 'not_helpful' THEN 1 ELSE 0 END) as not_helpful_count
FROM workflow_insights
GROUP BY user_id, insight_type;

-- User engagement with insights
CREATE OR REPLACE VIEW insights_engagement AS
SELECT 
  user_id,
  COUNT(*) as total_insights,
  SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
  SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) as acknowledged_count,
  SUM(CASE WHEN status = 'helpful' THEN 1 ELSE 0 END) as helpful_count,
  SUM(CASE WHEN status = 'not_helpful' THEN 1 ELSE 0 END) as not_helpful_count,
  SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed_count,
  ROUND(
    100.0 * SUM(CASE WHEN status = 'helpful' THEN 1 ELSE 0 END) / 
    NULLIF(SUM(CASE WHEN status IN ('helpful', 'not_helpful') THEN 1 ELSE 0 END), 0),
    2
  ) as helpfulness_rate
FROM workflow_insights
GROUP BY user_id;

COMMENT ON TABLE workflow_insights IS 'Stores generated workflow insights and recommendations for users';
COMMENT ON VIEW high_impact_insights IS 'High-impact insights that users should review first';
COMMENT ON VIEW insights_by_type IS 'Breakdown of insights by type for analytics';
COMMENT ON VIEW insights_engagement IS 'User engagement metrics with insights';

