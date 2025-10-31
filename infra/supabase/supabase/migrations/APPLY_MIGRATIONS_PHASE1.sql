-- ============================================================================
-- PHASE 1: Smart Adaptive DOM Context Extraction - Database Migrations
-- Issue #1: https://github.com/OmMistry25/observe_and_create/issues/1
-- 
-- Apply these migrations in your Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: Add url_path column to events table
-- ============================================================================

-- Add url_path column
ALTER TABLE events ADD COLUMN IF NOT EXISTS url_path TEXT;

-- Backfill existing events (extract URL path without query params)
UPDATE events 
SET url_path = REGEXP_REPLACE(url, '\?.*$', '') -- Remove query params
WHERE url_path IS NULL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_events_user_path 
  ON events(user_id, url_path);

CREATE INDEX IF NOT EXISTS idx_events_path_frequency 
  ON events(user_id, url_path, ts DESC);

-- Add trigger to auto-populate url_path on insert/update
CREATE OR REPLACE FUNCTION set_url_path()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract URL path without query params and hash
  NEW.url_path := REGEXP_REPLACE(
    REGEXP_REPLACE(NEW.url, '\?.*$', ''),  -- Remove query params
    '#.*$', ''                              -- Remove hash
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_url_path ON events;

CREATE TRIGGER trigger_set_url_path
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_url_path();

COMMENT ON COLUMN events.url_path IS 'Normalized URL path without query params - used to detect repeated visits to specific subpaths for intelligent DOM extraction';

-- ============================================================================
-- MIGRATION 2: Create frequent_subpaths materialized view
-- ============================================================================

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

COMMENT ON MATERIALIZED VIEW frequent_subpaths IS 'Tracks subpaths visited 3+ times in the last 30 days - triggers DOM profiling for frequently accessed pages';
COMMENT ON FUNCTION refresh_frequent_subpaths() IS 'Refreshes the frequent_subpaths materialized view - should be run every 6 hours';

-- ============================================================================
-- MIGRATION 3: Create page_profiles table
-- ============================================================================

CREATE TABLE IF NOT EXISTS page_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url_pattern TEXT NOT NULL, -- Normalized URL path
  visit_count INT DEFAULT 1,
  
  -- Learned DOM structure
  dom_structure JSONB, -- titleSelector, contentSelector, metadataSelectors
  
  -- Content signals detected
  content_signals JSONB, -- hasCheckboxes, hasCodeBlocks, hasTables, etc.
  
  -- Extraction rules learned from analyzing the page
  extraction_rules JSONB, -- Array of {selector, attribute, label, confidence}
  
  -- Metadata
  last_profiled TIMESTAMP,
  profile_version INT DEFAULT 1, -- Increments when re-analyzed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, url_pattern)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_page_profiles_user 
  ON page_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_page_profiles_visit_count 
  ON page_profiles(user_id, visit_count DESC);

CREATE INDEX IF NOT EXISTS idx_page_profiles_last_profiled 
  ON page_profiles(user_id, last_profiled DESC);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_page_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_page_profiles_timestamp ON page_profiles;

CREATE TRIGGER trigger_update_page_profiles_timestamp
  BEFORE UPDATE ON page_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_page_profiles_timestamp();

-- Enable Row Level Security
ALTER TABLE page_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own page profiles" ON page_profiles;
DROP POLICY IF EXISTS "Users can insert own page profiles" ON page_profiles;
DROP POLICY IF EXISTS "Users can update own page profiles" ON page_profiles;
DROP POLICY IF EXISTS "Users can delete own page profiles" ON page_profiles;

-- RLS Policies
CREATE POLICY "Users can view own page profiles"
  ON page_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own page profiles"
  ON page_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own page profiles"
  ON page_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own page profiles"
  ON page_profiles FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE page_profiles IS 'Stores learned DOM extraction patterns for frequently visited pages - enables intelligent, adaptive context extraction without hardcoding';
COMMENT ON COLUMN page_profiles.dom_structure IS 'Learned selectors for title, content, and metadata elements';
COMMENT ON COLUMN page_profiles.content_signals IS 'Detected page characteristics (checkboxes, code blocks, tables, etc.)';
COMMENT ON COLUMN page_profiles.extraction_rules IS 'Array of extraction rules with selectors, attributes, labels, and confidence scores';
COMMENT ON COLUMN page_profiles.profile_version IS 'Increments when page is re-analyzed to improve extraction accuracy';

-- ============================================================================
-- VERIFICATION QUERIES - Run these to verify the migrations worked
-- ============================================================================

-- Check url_path column exists and is populated
-- SELECT url_path, COUNT(*) as visits 
-- FROM events 
-- WHERE url_path IS NOT NULL 
-- GROUP BY url_path 
-- ORDER BY COUNT(*) DESC 
-- LIMIT 10;

-- Check page_profiles table exists
-- SELECT * FROM page_profiles LIMIT 1;

-- Check frequent_subpaths view (will be empty until you have 3+ visit pages)
-- SELECT * FROM frequent_subpaths LIMIT 5;

-- ============================================================================
-- SUCCESS! Phase 1 migrations applied.
-- Next: Reload your Chrome extension and browse for 24-48 hours
-- ============================================================================

