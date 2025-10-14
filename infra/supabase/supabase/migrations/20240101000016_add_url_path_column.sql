-- Add url_path column to events table for frequency-based DOM extraction
-- Part of Issue #1: Smart Adaptive DOM Context Extraction

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

CREATE TRIGGER trigger_set_url_path
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_url_path();

COMMENT ON COLUMN events.url_path IS 'Normalized URL path without query params - used to detect repeated visits to specific subpaths for intelligent DOM extraction';

