import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { IngestBatchSchema, IngestResponse } from '@observe-create/schemas';
import { ZodError } from 'zod';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/ingest
 * 
 * Accepts a batch of events from the browser extension,
 * validates them, inserts into the database, and queues
 * embedding jobs.
 * 
 * Authentication: Requires valid Supabase session (JWT)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Get authenticated user and create client with their token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - No token provided' },
        { status: 401 }
      );
    }

    // Create a Supabase client with the user's access token
    // This ensures RLS policies use the correct auth context
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify the token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Invalid token' },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const validationResult = IngestBatchSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          errors: validationResult.error.errors.map(
            (e) => `${e.path.join('.')}: ${e.message}`
          ),
        },
        { status: 400 }
      );
    }

    const { events } = validationResult.data;

    // 3. Insert events into database
    const eventsToInsert = events.map((event) => ({
      user_id: user.id,
      device_id: event.device_id,
      ts: event.ts,
      type: event.type,
      url: event.url,
      title: event.title || null,
      dom_path: event.dom_path || null,
      text: event.text || null,
      meta: event.meta || {},
      dwell_ms: event.dwell_ms || null,
      session_id: event.session_id || null,
      context_events: event.context_events || [],
    }));

    const { data: insertedEvents, error: insertError } = await supabase
      .from('events')
      .insert(eventsToInsert)
      .select('id');

    if (insertError) {
      console.error('Error inserting events:', insertError);
      return NextResponse.json(
        {
          success: false,
          error: 'Database error',
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    const insertedCount = insertedEvents?.length || 0;

    // 4. Queue embedding jobs (placeholder for T06)
    // For now, we'll just count events that have text content
    const queuedEmbeddings = events.filter(
      (e) => e.title || e.text || e.url
    ).length;

    // TODO T06: Actually queue embedding jobs here
    // For example: await queueEmbeddingJob(insertedEvents)

    // 5. Return success response
    const response: IngestResponse = {
      success: true,
      inserted: insertedCount,
      queued_embeddings: queuedEmbeddings,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in /api/ingest:', error);

    // Handle Zod validation errors that weren't caught
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          errors: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

