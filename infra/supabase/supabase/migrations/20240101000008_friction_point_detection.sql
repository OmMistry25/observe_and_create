-- ============================================================================
-- T17.3: FRICTION POINT DETECTION
-- Analyze interaction_quality to find high-friction workflows
-- Suggest automations specifically for struggle points
-- ============================================================================

-- Drop existing functions if they exist (to ensure clean migration)
DROP FUNCTION IF EXISTS detect_friction_points(UUID, FLOAT, INT, INT) CASCADE;
DROP FUNCTION IF EXISTS detect_friction_points() CASCADE;
DROP FUNCTION IF EXISTS find_high_friction_patterns(UUID, FLOAT, INT) CASCADE;
DROP VIEW IF EXISTS friction_dashboard CASCADE;
DROP VIEW IF EXISTS automation_suggestions_with_friction CASCADE;

-- Function to detect friction points for a user
-- Returns top friction points with event counts and avg friction score
CREATE OR REPLACE FUNCTION detect_friction_points(
  target_user_id UUID DEFAULT NULL,
  min_friction_threshold FLOAT DEFAULT 0.6,
  lookback_days INT DEFAULT 30,
  limit_results INT DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  url TEXT,
  event_type TEXT,
  friction_count BIGINT,
  avg_friction_score NUMERIC,
  max_friction_score NUMERIC,
  struggle_signals TEXT[],
  most_recent TIMESTAMPTZ,
  sample_event_ids UUID[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.user_id,
    e.url,
    e.type as event_type,
    COUNT(*)::BIGINT as friction_count,
    ROUND(AVG(iq.friction_score)::NUMERIC, 3) as avg_friction_score,
    ROUND(MAX(iq.friction_score)::NUMERIC, 3) as max_friction_score,
    ARRAY_AGG(DISTINCT unnested_signal) FILTER (WHERE unnested_signal IS NOT NULL) as struggle_signals,
    MAX(e.ts) as most_recent,
    ARRAY_AGG(e.id ORDER BY e.ts DESC) FILTER (WHERE e.id IS NOT NULL) as sample_event_ids
  FROM events e
  INNER JOIN interaction_quality iq ON iq.event_id = e.id
  CROSS JOIN LATERAL unnest(iq.struggle_signals) AS unnested_signal
  WHERE 
    (target_user_id IS NULL OR e.user_id = target_user_id)
    AND iq.friction_score >= min_friction_threshold
    AND e.ts >= NOW() - (lookback_days || ' days')::INTERVAL
  GROUP BY e.user_id, e.url, e.type
  HAVING COUNT(*) >= 3  -- At least 3 high-friction events at same URL/type
  ORDER BY 
    AVG(iq.friction_score) DESC,
    COUNT(*) DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Convenience wrapper with no parameters
CREATE OR REPLACE FUNCTION detect_friction_points()
RETURNS TABLE (
  user_id UUID,
  url TEXT,
  event_type TEXT,
  friction_count BIGINT,
  avg_friction_score NUMERIC,
  max_friction_score NUMERIC,
  struggle_signals TEXT[],
  most_recent TIMESTAMPTZ,
  sample_event_ids UUID[]
) AS $$
BEGIN
  RETURN QUERY SELECT * FROM detect_friction_points(NULL, 0.6, 30, 20);
END;
$$ LANGUAGE plpgsql;

-- Function to find patterns with high friction
-- These are candidates for automation to reduce user struggle
CREATE OR REPLACE FUNCTION find_high_friction_patterns(
  target_user_id UUID DEFAULT NULL,
  min_friction_threshold FLOAT DEFAULT 0.5,
  lookback_days INT DEFAULT 30
)
RETURNS TABLE (
  pattern_id UUID,
  user_id UUID,
  sequence JSONB,
  support INT,
  confidence NUMERIC,
  avg_friction NUMERIC,
  friction_event_count BIGINT,
  pattern_type TEXT,
  should_automate BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH pattern_friction AS (
    SELECT 
      p.id as pattern_id,
      p.user_id,
      p.sequence,
      p.support,
      p.confidence,
      p.pattern_type,
      COUNT(DISTINCT iq.id) as friction_event_count,
      ROUND(AVG(iq.friction_score)::NUMERIC, 3) as avg_friction
    FROM patterns p
    CROSS JOIN LATERAL jsonb_array_elements(p.sequence) AS seq(event_obj)
    INNER JOIN events e ON e.id = (seq.event_obj->>'id')::uuid
    INNER JOIN interaction_quality iq ON iq.event_id = e.id
    WHERE 
      (target_user_id IS NULL OR p.user_id = target_user_id)
      AND iq.friction_score >= min_friction_threshold
      AND e.ts >= NOW() - (lookback_days || ' days')::INTERVAL
    GROUP BY p.id, p.user_id, p.sequence, p.support, p.confidence, p.pattern_type
  )
  SELECT 
    pf.pattern_id,
    pf.user_id,
    pf.sequence,
    pf.support,
    pf.confidence,
    pf.avg_friction,
    pf.friction_event_count,
    pf.pattern_type,
    CASE 
      WHEN pf.avg_friction >= 0.7 AND pf.support >= 5 THEN true
      WHEN pf.avg_friction >= 0.6 AND pf.support >= 10 THEN true
      ELSE false
    END as should_automate
  FROM pattern_friction pf
  WHERE pf.friction_event_count >= 3
  ORDER BY pf.avg_friction DESC, pf.support DESC;
END;
$$ LANGUAGE plpgsql;

-- View for friction point dashboard
CREATE OR REPLACE VIEW friction_dashboard AS
SELECT 
  e.user_id,
  e.url,
  e.type as event_type,
  COUNT(DISTINCT e.id) as total_events,
  COUNT(DISTINCT CASE WHEN iq.friction_score >= 0.6 THEN e.id END) as high_friction_events,
  ROUND(AVG(iq.friction_score)::NUMERIC, 3) as avg_friction_score,
  ROUND(MAX(iq.friction_score)::NUMERIC, 3) as max_friction_score,
  ARRAY_AGG(DISTINCT unnested_signal ORDER BY unnested_signal) FILTER (WHERE unnested_signal IS NOT NULL) as common_struggles,
  MAX(e.ts) as last_occurrence,
  -- Friction rate: % of events with high friction
  ROUND((COUNT(DISTINCT CASE WHEN iq.friction_score >= 0.6 THEN e.id END)::NUMERIC / COUNT(DISTINCT e.id)::NUMERIC) * 100, 1) as friction_rate_pct
FROM events e
LEFT JOIN interaction_quality iq ON iq.event_id = e.id
CROSS JOIN LATERAL unnest(COALESCE(iq.struggle_signals, ARRAY[]::TEXT[])) AS unnested_signal
WHERE e.ts >= NOW() - INTERVAL '30 days'
GROUP BY e.user_id, e.url, e.type
HAVING COUNT(DISTINCT CASE WHEN iq.friction_score >= 0.6 THEN e.id END) >= 3
ORDER BY 
  (COUNT(DISTINCT CASE WHEN iq.friction_score >= 0.6 THEN e.id END)::NUMERIC / COUNT(DISTINCT e.id)::NUMERIC) DESC,
  COUNT(DISTINCT CASE WHEN iq.friction_score >= 0.6 THEN e.id END) DESC;

-- View for automation suggestions with friction flag
CREATE OR REPLACE VIEW automation_suggestions_with_friction AS
SELECT 
  p.id as pattern_id,
  p.user_id,
  p.pattern_type,
  p.sequence,
  p.support,
  p.confidence,
  p.temporal_pattern,
  p.semantic_cluster_id,
  COALESCE(pf.avg_friction, 0) as avg_friction_score,
  COALESCE(pf.friction_event_count, 0) as friction_event_count,
  CASE 
    WHEN pf.avg_friction >= 0.6 THEN true
    ELSE false
  END as reduce_friction_flag,
  CASE
    WHEN pf.avg_friction >= 0.7 AND p.support >= 5 THEN 'high'
    WHEN pf.avg_friction >= 0.6 AND p.support >= 10 THEN 'medium'
    WHEN p.confidence >= 0.8 AND p.support >= 15 THEN 'medium'
    ELSE 'low'
  END as suggestion_priority,
  jsonb_build_object(
    'pattern_id', p.id,
    'name', 'Automate ' || (p.sequence->0->>'type') || ' workflow',
    'description', 'This pattern appears ' || p.support || ' times' || 
                   CASE WHEN pf.avg_friction >= 0.6 
                   THEN ' with high friction (avg: ' || ROUND(pf.avg_friction::NUMERIC, 2) || ')' 
                   ELSE '' END,
    'confidence', p.confidence,
    'support', p.support,
    'reduce_friction', COALESCE(pf.avg_friction >= 0.6, false),
    'friction_score', COALESCE(pf.avg_friction, 0),
    'evidence', jsonb_build_object(
      'occurrences', p.support,
      'first_seen', p.first_seen,
      'last_seen', p.last_seen,
      'friction_events', COALESCE(pf.friction_event_count, 0)
    )
  ) as suggestion_payload
FROM patterns p
LEFT JOIN LATERAL (
  SELECT 
    COUNT(DISTINCT iq.id) as friction_event_count,
    AVG(iq.friction_score) as avg_friction
  FROM jsonb_array_elements(p.sequence) AS seq(event_obj)
  INNER JOIN events e ON e.id = (seq.event_obj->>'id')::uuid
  INNER JOIN interaction_quality iq ON iq.event_id = e.id
  WHERE iq.friction_score >= 0.5
    AND e.ts >= NOW() - INTERVAL '30 days'
) pf ON true
WHERE p.support >= 3
  AND p.created_at >= NOW() - INTERVAL '90 days'
ORDER BY 
  CASE
    WHEN pf.avg_friction >= 0.7 AND p.support >= 5 THEN 1
    WHEN pf.avg_friction >= 0.6 AND p.support >= 10 THEN 2
    WHEN p.confidence >= 0.8 AND p.support >= 15 THEN 3
    ELSE 4
  END,
  p.support DESC;

COMMENT ON FUNCTION detect_friction_points(UUID, FLOAT, INT, INT) IS 'T17.3: Detect high-friction points across user workflows';
COMMENT ON FUNCTION find_high_friction_patterns(UUID, FLOAT, INT) IS 'T17.3: Find patterns with high friction that should be automated';
COMMENT ON VIEW friction_dashboard IS 'T17.3: Dashboard view showing friction points by URL and event type';
COMMENT ON VIEW automation_suggestions_with_friction IS 'T17.3: Automation suggestions with friction flags and priority';

