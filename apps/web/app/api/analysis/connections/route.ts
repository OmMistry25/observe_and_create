/**
 * /api/analysis/connections - Pattern Connections API
 * 
 * GET: Detect and return connections between patterns
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectConnections } from '@observe-create/intelligence';

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

    // Detect connections using the intelligence package
    const connections = await detectConnections(supabase, user.id);

    // Group by type
    const sequential = connections.filter(c => c.type === 'sequential');
    const triggers = connections.filter(c => c.type === 'trigger');
    const parallel = connections.filter(c => c.type === 'parallel');

    return NextResponse.json({
      success: true,
      total: connections.length,
      connections,
      by_type: {
        sequential: sequential.length,
        trigger: triggers.length,
        parallel: parallel.length,
      },
      summary: {
        sequential_workflows: sequential,
        trigger_patterns: triggers,
        alternative_approaches: parallel,
      },
    });
  } catch (error) {
    console.error('[ConnectionsAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
