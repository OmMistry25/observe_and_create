/**
 * /api/analysis/workflows - Workflow Analysis API
 * 
 * GET: Get workflow comparisons (current vs optimal)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/analysis/workflows
 * Returns workflow analysis and comparisons for user's patterns
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
    const patternId = searchParams.get('pattern_id');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (patternId) {
      // Get specific pattern analysis
      const { data: pattern, error } = await supabase
        .from('patterns')
        .select('*')
        .eq('id', patternId)
        .eq('user_id', user.id)
        .single();

      if (error || !pattern) {
        return NextResponse.json(
          { success: false, error: 'Pattern not found' },
          { status: 404 }
        );
      }

      // Fallback response (intelligence package not available in Vercel build)
      return NextResponse.json({
        success: true,
        pattern_id: patternId,
        note: 'Workflow analysis temporarily disabled in this deployment',
      });
    }

    // Get all workflow comparisons for user
    const { data: patterns, error: patternsError } = await supabase
      .from('patterns')
      .select('*')
      .eq('user_id', user.id)
      .gte('support', 3)
      .order('support', { ascending: false })
      .limit(limit);

    if (patternsError || !patterns) {
      console.error('[WorkflowsAPI] Error fetching patterns:', patternsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch patterns' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      total: patterns.length,
      note: 'Workflow analysis temporarily disabled in this deployment',
      pattern_ids: patterns.map(p => p.id),
    });
  } catch (error) {
    console.error('[WorkflowsAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
