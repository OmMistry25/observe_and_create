/**
 * /api/insights/[id] - Single Insight API
 * 
 * GET: Get single insight by ID
 * PATCH: Update insight status (feedback)
 * DELETE: Delete insight
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/insights/[id]
 * Get details of a specific insight
 */
export async function GET(request: Request, { params }: RouteParams) {
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
    const { id } = params;

    const { data: insight, error } = await supabase
      .from('workflow_insights')
      .select('*, patterns(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !insight) {
      return NextResponse.json(
        { success: false, error: 'Insight not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      insight,
    });
  } catch (error) {
    console.error('[InsightAPI] Error fetching insight:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/insights/[id]
 * Update insight status (user feedback)
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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
    const { id } = params;
    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ['new', 'acknowledged', 'helpful', 'not_helpful', 'dismissed'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Update the insight
    const { data: updated, error } = await supabase
      .from('workflow_insights')
      .update({
        status,
        feedback_timestamp: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !updated) {
      console.error('[InsightAPI] Error updating insight:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update insight' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      insight: updated,
    });
  } catch (error) {
    console.error('[InsightAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/insights/[id]
 * Delete an insight
 */
export async function DELETE(request: Request, { params }: RouteParams) {
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
    const { id } = params;

    const { error } = await supabase
      .from('workflow_insights')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[InsightAPI] Error deleting insight:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete insight' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Insight deleted',
    });
  } catch (error) {
    console.error('[InsightAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
