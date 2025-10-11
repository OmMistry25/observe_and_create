import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/patterns
 * 
 * Retrieve patterns for the authenticated user
 * Query params:
 * - type: Filter by pattern_type (frequency, temporal, semantic)
 * - min_support: Minimum support count
 * - limit: Number of results (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    // Get auth token from header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
    
    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const minSupport = parseInt(searchParams.get('min_support') || '3');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build query
    let query = supabase
      .from('patterns')
      .select('*')
      .eq('user_id', user.id)
      .gte('support', minSupport)
      .order('support', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('pattern_type', type);
    }

    const { data: patterns, error } = await query;

    if (error) {
      console.error('[Patterns] Error fetching patterns:', error);
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      patterns: patterns || [],
      count: patterns?.length || 0,
    });
  } catch (error) {
    console.error('[Patterns] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

