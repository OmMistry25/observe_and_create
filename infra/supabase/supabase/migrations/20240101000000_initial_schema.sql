-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable pgvector for embeddings (will be needed later)
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- PROFILES TABLE
-- User profiles with preferences and retention settings
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_days INTEGER DEFAULT 30,
  preferences JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT valid_retention CHECK (retention_days > 0)
);

-- ============================================================================
-- DOMAINS TABLE
-- User-scoped domain allow/deny list with timestamps
-- ============================================================================
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'denied', 'blocked')),
  granular_controls JSONB DEFAULT '{}'::jsonb, -- {clicks: true, forms: false, etc}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

CREATE INDEX idx_domains_user_id ON domains(user_id);
CREATE INDEX idx_domains_status ON domains(status);

-- ============================================================================
-- SESSIONS TABLE
-- Tab/window sessions with dwell summaries
-- ============================================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_end TIMESTAMPTZ,
  tab_id TEXT,
  window_id TEXT,
  dwell_summary JSONB DEFAULT '{}'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_device_id ON sessions(device_id);
CREATE INDEX idx_sessions_start ON sessions(session_start);

-- ============================================================================
-- EVENTS TABLE (Partitioned by day)
-- Canonical events with JSONB storage
-- ============================================================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL CHECK (type IN ('click', 'search', 'form', 'nav', 'focus', 'blur', 'idle', 'error')),
  url TEXT NOT NULL,
  title TEXT,
  dom_path TEXT,
  text TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  dwell_ms INTEGER,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  context_events TEXT[], -- Array of event IDs for context
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_user_ts ON events(user_id, ts DESC);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_session_id ON events(session_id);
CREATE INDEX idx_events_url ON events(url);
CREATE INDEX idx_events_ts ON events(ts DESC);

-- Note: For production with large data, consider partitioning by day:
-- CREATE TABLE events_YYYYMMDD PARTITION OF events FOR VALUES FROM ('YYYY-MM-DD') TO ('YYYY-MM-DD');

-- ============================================================================
-- EVENT_EMBEDDINGS TABLE
-- Vector embeddings for semantic search
-- ============================================================================
CREATE TABLE event_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  -- embedding VECTOR(384), -- Uncomment when pgvector is enabled
  embedding JSONB NOT NULL, -- Temporary: store as JSONB until pgvector enabled
  modality_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id)
);

CREATE INDEX idx_event_embeddings_event_id ON event_embeddings(event_id);
-- CREATE INDEX ON event_embeddings USING ivfflat (embedding vector_cosine_ops); -- For pgvector

-- ============================================================================
-- INTERACTION_QUALITY TABLE
-- Friction scores, success signals, inferred intent
-- ============================================================================
CREATE TABLE interaction_quality (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  friction_score NUMERIC(3,2) DEFAULT 0 CHECK (friction_score >= 0 AND friction_score <= 1),
  success BOOLEAN,
  inferred_intent TEXT CHECK (inferred_intent IN ('research', 'transaction', 'comparison', 'creation', 'communication', 'unknown')),
  struggle_signals TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id)
);

CREATE INDEX idx_interaction_quality_event_id ON interaction_quality(event_id);
CREATE INDEX idx_interaction_quality_friction ON interaction_quality(friction_score DESC);
CREATE INDEX idx_interaction_quality_intent ON interaction_quality(inferred_intent);

-- ============================================================================
-- PATTERNS TABLE
-- Mined workflow patterns (frequency, temporal, semantic)
-- ============================================================================
CREATE TABLE patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('frequency', 'temporal', 'semantic')),
  sequence JSONB NOT NULL, -- Array of event objects
  support INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  temporal_pattern JSONB, -- {day_of_week: [1,3,5], hour_of_day: [9,10], trigger_event: 'email_open'}
  semantic_cluster_id TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patterns_user_id ON patterns(user_id);
CREATE INDEX idx_patterns_type ON patterns(pattern_type);
CREATE INDEX idx_patterns_support ON patterns(support DESC);
CREATE INDEX idx_patterns_confidence ON patterns(confidence DESC);
CREATE INDEX idx_patterns_cluster ON patterns(semantic_cluster_id);

-- ============================================================================
-- PATTERN_TEMPLATES TABLE
-- Pre-built common workflow patterns for cold start
-- ============================================================================
CREATE TABLE pattern_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  template_pattern JSONB NOT NULL, -- Pattern structure with fuzzy matchers
  match_criteria JSONB NOT NULL, -- Rules for fuzzy matching user activity
  confidence_threshold NUMERIC(3,2) DEFAULT 0.7,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pattern_templates_category ON pattern_templates(category);
CREATE INDEX idx_pattern_templates_active ON pattern_templates(is_active);

-- ============================================================================
-- AUTOMATIONS TABLE
-- User-approved automations with versioning
-- ============================================================================
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger JSONB NOT NULL, -- {kind: 'schedule'|'url'|'pattern'|'realtime', spec: {...}}
  actions JSONB NOT NULL, -- Array of {kind, spec, selectors}
  scope JSONB NOT NULL, -- {domains: [], permissions: []}
  status TEXT NOT NULL CHECK (status IN ('suggested', 'approved', 'active', 'paused', 'needs_repair')),
  version INTEGER NOT NULL DEFAULT 1,
  health JSONB DEFAULT '{"success_rate": 0, "failures": 0, "needs_attention": false}'::jsonb,
  created_from_pattern UUID REFERENCES patterns(id) ON DELETE SET NULL,
  template_id UUID REFERENCES pattern_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automations_user_id ON automations(user_id);
CREATE INDEX idx_automations_status ON automations(status);
CREATE INDEX idx_automations_pattern ON automations(created_from_pattern);

-- ============================================================================
-- AUTOMATION_VERSIONS TABLE
-- Version history with changes and performance deltas
-- ============================================================================
CREATE TABLE automation_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  changes JSONB NOT NULL, -- Diff from previous version
  performance_delta JSONB, -- Success rate changes, etc
  reason TEXT, -- User explanation or auto-repair reason
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(automation_id, version)
);

CREATE INDEX idx_automation_versions_automation_id ON automation_versions(automation_id);

-- ============================================================================
-- TRIGGERS TABLE
-- Schedule or event-driven triggers
-- ============================================================================
CREATE TABLE triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'url', 'pattern', 'realtime')),
  trigger_spec JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triggers_automation_id ON triggers(automation_id);
CREATE INDEX idx_triggers_active ON triggers(is_active);

-- ============================================================================
-- RUNS TABLE
-- Execution logs with status, latency, errors
-- ============================================================================
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  execution_log JSONB DEFAULT '{}'::jsonb, -- Step-by-step execution details
  selector_strategy_used TEXT, -- Which selector strategy worked
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_runs_automation_id ON runs(automation_id);
CREATE INDEX idx_runs_user_id ON runs(user_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);

-- ============================================================================
-- AUTOMATION_FEEDBACK TABLE
-- User feedback on automation runs
-- ============================================================================
CREATE TABLE automation_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL CHECK (feedback IN ('helpful', 'not_helpful', 'needs_editing')),
  reason TEXT,
  correction JSONB, -- Partial automation update
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_feedback_automation_id ON automation_feedback(automation_id);
CREATE INDEX idx_automation_feedback_user_id ON automation_feedback(user_id);
CREATE INDEX idx_automation_feedback_feedback ON automation_feedback(feedback);

-- ============================================================================
-- FUNCTIONS
-- Helper functions for updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- Table and column documentation
-- ============================================================================
COMMENT ON TABLE profiles IS 'User profiles with privacy preferences and retention settings';
COMMENT ON TABLE domains IS 'Domain-level privacy controls and permissions per user';
COMMENT ON TABLE sessions IS 'Browser session tracking for context building';
COMMENT ON TABLE events IS 'Canonical activity events captured from browser';
COMMENT ON TABLE event_embeddings IS 'Vector embeddings for semantic search and clustering';
COMMENT ON TABLE interaction_quality IS 'Friction detection and intent classification';
COMMENT ON TABLE patterns IS 'Mined workflow patterns from user activity';
COMMENT ON TABLE pattern_templates IS 'Pre-built templates for cold start suggestions';
COMMENT ON TABLE automations IS 'User-approved automation workflows';
COMMENT ON TABLE automation_versions IS 'Version history for automation changes';
COMMENT ON TABLE triggers IS 'Trigger definitions for automation execution';
COMMENT ON TABLE runs IS 'Execution logs for automation runs';
COMMENT ON TABLE automation_feedback IS 'User feedback for learning and improvement';

