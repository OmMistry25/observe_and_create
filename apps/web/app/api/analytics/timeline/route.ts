import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/analytics/timeline
 * 
 * Get dwell time aggregated by hour and domain
 * Returns 24-hour aggregation with optional intent breakdown
 * 
 * Query params:
 *  - hours: Number of hours to look back (default: 24, max: 168 = 7 days)
 *  - domain: Optional domain filter
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
    const hours = Math.min(parseInt(searchParams.get('hours') || '24'), 168);
    const domainFilter = searchParams.get('domain');

    // Calculate the start time
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    // Fetch events from the last N hours
    let query = supabase
      .from('events')
      .select(`
        id,
        ts,
        url,
        dwell_ms,
        type,
        interaction_quality (
          inferred_intent
        )
      `)
      .eq('user_id', user.id)
      .gte('ts', startTime.toISOString())
      .order('ts', { ascending: true });

    if (domainFilter) {
      query = query.ilike('url', `%${domainFilter}%`);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error('[Timeline API] Error fetching events:', eventsError);
      return NextResponse.json(
        { error: 'Failed to fetch events', details: eventsError.message },
        { status: 500 }
      );
    }

    // Aggregate data by hour and domain
    const aggregatedData = aggregateTimelineData(events || [], hours);

    return NextResponse.json({
      data: aggregatedData,
      hours,
      domain: domainFilter || null,
      totalEvents: events?.length || 0,
    });
  } catch (error: any) {
    console.error('[Timeline API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Aggregate events into hourly buckets with domain and intent breakdown
 */
function aggregateTimelineData(events: any[], hours: number) {
  // Create hourly buckets
  const now = new Date();
  const buckets: any[] = [];

  for (let i = hours - 1; i >= 0; i--) {
    const bucketTime = new Date(now);
    bucketTime.setHours(now.getHours() - i, 0, 0, 0);
    
    buckets.push({
      timestamp: bucketTime.toISOString(),
      hour: bucketTime.getHours(),
      label: bucketTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        hour12: true 
      }),
      totalDwell: 0,
      eventCount: 0,
      domains: {} as Record<string, {
        dwell: number;
        count: number;
        intents: Record<string, number>;
      }>,
    });
  }

  // Aggregate events into buckets
  events.forEach((event) => {
    const eventTime = new Date(event.ts);
    const bucketIndex = buckets.findIndex((bucket) => {
      const bucketTime = new Date(bucket.timestamp);
      const nextBucketTime = new Date(bucketTime);
      nextBucketTime.setHours(nextBucketTime.getHours() + 1);
      return eventTime >= bucketTime && eventTime < nextBucketTime;
    });

    if (bucketIndex === -1) return;

    const bucket = buckets[bucketIndex];
    const domain = extractDomain(event.url);
    const dwell = event.dwell_ms || 0;
    const intent = event.interaction_quality?.inferred_intent || 'unknown';

    // Update bucket totals
    bucket.totalDwell += dwell;
    bucket.eventCount += 1;

    // Update domain data
    if (!bucket.domains[domain]) {
      bucket.domains[domain] = {
        dwell: 0,
        count: 0,
        intents: {},
      };
    }

    bucket.domains[domain].dwell += dwell;
    bucket.domains[domain].count += 1;

    // Update intent breakdown for domain
    if (!bucket.domains[domain].intents[intent]) {
      bucket.domains[domain].intents[intent] = 0;
    }
    bucket.domains[domain].intents[intent] += dwell;
  });

  // Convert domains object to array for easier rendering
  return buckets.map((bucket) => ({
    timestamp: bucket.timestamp,
    hour: bucket.hour,
    label: bucket.label,
    totalDwell: Math.round(bucket.totalDwell / 1000), // Convert to seconds
    eventCount: bucket.eventCount,
    domains: Object.entries(bucket.domains).map(([domain, data]: [string, any]) => ({
      domain,
      dwell: Math.round(data.dwell / 1000), // Convert to seconds
      count: data.count,
      intents: data.intents,
    })),
  }));
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

