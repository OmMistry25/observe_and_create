import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { inferGoalFromSequence, type EventSequence } from '@observe-create/automation/src/goal-inference';

/**
 * POST /api/patterns/infer-goals
 * 
 * Trigger goal inference for patterns
 * Uses OpenAI API with heuristic fallback
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

    // 2. Get patterns without goals
    const { data: patterns, error: patternsError } = await supabase
      .from('patterns')
      .select('id, sequence, support, confidence')
      .eq('user_id', user.id)
      .is('inferred_goal', null)
      .gte('support', 3)
      .gte('confidence', 0.3)
      .order('support', { ascending: false })
      .limit(10); // Process 10 patterns per request

    if (patternsError) {
      console.error('[InferGoals] Error fetching patterns:', patternsError);
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 }
      );
    }

    if (!patterns || patterns.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No patterns need goal inference',
        processed: 0,
      });
    }

    console.log(`[InferGoals] Processing ${patterns.length} patterns for user ${user.id}`);

    // 3. Infer goals for each pattern
    let processed = 0;
    const results = [];

    for (const pattern of patterns) {
      try {
        // Convert pattern sequence to EventSequence format
        const sequence: EventSequence = {
          events: Array.isArray(pattern.sequence) 
            ? pattern.sequence 
            : [],
        };

        if (sequence.events.length === 0) {
          console.log(`[InferGoals] Skipping pattern ${pattern.id}: empty sequence`);
          continue;
        }

        // Infer goal using OpenAI (or heuristic fallback)
        const openaiKey = process.env.OPENAI_API_KEY;
        const inferredGoal = await inferGoalFromSequence(sequence, openaiKey);

        // Update pattern with inferred goal
        const { error: updateError } = await supabase
          .from('patterns')
          .update({
            inferred_goal: inferredGoal.goal,
            goal_confidence: inferredGoal.confidence,
            goal_category: inferredGoal.goal_category,
            automation_potential: inferredGoal.automation_potential,
            goal_reasoning: inferredGoal.reasoning,
          })
          .eq('id', pattern.id);

        if (updateError) {
          console.error(`[InferGoals] Error updating pattern ${pattern.id}:`, updateError);
          results.push({
            pattern_id: pattern.id,
            success: false,
            error: updateError.message,
          });
        } else {
          processed++;
          results.push({
            pattern_id: pattern.id,
            success: true,
            goal: inferredGoal.goal,
            confidence: inferredGoal.confidence,
            automation_potential: inferredGoal.automation_potential,
          });
        }

      } catch (error) {
        console.error(`[InferGoals] Error processing pattern ${pattern.id}:`, error);
        results.push({
          pattern_id: pattern.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`[InferGoals] Successfully processed ${processed}/${patterns.length} patterns`);

    return NextResponse.json({
      success: true,
      processed,
      total: patterns.length,
      results,
    });

  } catch (error) {
    console.error('[InferGoals] Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/patterns/infer-goals
 * 
 * Check status of goal inference
 */
export async function GET(request: NextRequest) {
  try {
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

    // Get statistics
    const { data: stats, error: statsError } = await supabase
      .from('patterns')
      .select('inferred_goal, goal_category, goal_confidence, automation_potential')
      .eq('user_id', user.id);

    if (statsError) {
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 }
      );
    }

    const total = stats?.length || 0;
    const withGoals = stats?.filter(p => p.inferred_goal).length || 0;
    const withoutGoals = total - withGoals;

    const goalBreakdown = stats
      ?.filter(p => p.goal_category)
      .reduce((acc, p) => {
        acc[p.goal_category] = (acc[p.goal_category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const avgAutomationPotential = stats
      ?.filter(p => p.automation_potential)
      .reduce((sum, p) => sum + (p.automation_potential || 0), 0) / withGoals || 0;

    return NextResponse.json({
      success: true,
      stats: {
        total_patterns: total,
        patterns_with_goals: withGoals,
        patterns_without_goals: withoutGoals,
        goal_breakdown: goalBreakdown,
        avg_automation_potential: Math.round(avgAutomationPotential * 100) / 100,
      },
    });

  } catch (error) {
    console.error('[InferGoals] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

