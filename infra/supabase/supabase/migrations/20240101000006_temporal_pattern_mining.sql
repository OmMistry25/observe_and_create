-- T17.1: Temporal Pattern Mining
-- Detects time-based patterns: hour-of-day, day-of-week, recurring schedules

-- Drop any existing versions of the function to avoid conflicts
DROP FUNCTION IF EXISTS mine_temporal_patterns();
DROP FUNCTION IF EXISTS mine_temporal_patterns(UUID, INT, INT);

-- Function to mine temporal patterns
-- Analyzes event timing to find recurring schedules like "every Monday 9am" or "after email check"
CREATE OR REPLACE FUNCTION mine_temporal_patterns(
  target_user_id UUID DEFAULT NULL,
  min_occurrences INT DEFAULT 3,
  lookback_days INT DEFAULT 30
)
RETURNS TABLE (
  patterns_found INT,
  patterns_updated INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  current_user_id UUID;
  total_patterns INT := 0;
  updated_patterns INT := 0;
  pattern_record RECORD;
BEGIN
  -- If no user specified, process all users
  IF target_user_id IS NULL THEN
    FOR current_user_id IN 
      SELECT DISTINCT user_id 
      FROM events 
      WHERE ts >= NOW() - (lookback_days || ' days')::INTERVAL
    LOOP
      -- Recursively call for each user
      PERFORM mine_temporal_patterns(current_user_id, min_occurrences, lookback_days);
    END LOOP;
    RETURN QUERY SELECT 0::INT, 0::INT;
    RETURN;
  END IF;

  current_user_id := target_user_id;

  -- Mine temporal patterns from existing patterns
  -- For each pattern, analyze when it occurs
  FOR pattern_record IN
    SELECT 
      p.id as pattern_id,
      p.sequence,
      p.support,
      ARRAY_AGG(DISTINCT EXTRACT(DOW FROM e.ts)::INT ORDER BY EXTRACT(DOW FROM e.ts)::INT) as days_of_week,
      ARRAY_AGG(DISTINCT EXTRACT(HOUR FROM e.ts)::INT ORDER BY EXTRACT(HOUR FROM e.ts)::INT) as hours_of_day,
      COUNT(DISTINCT DATE(e.ts)) as unique_days,
      MODE() WITHIN GROUP (ORDER BY EXTRACT(DOW FROM e.ts)::INT) as most_common_dow,
      MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM e.ts)::INT) as most_common_hour,
      COUNT(*) as occurrence_count
    FROM patterns p
    CROSS JOIN LATERAL (
      SELECT ts, type, url
      FROM events 
      WHERE user_id = current_user_id
        AND ts >= NOW() - (lookback_days || ' days')::INTERVAL
    ) e
    WHERE p.user_id = current_user_id
      AND p.pattern_type = 'frequency'
      -- Match events that are part of this pattern
      -- (Simplified: match by checking if event appears in pattern sequence)
      AND EXISTS (
        SELECT 1 
        FROM jsonb_array_elements(p.sequence) as seq_elem
        WHERE seq_elem->>'url' = e.url
          AND seq_elem->>'type' = e.type
      )
    GROUP BY p.id, p.sequence, p.support
    HAVING COUNT(*) >= min_occurrences
  LOOP
    total_patterns := total_patterns + 1;

    -- Build temporal pattern description
    DECLARE
      temporal_desc TEXT;
      dow_names TEXT[] := ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      recurrence_type TEXT;
    BEGIN
      -- Determine recurrence type
      IF pattern_record.unique_days >= lookback_days * 0.7 THEN
        recurrence_type := 'daily';
        temporal_desc := format('Daily around %sh:00', pattern_record.most_common_hour);
      ELSIF array_length(pattern_record.days_of_week, 1) = 1 THEN
        recurrence_type := 'weekly';
        temporal_desc := format('Every %s around %sh:00', 
          dow_names[pattern_record.most_common_dow + 1], 
          pattern_record.most_common_hour);
      ELSIF array_length(pattern_record.days_of_week, 1) <= 3 THEN
        recurrence_type := 'specific_days';
        temporal_desc := format('On specific days around %sh:00', pattern_record.most_common_hour);
      ELSE
        recurrence_type := 'variable';
        temporal_desc := 'Variable schedule';
      END IF;

      -- Update pattern with temporal information
      UPDATE patterns
      SET 
        temporal_pattern = jsonb_build_object(
          'recurrence_type', recurrence_type,
          'description', temporal_desc,
          'days_of_week', pattern_record.days_of_week,
          'hours_of_day', pattern_record.hours_of_day,
          'most_common_dow', pattern_record.most_common_dow,
          'most_common_hour', pattern_record.most_common_hour,
          'unique_days', pattern_record.unique_days,
          'occurrence_count', pattern_record.occurrence_count
        ),
        last_seen = NOW()
      WHERE id = pattern_record.pattern_id;

      updated_patterns := updated_patterns + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT total_patterns, updated_patterns;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mine_temporal_patterns(UUID, INT, INT) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION mine_temporal_patterns(UUID, INT, INT) IS 
  'Mines temporal patterns from existing frequency patterns - detects recurring schedules based on time of day and day of week';

-- Create a convenience wrapper with no parameters for cron job
CREATE OR REPLACE FUNCTION mine_temporal_patterns()
RETURNS TABLE (
  patterns_found INT,
  patterns_updated INT
)
LANGUAGE SQL
AS $$
  SELECT * FROM mine_temporal_patterns(NULL::UUID, 3, 30);
$$;

-- Grant execute on the no-parameter version
GRANT EXECUTE ON FUNCTION mine_temporal_patterns() TO authenticated;

-- Add comment for no-parameter version
COMMENT ON FUNCTION mine_temporal_patterns() IS 
  'Convenience wrapper for mine_temporal_patterns(NULL, 3, 30) - mines all users with default parameters';

-- Schedule weekly job for temporal pattern mining (runs Sundays at 3 AM UTC)
-- This analyzes patterns over a longer timeframe (30 days) to detect weekly/monthly patterns
SELECT cron.schedule(
  'weekly-temporal-pattern-mining',
  '0 3 * * 0',  -- Every Sunday at 3 AM UTC
  $$SELECT mine_temporal_patterns()$$
);

