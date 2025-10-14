-- Proper Pattern Grouping Fix
-- This completely rewrites the pattern mining logic to correctly group patterns

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
BEGIN
  v_since := NOW() - (p_time_window_days || ' days')::INTERVAL;

  IF p_user_id IS NOT NULL THEN
    DELETE FROM patterns 
    WHERE user_id = p_user_id 
      AND pattern_type = 'frequency';

    INSERT INTO patterns (user_id, pattern_type, sequence, support, confidence, last_seen)
    WITH user_events AS (
      -- Get all non-localhost events with quality and time decay scores
      SELECT 
        id, user_id, ts, type, url, title, dom_path, text, meta, dwell_ms,
        semantic_context,
        REGEXP_REPLACE(REGEXP_REPLACE(url, '^https?://(www\.)?', ''), '/.*$', '') as domain,
        -- Quality score based on semantic richness
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
        -- Exponential time decay (recent = 1.0, 4+ days old = 0.3)
        GREATEST(0.3, 
          EXP(-0.3 * EXTRACT(EPOCH FROM (NOW() - ts)) / 86400.0)
        ) AS time_decay,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts) AS event_num
      FROM events
      WHERE user_id = p_user_id
        AND ts >= v_since
        AND NOT (
          url ~* 'localhost' OR
          url ~* '127\.0\.0\.1' OR
          url ~* '0\.0\.0\.0'
        )
      ORDER BY ts ASC
    ),
    weighted_events AS (
      SELECT 
        *,
        (POWER(time_decay, 0.6) * POWER(event_quality, 0.4)) AS event_weight
      FROM user_events
    ),
    -- Create sliding windows of 3-5 consecutive events
    event_sequences AS (
      SELECT
        user_id,
        event_num,
        3 AS window_size,
        -- Create a sequence of exactly 3 consecutive events
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
          ) ORDER BY event_num
        ) AS sequence,
        -- Pattern key for matching (normalized)
        array_agg(type || ':' || domain ORDER BY event_num) AS pattern_key,
        SUM(event_weight) AS total_weight,
        AVG(event_quality) AS avg_quality,
        MAX(ts) AS last_ts
      FROM (
        SELECT 
          e1.user_id, e1.event_num,
          e1.id, e1.type, e1.url, e1.title, e1.domain, e1.dom_path, e1.text, e1.ts, 
          e1.semantic_context, e1.event_weight, e1.event_quality
        FROM weighted_events e1
        UNION ALL
        SELECT 
          e2.user_id, e1.event_num,
          e2.id, e2.type, e2.url, e2.title, e2.domain, e2.dom_path, e2.text, e2.ts,
          e2.semantic_context, e2.event_weight, e2.event_quality
        FROM weighted_events e1
        JOIN weighted_events e2 ON e2.user_id = e1.user_id AND e2.event_num = e1.event_num + 1
        WHERE e2.ts - e1.ts < INTERVAL '5 minutes'
        UNION ALL
        SELECT 
          e3.user_id, e1.event_num,
          e3.id, e3.type, e3.url, e3.title, e3.domain, e3.dom_path, e3.text, e3.ts,
          e3.semantic_context, e3.event_weight, e3.event_quality
        FROM weighted_events e1
        JOIN weighted_events e2 ON e2.user_id = e1.user_id AND e2.event_num = e1.event_num + 1
        JOIN weighted_events e3 ON e3.user_id = e1.user_id AND e3.event_num = e1.event_num + 2
        WHERE e2.ts - e1.ts < INTERVAL '5 minutes'
          AND e3.ts - e2.ts < INTERVAL '5 minutes'
      ) sequences_expanded
      GROUP BY user_id, event_num
      HAVING COUNT(*) = 3  -- Only 3-event sequences for now
    ),
    -- Group by pattern_key to find recurring patterns
    pattern_groups AS (
      SELECT 
        user_id,
        pattern_key,
        COUNT(*) AS raw_support,
        SUM(total_weight) AS total_weighted_support,
        AVG(avg_quality) AS pattern_quality,
        -- Use the most recent sequence as the canonical one
        (array_agg(sequence ORDER BY last_ts DESC))[1] AS sequence,
        MAX(last_ts) AS last_ts
      FROM event_sequences
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
          ) AS time_decay,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts) AS event_num
        FROM events
        WHERE user_id = v_user_id
          AND ts >= v_since
          AND NOT (
            url ~* 'localhost' OR
            url ~* '127\.0\.0\.1' OR
            url ~* '0\.0\.0\.0'
          )
        ORDER BY ts ASC
      ),
      weighted_events AS (
        SELECT 
          *,
          (POWER(time_decay, 0.6) * POWER(event_quality, 0.4)) AS event_weight
        FROM user_events
      ),
      event_sequences AS (
        SELECT
          user_id,
          event_num,
          3 AS window_size,
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
            ) ORDER BY event_num
          ) AS sequence,
          array_agg(type || ':' || domain ORDER BY event_num) AS pattern_key,
          SUM(event_weight) AS total_weight,
          AVG(event_quality) AS avg_quality,
          MAX(ts) AS last_ts
        FROM (
          SELECT 
            e1.user_id, e1.event_num,
            e1.id, e1.type, e1.url, e1.title, e1.domain, e1.dom_path, e1.text, e1.ts, 
            e1.semantic_context, e1.event_weight, e1.event_quality
          FROM weighted_events e1
          UNION ALL
          SELECT 
            e2.user_id, e1.event_num,
            e2.id, e2.type, e2.url, e2.title, e2.domain, e2.dom_path, e2.text, e2.ts,
            e2.semantic_context, e2.event_weight, e2.event_quality
          FROM weighted_events e1
          JOIN weighted_events e2 ON e2.user_id = e1.user_id AND e2.event_num = e1.event_num + 1
          WHERE e2.ts - e1.ts < INTERVAL '5 minutes'
          UNION ALL
          SELECT 
            e3.user_id, e1.event_num,
            e3.id, e3.type, e3.url, e3.title, e3.domain, e3.dom_path, e3.text, e3.ts,
            e3.semantic_context, e3.event_weight, e3.event_quality
          FROM weighted_events e1
          JOIN weighted_events e2 ON e2.user_id = e1.user_id AND e2.event_num = e1.event_num + 1
          JOIN weighted_events e3 ON e3.user_id = e1.user_id AND e3.event_num = e1.event_num + 2
          WHERE e2.ts - e1.ts < INTERVAL '5 minutes'
            AND e3.ts - e2.ts < INTERVAL '5 minutes'
        ) sequences_expanded
        GROUP BY user_id, event_num
        HAVING COUNT(*) = 3
      ),
      pattern_groups AS (
        SELECT 
          user_id,
          pattern_key,
          COUNT(*) AS raw_support,
          SUM(total_weight) AS total_weighted_support,
          AVG(avg_quality) AS pattern_quality,
          (array_agg(sequence ORDER BY last_ts DESC))[1] AS sequence,
          MAX(last_ts) AS last_ts
        FROM event_sequences
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

COMMENT ON FUNCTION mine_patterns_sql IS 'Mines 3-event sequence patterns with proper grouping by normalized pattern_key. Uses sliding window approach with self-joins to create consecutive event sequences, then groups by type:domain pattern to find recurring workflows.';

