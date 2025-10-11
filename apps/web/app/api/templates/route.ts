import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/templates
 * 
 * Retrieve workflow templates for pattern matching
 * Public endpoint - templates are read-only for all authenticated users
 * 
 * Query params:
 *  - category: Filter by category (optional)
 *  - tags: Comma-separated tags to filter by (optional)
 *  - limit: Number of results (default: 20, max: 100)
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const tagsParam = searchParams.get('tags');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    // Build query
    let query = supabase
      .from('pattern_templates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply category filter
    if (category) {
      query = query.eq('category', category);
    }

    // Apply tags filter (match any of the provided tags)
    if (tagsParam) {
      const tags = tagsParam.split(',').map(t => t.trim());
      query = query.overlaps('tags', tags);
    }

    const { data: templates, error: templatesError } = await query;

    if (templatesError) {
      console.error('[Templates API] Error fetching templates:', templatesError);
      return NextResponse.json(
        { error: 'Failed to fetch templates', details: templatesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      templates: templates || [],
      count: templates?.length || 0,
    });
  } catch (error) {
    console.error('[Templates API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

