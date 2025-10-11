-- Add 'friction' event type to the events table
-- Migration: 20240101000003_add_friction_event_type.sql

-- Drop the existing check constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;

-- Recreate the constraint with the new 'friction' type
ALTER TABLE events ADD CONSTRAINT events_type_check 
  CHECK (type IN ('click', 'search', 'form', 'nav', 'focus', 'blur', 'idle', 'error', 'friction'));

-- Add comment
COMMENT ON CONSTRAINT events_type_check ON events IS 
  'Valid event types including friction detection (T11.1)';

