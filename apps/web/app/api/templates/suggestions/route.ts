import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { matchTemplates, getTemplateSuggestionsForNewUsers } from '@observe-create/automation';

/**
 * GET /api/templates/suggestions
 * 
 * Get personalized template suggestions based on user's activity
 * Uses fuzzy matching and adjusts thresholds for new users
 * 
 * Query params:
 *  - days: Number of days of history to analyze (default: 7)
 *  - limit: Maximum number of suggestions (default: 5, max: 10)
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

    // Verify token and get user
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
    const days = Math.min(parseInt(searchParams.get('days') || '7'), 30);
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 10);

    // Get user's profile to check account age
    const { data: profile } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', user.id)
      .single();

    // Calculate user age in days
    const userAgeInDays = profile
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999; // Default to old user if profile not found

    // Get user's recent events
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data: rawEvents, error: eventsError } = await supabase
      .from('events')
      .select('id, type, url, text, meta, ts, dom_path')
      .eq('user_id', user.id)
      .gte('ts', cutoffDate.toISOString())
      .order('ts', { ascending: true })
      .limit(1000); // Limit to prevent huge datasets

    if (eventsError) {
      console.error('[Template Suggestions] Error fetching events:', eventsError);
      return NextResponse.json(
        { error: 'Failed to fetch events', details: eventsError.message },
        { status: 500 }
      );
    }

    // If user has no events, return empty suggestions
    if (!rawEvents || rawEvents.length === 0) {
      return NextResponse.json({
        suggestions: [],
        user_age_in_days: userAgeInDays,
        events_analyzed: 0,
        message: 'No activity yet. Start browsing to get automation suggestions!',
      });
    }

    // Transform events: extract domain from URL and map to expected format
    const events = rawEvents.map(event => {
      let domain = '';
      try {
        if (event.url) {
          const urlObj = new URL(event.url);
          domain = urlObj.hostname;
        }
      } catch (e) {
        // Invalid URL, leave domain empty
      }

      return {
        id: event.id,
        type: event.type,
        domain,
        url: event.url,
        text: event.text || '',
        tagName: event.meta?.tagName || '',
        meta: event.meta || {},
        ts: new Date(event.ts).getTime(),
      };
    });

    // Get all active templates
    const { data: templates, error: templatesError } = await supabase
      .from('pattern_templates')
      .select('*')
      .eq('is_active', true);

    if (templatesError || !templates) {
      console.error('[Template Suggestions] Error fetching templates:', templatesError);
      return NextResponse.json(
        { error: 'Failed to fetch templates', details: templatesError?.message },
        { status: 500 }
      );
    }

    // Match templates
    let suggestions;
    if (userAgeInDays <= 7) {
      // New user: use adjusted thresholds
      suggestions = getTemplateSuggestionsForNewUsers(events, templates, userAgeInDays);
    } else {
      // Existing user: use standard matching
      suggestions = matchTemplates(events, templates);
    }

    // Limit results
    suggestions = suggestions.slice(0, limit);

    console.log(`[Template Suggestions] User ${user.id} (${userAgeInDays} days old): ${suggestions.length} suggestions from ${events.length} events`);

    return NextResponse.json({
      suggestions,
      user_age_in_days: userAgeInDays,
      events_analyzed: events.length,
      days_analyzed: days,
      is_new_user: userAgeInDays <= 7,
    });
  } catch (error) {
    console.error('[Template Suggestions] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

