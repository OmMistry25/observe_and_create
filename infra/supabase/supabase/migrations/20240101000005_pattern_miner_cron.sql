-- T17: Pattern Miner Cron Job
-- Sets up nightly pattern mining using pg_cron

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Clean up duplicate patterns before adding unique constraint
-- Keep the most recent pattern for each (user_id, sequence) combination
DELETE FROM patterns p1
WHERE EXISTS (
  SELECT 1 FROM patterns p2
  WHERE p1.user_id = p2.user_id
    AND p1.sequence = p2.sequence
    AND p1.created_at < p2.created_at
);

-- Add unique constraint to patterns table for upsert logic
-- This allows ON CONFLICT to work properly
ALTER TABLE patterns DROP CONSTRAINT IF EXISTS patterns_user_sequence_unique;
ALTER TABLE patterns ADD CONSTRAINT patterns_user_sequence_unique UNIQUE (user_id, sequence);

-- Create a function to invoke the pattern miner edge function
CREATE OR REPLACE FUNCTION invoke_pattern_miner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_status int;
  response_body text;
BEGIN
  -- Call the edge function via HTTP
  SELECT status, content INTO response_status, response_body
  FROM http((
    'POST',
    current_setting('app.supabase_url') || '/functions/v1/pattern-miner',
    ARRAY[http_header('Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'))],
    'application/json',
    '{}'
  )::http_request);

  -- Log the result
  RAISE NOTICE 'Pattern miner response: % - %', response_status, response_body;
END;
$$;

-- Schedule the pattern miner to run nightly at 2 AM UTC
-- This uses pg_cron syntax: minute hour day month day_of_week
SELECT cron.schedule(
  'nightly-pattern-mining',
  '0 2 * * *', -- Every day at 2 AM UTC
  $$SELECT invoke_pattern_miner()$$
);

-- Alternative: Create a SQL-only pattern miner function
-- This version doesn't require edge functions
CREATE OR REPLACE FUNCTION mine_patterns_sql(
  target_user_id UUID DEFAULT NULL,
  min_support INT DEFAULT 3,
  lookback_days INT DEFAULT 7
)
RETURNS TABLE (
  patterns_found INT,
  patterns_stored INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_ids UUID[];
  current_user_id UUID;
  total_found INT := 0;
  total_stored INT := 0;
  pattern_count INT;
BEGIN
  -- If target_user_id is specified, process only that user
  IF target_user_id IS NOT NULL THEN
    user_ids := ARRAY[target_user_id];
  ELSE
    -- Get all users with events in the last N days
    SELECT ARRAY_AGG(DISTINCT user_id)
    INTO user_ids
    FROM events
    WHERE ts >= NOW() - (lookback_days || ' days')::INTERVAL;
  END IF;

  -- Process each user
  FOREACH current_user_id IN ARRAY user_ids
  LOOP
    -- Find frequent patterns for this user
    -- This is a simplified version - group by domain and find sequences
    WITH domain_sequences AS (
      SELECT
        user_id,
        url,
        type,
        ts,
        CASE
          WHEN LAG(url) OVER (PARTITION BY user_id ORDER BY ts) IS DISTINCT FROM url
          THEN ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts)
          ELSE NULL
        END AS sequence_break
      FROM events
      WHERE user_id = current_user_id
        AND ts >= NOW() - (lookback_days || ' days')::INTERVAL
      ORDER BY ts
    ),
    sequences_with_groups AS (
      SELECT
        user_id,
        url,
        type,
        ts,
        COUNT(sequence_break) OVER (PARTITION BY user_id ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS sequence_id
      FROM domain_sequences
    ),
    pattern_candidates AS (
      SELECT
        user_id,
        sequence_id,
        ARRAY_AGG(type || ':' || REGEXP_REPLACE(url, 'https?://(www\.)?', '') ORDER BY ts) AS pattern_sequence,
        COUNT(*) AS sequence_length
      FROM sequences_with_groups
      GROUP BY user_id, sequence_id
      HAVING COUNT(*) >= 3 AND COUNT(*) <= 5
    ),
    pattern_frequencies AS (
      SELECT
        user_id,
        pattern_sequence,
        COUNT(*) AS support,
        COUNT(*)::DECIMAL / NULLIF((SELECT COUNT(DISTINCT sequence_id) FROM pattern_candidates WHERE user_id = current_user_id), 0) AS confidence
      FROM pattern_candidates
      WHERE user_id = current_user_id
      GROUP BY user_id, pattern_sequence
      HAVING COUNT(*) >= min_support
    )
    INSERT INTO patterns (user_id, pattern_type, sequence, support, confidence, last_seen, created_at)
    SELECT
      user_id,
      'frequency' AS pattern_type,
      TO_JSONB(pattern_sequence) AS sequence,
      support,
      COALESCE(confidence, 0),
      NOW(),
      NOW()
    FROM pattern_frequencies
    ON CONFLICT (user_id, sequence)
    DO UPDATE SET
      support = EXCLUDED.support,
      confidence = EXCLUDED.confidence,
      last_seen = NOW()
    RETURNING 1 INTO pattern_count;

    total_found := total_found + COALESCE(pattern_count, 0);
    total_stored := total_stored + COALESCE(pattern_count, 0);
  END LOOP;

  RETURN QUERY SELECT total_found, total_stored;
END;
$$;

-- Schedule the SQL-only pattern miner (alternative to edge function)
SELECT cron.schedule(
  'nightly-pattern-mining-sql',
  '0 2 * * *', -- Every day at 2 AM UTC
  $$SELECT mine_patterns_sql()$$
);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION invoke_pattern_miner() TO authenticated;
GRANT EXECUTE ON FUNCTION mine_patterns_sql(UUID, INT, INT) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION invoke_pattern_miner() IS 'Invokes the pattern miner edge function via HTTP';
COMMENT ON FUNCTION mine_patterns_sql(UUID, INT, INT) IS 'SQL-based pattern miner - mines frequent event sequences from user activity';

-- View scheduled cron jobs
-- To see all cron jobs: SELECT * FROM cron.job;
-- To unschedule a job: SELECT cron.unschedule('job-name');

