-- Create page_profiles table for learned DOM extraction patterns
-- Part of Issue #1: Smart Adaptive DOM Context Extraction

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

CREATE TRIGGER trigger_update_page_profiles_timestamp
  BEFORE UPDATE ON page_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_page_profiles_timestamp();

-- Enable Row Level Security
ALTER TABLE page_profiles ENABLE ROW LEVEL SECURITY;

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

