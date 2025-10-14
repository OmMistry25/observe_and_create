-- Create materialized view for tracking frequently visited subpaths
-- Part of Issue #1: Smart Adaptive DOM Context Extraction

-- Materialized view for subpath frequency analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS frequent_subpaths AS
SELECT 
  user_id,
  url_path,
  COUNT(*) as visit_count,
  MIN(ts) as first_visit,
  MAX(ts) as last_visit,
  EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 3600 as time_span_hours,
  COUNT(DISTINCT DATE(ts)) as days_visited,
  -- Average visits per day
  CASE 
    WHEN COUNT(DISTINCT DATE(ts)) > 0 
    THEN COUNT(*)::FLOAT / COUNT(DISTINCT DATE(ts))
    ELSE 0
  END as avg_visits_per_day
FROM events
WHERE ts >= NOW() - INTERVAL '30 days'
  AND url_path IS NOT NULL
  AND url_path != '' -- Exclude empty paths
GROUP BY user_id, url_path
HAVING COUNT(*) >= 3; -- Only subpaths visited 3+ times

-- Create unique index for efficient lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_frequent_subpaths_user_path 
  ON frequent_subpaths(user_id, url_path);

-- Create index for sorting by frequency
CREATE INDEX IF NOT EXISTS idx_frequent_subpaths_visit_count 
  ON frequent_subpaths(user_id, visit_count DESC);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_frequent_subpaths()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY frequent_subpaths;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh every 6 hours using pg_cron (if enabled)
-- Note: This requires pg_cron extension
-- SELECT cron.schedule('refresh-frequent-subpaths', '0 */6 * * *', 'SELECT refresh_frequent_subpaths()');

COMMENT ON MATERIALIZED VIEW frequent_subpaths IS 'Tracks subpaths visited 3+ times in the last 30 days - triggers DOM profiling for frequently accessed pages';
COMMENT ON FUNCTION refresh_frequent_subpaths() IS 'Refreshes the frequent_subpaths materialized view - should be run every 6 hours';

