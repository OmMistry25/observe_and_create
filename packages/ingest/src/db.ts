import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding, createEventText, cosineSimilarity } from './embeddings';

/**
 * Generate and store embedding for a single event
 * 
 * @param supabase - Supabase client (with user auth context)
 * @param eventId - ID of the event to embed
 * @param eventData - Event data containing title, text, url
 * @returns The created embedding record
 */
export async function generateEventEmbedding(
  supabase: SupabaseClient,
  eventId: string,
  eventData: {
    title?: string;
    text?: string;
    url: string;
  }
) {
  // Create combined text for embedding
  const textToEmbed = createEventText(eventData);

  if (!textToEmbed || textToEmbed.trim().length === 0) {
    console.warn(`[Embeddings] Skipping event ${eventId} - no text to embed`);
    return null;
  }

  try {
    // Generate embedding vector
    const embedding = await generateEmbedding(textToEmbed);

    // Store in database
    const { data, error } = await supabase
      .from('event_embeddings')
      .insert({
        event_id: eventId,
        embedding_model: 'all-MiniLM-L6-v2',
        embedding: embedding, // Stored as JSONB
      })
      .select()
      .single();

    if (error) {
      console.error(`[Embeddings] Error storing embedding for event ${eventId}:`, error);
      throw error;
    }

    console.log(`[Embeddings] Generated embedding for event ${eventId}`);
    return data;
  } catch (error) {
    console.error(`[Embeddings] Failed to generate embedding for event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple events in batch
 * More efficient than calling generateEventEmbedding multiple times
 * 
 * @param supabase - Supabase client (with user auth context)
 * @param events - Array of events to embed
 * @returns Number of embeddings successfully created
 */
export async function generateEventEmbeddingsBatch(
  supabase: SupabaseClient,
  events: Array<{
    id: string;
    title?: string;
    text?: string;
    url: string;
  }>
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  try {
    // Generate embeddings for all events
    const embeddingPromises = events.map(async (event) => {
      const textToEmbed = createEventText(event);
      
      if (!textToEmbed || textToEmbed.trim().length === 0) {
        return null;
      }

      const embedding = await generateEmbedding(textToEmbed);
      
      return {
        event_id: event.id,
        embedding_model: 'all-MiniLM-L6-v2',
        embedding: embedding,
      };
    });

    const embeddingRecords = (await Promise.all(embeddingPromises)).filter(Boolean);

    if (embeddingRecords.length === 0) {
      console.warn('[Embeddings] No valid events to embed');
      return 0;
    }

    // Insert all embeddings
    const { data, error } = await supabase
      .from('event_embeddings')
      .insert(embeddingRecords)
      .select();

    if (error) {
      console.error('[Embeddings] Error storing embeddings batch:', error);
      throw error;
    }

    console.log(`[Embeddings] Generated ${data.length} embeddings`);
    return data.length;
  } catch (error) {
    console.error('[Embeddings] Failed to generate embeddings batch:', error);
    throw error;
  }
}

/**
 * Find k nearest neighbor events using cosine similarity
 * 
 * @param supabase - Supabase client
 * @param queryEmbedding - The embedding vector to search for
 * @param k - Number of results to return
 * @param userId - User ID to filter results (for RLS)
 * @returns Array of similar events with similarity scores
 */
export async function findSimilarEvents(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  k: number = 5,
  userId?: string
) {
  try {
    // Fetch all embeddings for the user
    // Note: This is a simple implementation. For large datasets,
    // you'd want to use pgvector's built-in similarity search
    let query = supabase
      .from('event_embeddings')
      .select(`
        id,
        event_id,
        embedding,
        events!inner (
          id,
          user_id,
          ts,
          type,
          url,
          title,
          text,
          dwell_ms
        )
      `);

    if (userId) {
      query = query.eq('events.user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Embeddings] Error fetching embeddings:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Calculate similarity scores
    const results = data
      .map((record: any) => {
        const embeddingArray = Array.isArray(record.embedding)
          ? record.embedding
          : Object.values(record.embedding);
        
        const similarity = cosineSimilarity(queryEmbedding, embeddingArray as number[]);
        
        return {
          ...record.events,
          similarity,
          embedding_id: record.id,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);

    return results;
  } catch (error) {
    console.error('[Embeddings] Failed to find similar events:', error);
    throw error;
  }
}

/**
 * Find similar events using a text query
 * Convenience function that generates an embedding and searches
 * 
 * @param supabase - Supabase client
 * @param queryText - Text to search for
 * @param k - Number of results to return
 * @param userId - User ID to filter results
 * @returns Array of similar events with similarity scores
 */
export async function searchEventsByText(
  supabase: SupabaseClient,
  queryText: string,
  k: number = 5,
  userId?: string
) {
  // Generate embedding for query text
  const queryEmbedding = await generateEmbedding(queryText);
  
  // Search using the embedding
  return findSimilarEvents(supabase, queryEmbedding, k, userId);
}

