/**
 * /api/insights - Workflow Insights API
 * 
 * GET: List insights for the authenticated user
 * POST: Generate new insights from patterns
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/insights
 * Returns workflow insights for the authenticated user
 */
export async function GET(request: Request) {
  // Get auth token from header
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
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

  // Verify token and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // new, acknowledged, helpful, not_helpful, dismissed
    const impactLevel = searchParams.get('impact'); // high, medium, low
    const insightType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('workflow_insights')
      .select('*, patterns(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (impactLevel) {
      query = query.eq('impact_level', impactLevel);
    }
    if (insightType) {
      query = query.eq('insight_type', insightType);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: insights, error } = await query;

    if (error) {
      console.error('[InsightsAPI] Error fetching insights:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch insights' },
        { status: 500 }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('workflow_insights')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (status) countQuery = countQuery.eq('status', status);
    if (impactLevel) countQuery = countQuery.eq('impact_level', impactLevel);
    if (insightType) countQuery = countQuery.eq('insight_type', insightType);

    const { count } = await countQuery;

    return NextResponse.json({
      success: true,
      insights: insights || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[InsightsAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/insights
 * Generate new insights from user's patterns
 */
export async function POST(request: Request) {
  // Get auth token from header
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
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

  // Verify token and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log(`[InsightsAPI] Generating insights for user ${user.id}`);

    // Fallback response (intelligence package not available in Vercel build)
    return NextResponse.json({
      success: true,
      message: 'Insights generation temporarily disabled in this deployment',
      generated: 0,
      insights: [],
    });
  } catch (error) {
    console.error('[InsightsAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

