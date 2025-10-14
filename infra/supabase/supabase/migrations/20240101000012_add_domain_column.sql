-- Migration: Add domain column to events table for better performance
-- This enables fast domain-based queries instead of slow LIKE patterns

-- Step 1: Add domain column
ALTER TABLE events ADD COLUMN IF NOT EXISTS domain TEXT;

-- Step 2: Backfill domain from existing URLs
-- Extract domain from URL using regex
UPDATE events 
SET domain = (
  REGEXP_REPLACE(
    REGEXP_REPLACE(url, '^https?://(www\.)?', ''), -- Remove protocol and www.
    '/.*$', '' -- Remove path
  )
)
WHERE domain IS NULL AND url IS NOT NULL;

-- Step 3: Create index for fast domain lookups
CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
CREATE INDEX IF NOT EXISTS idx_events_user_domain ON events(user_id, domain);

-- Step 4: Add helpful comment
COMMENT ON COLUMN events.domain IS 'Extracted domain from URL (e.g., "chatgpt.com", "canvas.illinois.edu") for fast filtering';

-- Optional: Create a function to automatically set domain on insert/update
CREATE OR REPLACE FUNCTION set_event_domain()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract domain from URL if not already set
  IF NEW.domain IS NULL AND NEW.url IS NOT NULL THEN
    NEW.domain := REGEXP_REPLACE(
      REGEXP_REPLACE(NEW.url, '^https?://(www\.)?', ''),
      '/.*$', ''
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-populate domain
DROP TRIGGER IF EXISTS trigger_set_event_domain ON events;
CREATE TRIGGER trigger_set_event_domain
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_event_domain();

-- Verify the migration
-- Example query: SELECT domain, COUNT(*) FROM events GROUP BY domain ORDER BY COUNT(*) DESC LIMIT 10;

