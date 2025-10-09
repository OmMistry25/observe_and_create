import { createServerSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({
        status: 'unauthenticated',
        message: 'No authenticated user. RLS will block all queries.',
        user: null,
      });
    }

    // Try to query profiles (should only return current user's profile)
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*');

    // Try to query events (should only return current user's events)
    const { data: events, error: eventError } = await supabase
      .from('events')
      .select('*')
      .limit(5);

    return NextResponse.json({
      status: 'authenticated',
      message: 'RLS policies are active',
      user: {
        id: user.id,
        email: user.email,
      },
      tests: {
        profiles: {
          success: !profileError,
          count: profiles?.length ?? 0,
          error: profileError?.message,
          note: 'Should only see your own profile',
        },
        events: {
          success: !eventError,
          count: events?.length ?? 0,
          error: eventError?.message,
          note: 'Should only see your own events',
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

