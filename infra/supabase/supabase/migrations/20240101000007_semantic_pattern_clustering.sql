-- ============================================================================
-- T17.2: SEMANTIC PATTERN CLUSTERING
-- Cluster semantically similar sequences using embedding distance
-- Groups different surface actions that achieve same goal
-- ============================================================================

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing functions if they exist (to ensure clean migration)
DROP FUNCTION IF EXISTS cluster_semantic_patterns(UUID, FLOAT, INT) CASCADE;
DROP FUNCTION IF EXISTS cluster_patterns_by_event_similarity(UUID, FLOAT) CASCADE;
DROP FUNCTION IF EXISTS cluster_patterns_by_event_similarity() CASCADE;

-- Function to cluster patterns based on semantic similarity
-- Uses event_embeddings to find patterns with similar meanings
-- even if they have different exact sequences
CREATE OR REPLACE FUNCTION cluster_semantic_patterns(
  target_user_id UUID DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.7,
  min_cluster_size INT DEFAULT 2
)
RETURNS TABLE (
  clusters_created INT,
  patterns_clustered INT
) AS $$
DECLARE
  v_clusters_created INT := 0;
  v_patterns_clustered INT := 0;
  v_cluster_id TEXT;
  v_pattern_record RECORD;
  v_similar_pattern RECORD;
  v_avg_embedding FLOAT[];
  v_similarity FLOAT;
BEGIN
  -- Clear existing semantic cluster assignments for the target user (or all if NULL)
  IF target_user_id IS NOT NULL THEN
    UPDATE patterns 
    SET semantic_cluster_id = NULL 
    WHERE user_id = target_user_id AND pattern_type IN ('frequency', 'temporal');
  ELSE
    UPDATE patterns 
    SET semantic_cluster_id = NULL 
    WHERE pattern_type IN ('frequency', 'temporal');
  END IF;

  -- Iterate through patterns that don't have a cluster yet
  FOR v_pattern_record IN
    SELECT p.id, p.user_id, p.sequence
    FROM patterns p
    WHERE p.semantic_cluster_id IS NULL
      AND p.pattern_type IN ('frequency', 'temporal')
      AND (target_user_id IS NULL OR p.user_id = target_user_id)
    ORDER BY p.support DESC, p.confidence DESC
  LOOP
    -- Generate a unique cluster ID for this pattern
    v_cluster_id := 'cluster_' || encode(gen_random_bytes(8), 'hex');
    
    -- Assign this pattern to the new cluster
    UPDATE patterns
    SET semantic_cluster_id = v_cluster_id
    WHERE id = v_pattern_record.id;
    
    v_patterns_clustered := v_patterns_clustered + 1;

    -- Find similar patterns using embedding similarity
    -- Compare average embeddings of events in each pattern's sequence
    FOR v_similar_pattern IN
      SELECT 
        p2.id,
        p2.sequence,
        AVG(cosine_similarity) as avg_similarity
      FROM patterns p2
      CROSS JOIN LATERAL (
        -- Get event IDs from both sequences
        SELECT 
          jsonb_array_elements_text(p2.sequence) as event_id_json
      ) seq2
      LEFT JOIN LATERAL (
        -- Calculate average cosine similarity between embeddings
        SELECT 
          AVG(
            (
              SELECT 1 - (ee1.embedding <=> ee2.embedding) as cosine_sim
              FROM event_embeddings ee1
              CROSS JOIN event_embeddings ee2
              WHERE ee1.event_id IN (
                SELECT (jsonb_array_elements_text(v_pattern_record.sequence)::jsonb->>'id')::uuid
              )
              AND ee2.event_id = (seq2.event_id_json::jsonb->>'id')::uuid
              LIMIT 1
            )
          ) as cosine_similarity
        FROM generate_series(1, 1) -- dummy to enable lateral join
      ) sim ON true
      WHERE p2.semantic_cluster_id IS NULL
        AND p2.id != v_pattern_record.id
        AND p2.user_id = v_pattern_record.user_id
        AND p2.pattern_type IN ('frequency', 'temporal')
      GROUP BY p2.id, p2.sequence
      HAVING AVG(cosine_similarity) >= similarity_threshold
    LOOP
      -- Add this similar pattern to the cluster
      UPDATE patterns
      SET semantic_cluster_id = v_cluster_id
      WHERE id = v_similar_pattern.id;
      
      v_patterns_clustered := v_patterns_clustered + 1;
    END LOOP;

    v_clusters_created := v_clusters_created + 1;
  END LOOP;

  -- Clean up clusters that are too small
  DELETE FROM patterns p1
  WHERE p1.semantic_cluster_id IN (
    SELECT p2.semantic_cluster_id
    FROM patterns p2
    WHERE p2.semantic_cluster_id IS NOT NULL
    GROUP BY p2.semantic_cluster_id
    HAVING COUNT(*) < min_cluster_size
  );

  -- Update patterns count after cleanup
  GET DIAGNOSTICS v_patterns_clustered = ROW_COUNT;

  RETURN QUERY SELECT v_clusters_created, v_patterns_clustered;
END;
$$ LANGUAGE plpgsql;

-- Simpler version: Cluster patterns based on semantic similarity of their event sequences
-- This version uses a more straightforward approach: comparing event text/titles
CREATE OR REPLACE FUNCTION cluster_patterns_by_event_similarity(
  target_user_id UUID DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE (
  clusters_created INT,
  patterns_updated INT
) AS $$
DECLARE
  v_clusters_created INT := 0;
  v_patterns_updated INT := 0;
  v_cluster_counter INT := 0;
  v_pattern RECORD;
  v_similar_pattern RECORD;
  v_cluster_id TEXT;
  v_pattern_embedding vector(384);
  v_similar_embedding vector(384);
  v_similarity FLOAT;
BEGIN
  -- Reset semantic cluster IDs for target user
  IF target_user_id IS NOT NULL THEN
    UPDATE patterns 
    SET semantic_cluster_id = NULL 
    WHERE user_id = target_user_id 
      AND pattern_type IN ('frequency', 'temporal');
  ELSE
    UPDATE patterns 
    SET semantic_cluster_id = NULL 
    WHERE pattern_type IN ('frequency', 'temporal');
  END IF;

  -- Process each unclustered pattern
  FOR v_pattern IN
    SELECT 
      p.id,
      p.user_id,
      p.sequence,
      p.support,
      p.confidence
    FROM patterns p
    WHERE p.semantic_cluster_id IS NULL
      AND p.pattern_type IN ('frequency', 'temporal')
      AND (target_user_id IS NULL OR p.user_id = target_user_id)
    ORDER BY p.support DESC, p.confidence DESC NULLS LAST
  LOOP
    -- Generate new cluster ID
    v_cluster_id := 'sem_' || v_pattern.user_id || '_' || v_cluster_counter;
    v_cluster_counter := v_cluster_counter + 1;

    -- Assign pattern to cluster
    UPDATE patterns
    SET semantic_cluster_id = v_cluster_id
    WHERE id = v_pattern.id;

    v_patterns_updated := v_patterns_updated + 1;

    -- Get average embedding for this pattern's events
    SELECT AVG(ee.embedding)::vector(384)
    INTO v_pattern_embedding
    FROM jsonb_array_elements(v_pattern.sequence) AS seq(event_obj)
    JOIN event_embeddings ee ON ee.event_id = (seq.event_obj->>'id')::uuid
    WHERE ee.embedding IS NOT NULL;

    -- Skip if no embeddings found
    CONTINUE WHEN v_pattern_embedding IS NULL;

    -- Find similar patterns and add them to the same cluster
    FOR v_similar_pattern IN
      SELECT DISTINCT
        p2.id,
        p2.sequence,
        1 - (avg_emb.embedding <=> v_pattern_embedding) as similarity
      FROM patterns p2
      CROSS JOIN LATERAL (
        SELECT AVG(ee2.embedding)::vector(384) as embedding
        FROM jsonb_array_elements(p2.sequence) AS seq2(event_obj)
        JOIN event_embeddings ee2 ON ee2.event_id = (seq2.event_obj->>'id')::uuid
        WHERE ee2.embedding IS NOT NULL
      ) avg_emb
      WHERE p2.semantic_cluster_id IS NULL
        AND p2.id != v_pattern.id
        AND p2.user_id = v_pattern.user_id
        AND p2.pattern_type IN ('frequency', 'temporal')
        AND avg_emb.embedding IS NOT NULL
        AND (1 - (avg_emb.embedding <=> v_pattern_embedding)) >= similarity_threshold
    LOOP
      UPDATE patterns
      SET semantic_cluster_id = v_cluster_id
      WHERE id = v_similar_pattern.id;

      v_patterns_updated := v_patterns_updated + 1;
    END LOOP;

    v_clusters_created := v_clusters_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_clusters_created, v_patterns_updated;
END;
$$ LANGUAGE plpgsql;

-- Convenience wrapper with no parameters
CREATE OR REPLACE FUNCTION cluster_patterns_by_event_similarity()
RETURNS TABLE (
  clusters_created INT,
  patterns_updated INT
) AS $$
BEGIN
  RETURN QUERY SELECT * FROM cluster_patterns_by_event_similarity(NULL, 0.75);
END;
$$ LANGUAGE plpgsql;

-- Schedule weekly semantic clustering job (Mondays at 4 AM UTC)
-- Runs after temporal pattern mining to cluster all patterns
SELECT cron.schedule(
  'weekly-semantic-clustering',
  '0 4 * * 1', -- Every Monday at 4 AM UTC
  $$SELECT cluster_patterns_by_event_similarity();$$
);

-- Create a view to see cluster statistics
CREATE OR REPLACE VIEW pattern_cluster_stats AS
SELECT 
  p.user_id,
  p.semantic_cluster_id,
  COUNT(*) as pattern_count,
  AVG(p.support) as avg_support,
  AVG(p.confidence) as avg_confidence,
  MIN(p.first_seen) as cluster_first_seen,
  MAX(p.last_seen) as cluster_last_seen,
  jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'type', p.pattern_type,
      'support', p.support,
      'confidence', p.confidence,
      'sequence_length', jsonb_array_length(p.sequence)
    ) ORDER BY p.support DESC
  ) as patterns
FROM patterns p
WHERE p.semantic_cluster_id IS NOT NULL
GROUP BY p.user_id, p.semantic_cluster_id;

COMMENT ON FUNCTION cluster_semantic_patterns(UUID, FLOAT, INT) IS 'T17.2: Cluster semantically similar patterns using embedding distance';
COMMENT ON FUNCTION cluster_patterns_by_event_similarity(UUID, FLOAT) IS 'T17.2: Simpler clustering based on average event embeddings';
COMMENT ON VIEW pattern_cluster_stats IS 'T17.2: Statistics about semantic pattern clusters';

