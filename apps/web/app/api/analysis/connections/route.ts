/**
 * /api/analysis/connections - Pattern Connections API
 * 
 * GET: Detect and return connections between patterns
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/analysis/connections
 * Returns detected connections between user's patterns
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
    console.log(`[ConnectionsAPI] Detecting connections for user ${user.id}`);

    // Fallback response (intelligence package not available in Vercel build)
    return NextResponse.json({
      success: true,
      total: 0,
      connections: [],
      by_type: {
        sequential: 0,
        trigger: 0,
        parallel: 0,
      },
      summary: {
        sequential_workflows: [],
        trigger_patterns: [],
        alternative_approaches: [],
      },
      note: 'Pattern connections analysis temporarily disabled in this deployment',
    });
  } catch (error) {
    console.error('[ConnectionsAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
