import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * T20: Automation Approval API
 * 
 * POST /api/automations
 * Creates an automation from a suggestion
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

    // 2. Parse request body
    const body = await request.json();
    const {
      name,
      description,
      pattern_id,
      sequence,
      scope,
    } = body;

    if (!name || !sequence) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, sequence' },
        { status: 400 }
      );
    }

    // 3. Generate automation from pattern
    const automation = {
      user_id: user.id,
      name,
      description: description || `Automated workflow based on detected pattern`,
      trigger: {
        kind: 'manual', // T20: Start with manual triggers, will add URL/schedule in T23
        spec: {},
      },
      actions: generateActionsFromSequence(sequence),
      scope: scope || {
        domains: extractDomainsFromSequence(sequence),
        permissions: ['tabs', 'activeTab'],
      },
      status: 'approved', // T20: User approved this suggestion
      created_from_pattern: pattern_id || null,
      template_id: null,
    };

    // 4. Insert automation
    const { data, error } = await supabase
      .from('automations')
      .insert(automation)
      .select()
      .single();

    if (error) {
      console.error('[Automations] Error creating automation:', error);
      return NextResponse.json(
        { success: false, error: 'Database error', details: error.message },
        { status: 500 }
      );
    }

    console.log(`[Automations] Created automation ${data.id} for user ${user.id}`);

    return NextResponse.json({
      success: true,
      automation: data,
    });
  } catch (error) {
    console.error('[Automations] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate actions array from event sequence
 */
function generateActionsFromSequence(sequence: any[]): any[] {
  const actions = [];

  for (const event of sequence) {
    if (event.type === 'click') {
      actions.push({
        kind: 'click',
        spec: {
          url: event.url,
          dom_path: event.dom_path,
          text: event.text,
        },
        selectors: generateSelectors(event), // T21: Will implement multi-strategy selectors
      });
    } else if (event.type === 'form') {
      actions.push({
        kind: 'fill',
        spec: {
          url: event.url,
          dom_path: event.dom_path,
          value: '[user_input]', // Placeholder for user customization
        },
        selectors: generateSelectors(event),
      });
    } else if (event.type === 'search') {
      actions.push({
        kind: 'search',
        spec: {
          url: event.url,
          query: event.text || '[search_query]',
        },
        selectors: generateSelectors(event),
      });
    } else if (event.type === 'nav') {
      actions.push({
        kind: 'navigate',
        spec: {
          url: event.url,
        },
      });
    }
  }

  return actions;
}

/**
 * Generate basic selectors from event (T21 will implement multi-strategy)
 */
function generateSelectors(event: any): any {
  return {
    strategies: [
      {
        type: 'css',
        value: event.dom_path || 'body',
        priority: 1,
      },
      {
        type: 'text',
        value: event.text || '',
        priority: 2,
      },
    ],
  };
}

/**
 * Extract unique domains from sequence
 */
function extractDomainsFromSequence(sequence: any[]): string[] {
  const domains = new Set<string>();

  for (const event of sequence) {
    try {
      const url = new URL(event.url);
      domains.add(url.hostname);
    } catch {
      // Skip invalid URLs
    }
  }

  return Array.from(domains);
}

/**
 * GET /api/automations
 * List user's automations
 */
export async function GET(request: NextRequest) {
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

    // 2. Fetch user's automations
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Automations] Error fetching automations:', error);
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      automations: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('[Automations] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

