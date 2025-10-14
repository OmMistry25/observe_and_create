-- Fix Pattern Grouping Logic
-- Problem: Patterns were grouped by full sequence JSON including unique IDs and timestamps
-- Solution: Create a normalized pattern_key for matching, store full sequence for context

DROP FUNCTION IF EXISTS mine_patterns_sql(UUID, INT, INT) CASCADE;

CREATE OR REPLACE FUNCTION mine_patterns_sql(
  p_user_id UUID DEFAULT NULL,
  p_min_support INT DEFAULT 2,
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
  v_last_count INT := 0;
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
  v_since := NOW() - (p_time_window_days || ' days')::INTERVAL;

  IF p_user_id IS NOT NULL THEN
    DELETE FROM patterns 
    WHERE user_id = p_user_id 
      AND pattern_type = 'frequency';

    INSERT INTO patterns (user_id, pattern_type, sequence, support, confidence, last_seen)
    WITH user_events AS (
      SELECT 
        id, user_id, ts, type, url, title, dom_path, text, meta, dwell_ms,
        semantic_context,
        -- Extract domain for pattern matching
        REGEXP_REPLACE(REGEXP_REPLACE(url, '^https?://(www\.)?', ''), '/.*$', '') as domain,
        -- Quality score
        CASE
          WHEN semantic_context IS NULL THEN 0.3
          ELSE LEAST(1.0, 
            0.2 +
            CASE WHEN semantic_context->>'purpose' IS NOT NULL THEN 0.2 ELSE 0 END +
            CASE WHEN semantic_context->'journeyState'->>'sessionDuration' IS NOT NULL THEN 0.2 ELSE 0 END +
            CASE WHEN (semantic_context->'journeyState'->>'scrollDepth')::FLOAT > 50 THEN 0.2 ELSE 0 END +
            CASE WHEN (semantic_context->'journeyState'->>'interactionDepth')::INT > 5 THEN 0.2 ELSE 0 END
          )
        END AS event_quality,
        -- Time decay
        GREATEST(0.3, 
          EXP(-0.3 * EXTRACT(EPOCH FROM (NOW() - ts)) / 86400.0)
        ) AS time_decay
      FROM events
      WHERE user_id = p_user_id
        AND ts >= v_since
        AND NOT (
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
    weighted_events AS (
      SELECT 
        *,
        (POWER(time_decay, 0.6) * POWER(event_quality, 0.4)) AS event_weight
      FROM user_events
    ),
    sequences AS (
      SELECT 
        user_id,
        -- FULL sequence with all context (for storage)
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'type', type,
            'url', url,
            'title', title,
            'domain', domain,
            'dom_path', dom_path,
            'text', text,
            'ts', ts,
            'semantic_context', semantic_context,
            'weight', ROUND(event_weight::NUMERIC, 3)
          ) ORDER BY ts
        ) AS sequence,
        -- NORMALIZED key for matching (type:domain pattern)
        array_agg(type || ':' || domain ORDER BY ts) AS pattern_key,
        COUNT(*) AS seq_length,
        SUM(event_weight) AS weighted_support,
        MAX(ts) AS last_ts,
        AVG(event_quality) AS avg_quality
      FROM (
        SELECT 
          user_id, id, type, url, title, domain, dom_path, text, ts, semantic_context,
          event_quality, event_weight,
          ts - LAG(ts, 2) OVER (PARTITION BY user_id ORDER BY ts) AS time_gap
        FROM weighted_events
      ) sub
      WHERE time_gap < INTERVAL '5 minutes' OR time_gap IS NULL
      GROUP BY user_id, (ts::DATE), ARRAY[id, type, url]  -- Group events that are close together
      HAVING COUNT(*) >= 3 AND COUNT(*) <= 5
    ),
    pattern_groups AS (
      SELECT 
        user_id,
        -- Use first occurrence's full sequence as the canonical one
        (array_agg(sequence ORDER BY last_ts DESC))[1] AS sequence,
        pattern_key,
        COUNT(*) AS raw_support,
        SUM(weighted_support) AS total_weighted_support,
        AVG(avg_quality) AS pattern_quality,
        MAX(last_ts) AS last_ts
      FROM sequences
      GROUP BY user_id, pattern_key  -- ✅ Group by normalized pattern, not full sequence!
      HAVING COUNT(*) >= p_min_support
    )
    SELECT 
      user_id,
      'frequency',
      sequence,
      raw_support::INT AS support,
      LEAST(1.0, 
        (total_weighted_support / GREATEST(10.0, raw_support)) * pattern_quality
      ) AS confidence,
      last_ts
    FROM pattern_groups
    ON CONFLICT (user_id, sequence) DO UPDATE
    SET 
      support = EXCLUDED.support,
      confidence = EXCLUDED.confidence,
      last_seen = EXCLUDED.last_seen;

    GET DIAGNOSTICS v_last_count = ROW_COUNT;
    v_pattern_count := v_pattern_count + v_last_count;
    v_user_count := 1;

  ELSE
    -- Mine for all users
    FOR v_user_id IN SELECT DISTINCT user_id FROM events WHERE ts >= v_since LOOP
      DELETE FROM patterns 
      WHERE user_id = v_user_id 
        AND pattern_type = 'frequency';

      INSERT INTO patterns (user_id, pattern_type, sequence, support, confidence, last_seen)
      WITH user_events AS (
        SELECT 
          id, user_id, ts, type, url, title, dom_path, text, meta, dwell_ms,
          semantic_context,
          REGEXP_REPLACE(REGEXP_REPLACE(url, '^https?://(www\.)?', ''), '/.*$', '') as domain,
          CASE
            WHEN semantic_context IS NULL THEN 0.3
            ELSE LEAST(1.0, 
              0.2 +
              CASE WHEN semantic_context->>'purpose' IS NOT NULL THEN 0.2 ELSE 0 END +
              CASE WHEN semantic_context->'journeyState'->>'sessionDuration' IS NOT NULL THEN 0.2 ELSE 0 END +
              CASE WHEN (semantic_context->'journeyState'->>'scrollDepth')::FLOAT > 50 THEN 0.2 ELSE 0 END +
              CASE WHEN (semantic_context->'journeyState'->>'interactionDepth')::INT > 5 THEN 0.2 ELSE 0 END
            )
          END AS event_quality,
          GREATEST(0.3, 
            EXP(-0.3 * EXTRACT(EPOCH FROM (NOW() - ts)) / 86400.0)
          ) AS time_decay
        FROM events
        WHERE user_id = v_user_id
          AND ts >= v_since
          AND NOT (
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
      weighted_events AS (
        SELECT 
          *,
          (POWER(time_decay, 0.6) * POWER(event_quality, 0.4)) AS event_weight
        FROM user_events
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
              'domain', domain,
              'dom_path', dom_path,
              'text', text,
              'ts', ts,
              'semantic_context', semantic_context,
              'weight', ROUND(event_weight::NUMERIC, 3)
            ) ORDER BY ts
          ) AS sequence,
          array_agg(type || ':' || domain ORDER BY ts) AS pattern_key,
          COUNT(*) AS seq_length,
          SUM(event_weight) AS weighted_support,
          MAX(ts) AS last_ts,
          AVG(event_quality) AS avg_quality
        FROM (
          SELECT 
            user_id, id, type, url, title, domain, dom_path, text, ts, semantic_context,
            event_quality, event_weight,
            ts - LAG(ts, 2) OVER (PARTITION BY user_id ORDER BY ts) AS time_gap
          FROM weighted_events
        ) sub
        WHERE time_gap < INTERVAL '5 minutes' OR time_gap IS NULL
        GROUP BY user_id, (ts::DATE), ARRAY[id, type, url]
        HAVING COUNT(*) >= 3 AND COUNT(*) <= 5
      ),
      pattern_groups AS (
        SELECT 
          user_id,
          (array_agg(sequence ORDER BY last_ts DESC))[1] AS sequence,
          pattern_key,
          COUNT(*) AS raw_support,
          SUM(weighted_support) AS total_weighted_support,
          AVG(avg_quality) AS pattern_quality,
          MAX(last_ts) AS last_ts
        FROM sequences
        GROUP BY user_id, pattern_key
        HAVING COUNT(*) >= p_min_support
      )
      SELECT 
        user_id,
        'frequency',
        sequence,
        raw_support::INT AS support,
        LEAST(1.0, 
          (total_weighted_support / GREATEST(10.0, raw_support)) * pattern_quality
        ) AS confidence,
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
    v_pattern_count AS pattern_count,
    v_user_count AS user_count,
    'Mined ' || v_pattern_count || ' patterns for ' || v_user_count || ' user(s) with smart weighting (min support: ' || p_min_support || ')' AS message;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mine_patterns_sql IS 'Mines patterns with smart weighting and proper grouping. Patterns are matched by normalized type:domain sequences but store full context including semantic_context. Fixed: Now groups by pattern_key instead of full sequence JSON.';

