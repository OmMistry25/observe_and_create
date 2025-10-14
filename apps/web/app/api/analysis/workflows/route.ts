/**
 * /api/analysis/workflows - Workflow Analysis API
 * 
 * GET: Get workflow comparisons (current vs optimal)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { compareWorkflows, identifyFrictionCauses } from '@observe-create/intelligence';
import type { Pattern } from '@observe-create/intelligence';

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

      // Generate workflow comparison
      const comparison = compareWorkflows(pattern as Pattern);
      const frictionCauses = identifyFrictionCauses(pattern as Pattern);

      return NextResponse.json({
        success: true,
        pattern_id: patternId,
        comparison,
        friction_causes: frictionCauses,
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

    // Generate comparisons for all patterns
    const analyses = patterns.map(pattern => {
      const comparison = compareWorkflows(pattern as Pattern);
      const frictionCauses = identifyFrictionCauses(pattern as Pattern);
      
      return {
        pattern_id: pattern.id,
        pattern_goal: pattern.inferred_goal,
        pattern_support: pattern.support,
        comparison,
        friction_causes: frictionCauses,
        improvement_potential: comparison.improvement.efficiency_gain,
      };
    });

    // Sort by improvement potential
    analyses.sort((a, b) => b.improvement_potential - a.improvement_potential);

    return NextResponse.json({
      success: true,
      total: analyses.length,
      analyses,
    });
  } catch (error) {
    console.error('[WorkflowsAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
