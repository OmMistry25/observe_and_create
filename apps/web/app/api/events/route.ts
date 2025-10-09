import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/events
 * 
 * Fetch user's events with pagination and filtering
 * Query params:
 *  - page: Page number (default: 1)
 *  - limit: Items per page (default: 20, max: 100)
 *  - domain: Filter by domain
 *  - type: Filter by event type
 *  - intent: Filter by inferred intent
 */
export async function GET(request: NextRequest) {
  try {
    // Get auth token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create Supabase client with user token
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

    // Verify token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const domain = searchParams.get('domain');
    const type = searchParams.get('type');
    const intent = searchParams.get('intent');

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('events')
      .select(`
        id,
        ts,
        type,
        url,
        title,
        text,
        dwell_ms,
        dom_path,
        meta,
        interaction_quality (
          friction_score,
          success,
          inferred_intent,
          struggle_signals
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('ts', { ascending: false });

    // Apply filters
    if (domain) {
      // Extract domain from URL
      query = query.ilike('url', `%${domain}%`);
    }

    if (type) {
      query = query.eq('type', type);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: events, error: eventsError, count } = await query;

    if (eventsError) {
      console.error('[Events API] Error fetching events:', eventsError);
      return NextResponse.json(
        { error: 'Failed to fetch events', details: eventsError.message },
        { status: 500 }
      );
    }

    // If intent filter is provided, filter in-memory
    // (since it requires joining with interaction_quality)
    let filteredEvents = events || [];
    if (intent) {
      filteredEvents = filteredEvents.filter(
        (event: any) => event.interaction_quality?.inferred_intent === intent
      );
    }

    // Calculate pagination info
    const totalPages = count ? Math.ceil(count / limit) : 0;

    return NextResponse.json({
      events: filteredEvents,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        domain: domain || null,
        type: type || null,
        intent: intent || null,
      },
    });
  } catch (error: any) {
    console.error('[Events API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

