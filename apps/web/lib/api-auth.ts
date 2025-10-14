/**
 * API Authentication Helper
 * Creates authenticated Supabase client from Bearer token
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function createAuthenticatedClient(request: Request) {
  // Get auth token from header
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
      supabase: null,
      user: null,
    };
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
    return {
      error: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
      supabase: null,
      user: null,
    };
  }

  return {
    error: null,
    supabase,
    user,
  };
}

