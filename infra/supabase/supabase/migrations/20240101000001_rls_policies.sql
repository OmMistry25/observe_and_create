-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- Ensure users can only access their own data
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_feedback ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can delete their own profile
CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- ============================================================================
-- DOMAINS POLICIES
-- ============================================================================

CREATE POLICY "Users can manage own domains"
  ON domains FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- SESSIONS POLICIES
-- ============================================================================

CREATE POLICY "Users can manage own sessions"
  ON sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- EVENTS POLICIES
-- ============================================================================

CREATE POLICY "Users can manage own events"
  ON events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- EVENT_EMBEDDINGS POLICIES
-- ============================================================================

-- Users can read embeddings for their own events
CREATE POLICY "Users can read own event embeddings"
  ON event_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_embeddings.event_id
      AND events.user_id = auth.uid()
    )
  );

-- Users can insert embeddings for their own events
CREATE POLICY "Users can insert own event embeddings"
  ON event_embeddings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_embeddings.event_id
      AND events.user_id = auth.uid()
    )
  );

-- Users can update embeddings for their own events
CREATE POLICY "Users can update own event embeddings"
  ON event_embeddings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_embeddings.event_id
      AND events.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_embeddings.event_id
      AND events.user_id = auth.uid()
    )
  );

-- Users can delete embeddings for their own events
CREATE POLICY "Users can delete own event embeddings"
  ON event_embeddings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_embeddings.event_id
      AND events.user_id = auth.uid()
    )
  );

-- ============================================================================
-- INTERACTION_QUALITY POLICIES
-- ============================================================================

-- Users can read quality data for their own events
CREATE POLICY "Users can read own interaction quality"
  ON interaction_quality FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = interaction_quality.event_id
      AND events.user_id = auth.uid()
    )
  );

-- Users can insert quality data for their own events
CREATE POLICY "Users can insert own interaction quality"
  ON interaction_quality FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = interaction_quality.event_id
      AND events.user_id = auth.uid()
    )
  );

-- Users can update quality data for their own events
CREATE POLICY "Users can update own interaction quality"
  ON interaction_quality FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = interaction_quality.event_id
      AND events.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = interaction_quality.event_id
      AND events.user_id = auth.uid()
    )
  );

-- Users can delete quality data for their own events
CREATE POLICY "Users can delete own interaction quality"
  ON interaction_quality FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = interaction_quality.event_id
      AND events.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PATTERNS POLICIES
-- ============================================================================

CREATE POLICY "Users can manage own patterns"
  ON patterns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- PATTERN_TEMPLATES POLICIES
-- ============================================================================

-- All authenticated users can read templates (public library)
CREATE POLICY "Authenticated users can read pattern templates"
  ON pattern_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only service role can modify templates (managed by admins)
-- No user policies needed - handled by service role key

-- ============================================================================
-- AUTOMATIONS POLICIES
-- ============================================================================

CREATE POLICY "Users can manage own automations"
  ON automations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- AUTOMATION_VERSIONS POLICIES
-- ============================================================================

-- Users can read versions for their own automations
CREATE POLICY "Users can read own automation versions"
  ON automation_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = automation_versions.automation_id
      AND automations.user_id = auth.uid()
    )
  );

-- Users can insert versions for their own automations
CREATE POLICY "Users can insert own automation versions"
  ON automation_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = automation_versions.automation_id
      AND automations.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS POLICIES
-- ============================================================================

-- Users can manage triggers for their own automations
CREATE POLICY "Users can read own triggers"
  ON triggers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = triggers.automation_id
      AND automations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own triggers"
  ON triggers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = triggers.automation_id
      AND automations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own triggers"
  ON triggers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = triggers.automation_id
      AND automations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = triggers.automation_id
      AND automations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own triggers"
  ON triggers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = triggers.automation_id
      AND automations.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RUNS POLICIES
-- ============================================================================

CREATE POLICY "Users can manage own runs"
  ON runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- AUTOMATION_FEEDBACK POLICIES
-- ============================================================================

CREATE POLICY "Users can manage own feedback"
  ON automation_feedback FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Users can read own profile" ON profiles IS 
  'Allow users to read their own profile data';

COMMENT ON POLICY "Users can manage own events" ON events IS 
  'Users have full CRUD access to their own events';

COMMENT ON POLICY "Authenticated users can read pattern templates" ON pattern_templates IS 
  'Pattern templates are public to all authenticated users for cold start';

