import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/patterns/mine
 * 
 * Trigger pattern mining for the authenticated user
 * Uses the smart weighting SQL function with temporal + semantic scoring
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
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

    // 2. Call the smart pattern mining SQL function
    console.log(`[Patterns] Mining patterns for user ${user.id} with smart weighting`);
    
    const { data, error: miningError } = await supabase.rpc('mine_patterns_sql', {
      p_user_id: user.id,
      p_min_support: 2,
      p_time_window_days: 7,
    });

    if (miningError) {
      console.error('[Patterns] Error mining patterns:', miningError);
      return NextResponse.json(
        { success: false, error: 'Pattern mining failed', details: miningError.message },
        { status: 500 }
      );
    }

    const result = data?.[0];
    
    return NextResponse.json({
      success: true,
      patterns_found: result?.pattern_count || 0,
      user_count: result?.user_count || 0,
      message: result?.message || 'Pattern mining completed',
    });
  } catch (error) {
    console.error('[Patterns] Error mining patterns:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

