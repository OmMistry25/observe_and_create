import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/embeddings/search?q=search+query&k=5
 * 
 * Search for similar events using semantic search
 * Returns k most similar events to the query text
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const k = parseInt(searchParams.get('k') || '5');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    // Simple fallback: keyword search using ILIKE when embeddings util is unavailable
    const { data, error } = await supabase
      .from('events')
      .select('id, title, text, url, ts')
      .eq('user_id', user.id)
      .or(`title.ilike.%${query}%,text.ilike.%${query}%`)
      .limit(k);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      query,
      results: data || [],
      count: data?.length || 0,
      note: 'Fallback keyword search used (embeddings module unavailable)'
    });
  } catch (error: any) {
    console.error('[Embeddings Search] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

