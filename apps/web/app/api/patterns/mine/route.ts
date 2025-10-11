import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mineFrequencyPatterns, storePatterns } from '@observe-create/automation';

/**
 * POST /api/patterns/mine
 * 
 * Trigger pattern mining for the authenticated user
 * Mines frequency-based patterns from recent activity
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

    // 2. Mine patterns
    console.log(`[Patterns] Mining patterns for user ${user.id}`);
    const patterns = await mineFrequencyPatterns(supabase, user.id);

    // 3. Store patterns
    const storedCount = await storePatterns(supabase, patterns);

    return NextResponse.json({
      success: true,
      patterns_found: patterns.length,
      patterns_stored: storedCount,
    });
  } catch (error) {
    console.error('[Patterns] Error mining patterns:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

