-- Add document_context column to events table for storing DOM extraction data
-- This column will store the smart-extracted DOM context for frequently visited pages

-- Add the document_context column
ALTER TABLE events ADD COLUMN IF NOT EXISTS document_context JSONB;

-- Create index for document_context queries
CREATE INDEX IF NOT EXISTS idx_events_document_context ON events USING GIN (document_context);

-- Create index for events with document context
CREATE INDEX IF NOT EXISTS idx_events_has_document_context ON events ((document_context IS NOT NULL));

-- Add comment to document the column
COMMENT ON COLUMN events.document_context IS 'Smart-extracted DOM context for frequently visited pages, stored as JSONB with page structure and content signals';

