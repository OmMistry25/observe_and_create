-- T19.1: Add domain ignore list for pattern detection
-- Filters out localhost and development domains from pattern mining

-- Drop existing function first to allow return type changes
DROP FUNCTION IF EXISTS mine_patterns_sql(UUID, INT, INT) CASCADE;

-- Update the mine_patterns_sql function to filter ignored domains
CREATE OR REPLACE FUNCTION mine_patterns_sql(
  p_user_id UUID DEFAULT NULL,
  p_min_support INT DEFAULT 3,
  p_time_window_days INT DEFAULT 7
)
RETURNS TABLE(
  pattern_count INT,
  user_count INT,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_since TIMESTAMP;
  v_pattern_count INT := 0;
  v_user_count INT := 0;
  v_last_count INT := 0;  -- Temporary variable for GET DIAGNOSTICS
  v_ignored_domains TEXT[] := ARRAY[
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    'localhost:3000',
    'localhost:3001',
    'localhost:3002',
    'localhost:8080'
  ];
BEGIN
  -- Set time window
  v_since := NOW() - (p_time_window_days || ' days')::INTERVAL;

  -- If specific user provided, mine for that user only
  IF p_user_id IS NOT NULL THEN
    -- Delete old patterns for this user
    DELETE FROM patterns 
    WHERE user_id = p_user_id 
      AND pattern_type = 'frequency';

    -- Mine patterns for single user (excluding ignored domains)
    INSERT INTO patterns (user_id, pattern_type, sequence, support, confidence, last_seen)
    WITH user_events AS (
      SELECT 
        id, user_id, ts, type, url, title, dom_path, text, meta, dwell_ms
      FROM events
      WHERE user_id = p_user_id
        AND ts >= v_since
        AND NOT (
          -- Filter out ignored domains
          url ~* 'localhost' OR
          url ~* '127\.0\.0\.1' OR
          url ~* '0\.0\.0\.0' OR
          url ~* 'localhost:3000' OR
          url ~* 'localhost:3001' OR
          url ~* 'localhost:3002' OR
          url ~* 'localhost:8080'
        )
      ORDER BY ts ASC
    ),
    sequences AS (
      SELECT 
        user_id,
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'type', type,
            'url', url,
            'title', title,
            'dom_path', dom_path,
            'text', text,
            'ts', ts
          ) ORDER BY ts
        ) AS sequence,
        COUNT(*) AS seq_length,
        MAX(ts) AS last_ts
      FROM (
        SELECT 
          user_id, id, type, url, title, dom_path, text, ts,
          ts - LAG(ts, 2) OVER (PARTITION BY user_id ORDER BY ts) AS time_gap
        FROM user_events
      ) sub
      WHERE time_gap < INTERVAL '5 minutes' OR time_gap IS NULL
      GROUP BY user_id, (ts::DATE)
      HAVING COUNT(*) >= 3 AND COUNT(*) <= 5
    ),
    pattern_groups AS (
      SELECT 
        user_id,
        sequence,
        COUNT(*) AS support,
        MAX(last_ts) AS last_ts
      FROM sequences
      GROUP BY user_id, sequence
      HAVING COUNT(*) >= p_min_support
    )
    SELECT 
      user_id,
      'frequency',
      sequence,
      support,
      LEAST(1.0, support::FLOAT / 10.0) AS confidence,
      last_ts
    FROM pattern_groups
    ON CONFLICT (user_id, sequence) DO UPDATE
    SET 
      support = EXCLUDED.support,
      confidence = EXCLUDED.confidence,
      last_seen = EXCLUDED.last_seen;

    GET DIAGNOSTICS v_pattern_count = ROW_COUNT;
    v_user_count := 1;

  ELSE
    -- Mine for all users (excluding ignored domains)
    FOR v_user_id IN SELECT DISTINCT user_id FROM events WHERE ts >= v_since LOOP
      -- Delete old patterns for this user
      DELETE FROM patterns 
      WHERE user_id = v_user_id 
        AND pattern_type = 'frequency';

      -- Mine patterns (excluding ignored domains)
      INSERT INTO patterns (user_id, pattern_type, sequence, support, confidence, last_seen)
      WITH user_events AS (
        SELECT 
          id, user_id, ts, type, url, title, dom_path, text, meta, dwell_ms
        FROM events
        WHERE user_id = v_user_id
          AND ts >= v_since
          AND NOT (
            -- Filter out ignored domains
            url ~* 'localhost' OR
            url ~* '127\.0\.0\.1' OR
            url ~* '0\.0\.0\.0' OR
            url ~* 'localhost:3000' OR
            url ~* 'localhost:3001' OR
            url ~* 'localhost:3002' OR
            url ~* 'localhost:8080'
          )
        ORDER BY ts ASC
      ),
      sequences AS (
        SELECT 
          user_id,
          jsonb_agg(
            jsonb_build_object(
              'id', id,
              'type', type,
              'url', url,
              'title', title,
              'dom_path', dom_path,
              'text', text,
              'ts', ts
            ) ORDER BY ts
          ) AS sequence,
          COUNT(*) AS seq_length,
          MAX(ts) AS last_ts
        FROM (
          SELECT 
            user_id, id, type, url, title, dom_path, text, ts,
            ts - LAG(ts, 2) OVER (PARTITION BY user_id ORDER BY ts) AS time_gap
          FROM user_events
        ) sub
        WHERE time_gap < INTERVAL '5 minutes' OR time_gap IS NULL
        GROUP BY user_id, (ts::DATE)
        HAVING COUNT(*) >= 3 AND COUNT(*) <= 5
      ),
      pattern_groups AS (
        SELECT 
          user_id,
          sequence,
          COUNT(*) AS support,
          MAX(last_ts) AS last_ts
        FROM sequences
        GROUP BY user_id, sequence
        HAVING COUNT(*) >= p_min_support
      )
      SELECT 
        user_id,
        'frequency',
        sequence,
        support,
        LEAST(1.0, support::FLOAT / 10.0) AS confidence,
        last_ts
      FROM pattern_groups
      ON CONFLICT (user_id, sequence) DO UPDATE
      SET 
        support = EXCLUDED.support,
        confidence = EXCLUDED.confidence,
        last_seen = EXCLUDED.last_seen;

      GET DIAGNOSTICS v_last_count = ROW_COUNT;
      v_pattern_count := v_pattern_count + v_last_count;
      v_user_count := v_user_count + 1;
    END LOOP;
  END IF;

  RETURN QUERY SELECT 
    v_pattern_count,
    v_user_count,
    format('Mined %s patterns for %s user(s), ignoring localhost and development domains', v_pattern_count, v_user_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mine_patterns_sql IS 'Mine frequency-based patterns from user events, excluding localhost and development domains (T19.1)';

