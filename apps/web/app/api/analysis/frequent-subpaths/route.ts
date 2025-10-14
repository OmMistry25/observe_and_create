import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/analysis/frequent-subpaths
 * 
 * Returns frequently visited subpaths for the authenticated user
 * Part of Issue #1: Smart Adaptive DOM Context Extraction
 * 
 * Query params:
 * - min_visits: Minimum visit count (default: 3)
 * - limit: Number of results (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    // Get auth token from header
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

    // Get authenticated user
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

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const minVisits = parseInt(searchParams.get('min_visits') || '3');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Query frequent subpaths from materialized view
    const { data: frequentPaths, error } = await supabase
      .from('frequent_subpaths')
      .select('*')
      .eq('user_id', user.id)
      .gte('visit_count', minVisits)
      .order('visit_count', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[FrequentSubpaths] Error querying:', error);
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 }
      );
    }

    // Categorize by domain
    const byDomain = (frequentPaths || []).reduce((acc, path) => {
      try {
        const url = new URL(path.url_path);
        const domain = url.hostname.replace('www.', '');
        
        if (!acc[domain]) {
          acc[domain] = [];
        }
        
        acc[domain].push(path);
      } catch {
        // Invalid URL, skip
      }
      
      return acc;
    }, {} as Record<string, any[]>);

    // Generate insights
    const insights = generateInsights(frequentPaths || []);

    return NextResponse.json({
      success: true,
      total: frequentPaths?.length || 0,
      frequent_paths: frequentPaths || [],
      by_domain: byDomain,
      insights,
    });
  } catch (error) {
    console.error('[FrequentSubpaths] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate insights from frequent subpaths
 */
function generateInsights(paths: any[]) {
  // Top documents (Google Docs, Notion, etc.)
  const topDocuments = paths
    .filter(p => 
      p.url_path.includes('docs.google.com/document') ||
      p.url_path.includes('notion.so')
    )
    .slice(0, 5);

  // Core tools (visited 20+ times)
  const coreTools = paths
    .filter(p => p.visit_count >= 20)
    .slice(0, 10);

  // Potential timepass (many visits spread over many days)
  const potentialTimepass = paths
    .filter(p => {
      const visitsPerDay = p.visit_count / (p.days_visited || 1);
      return p.visit_count > 10 && p.days_visited > 5 && visitsPerDay < 3;
    })
    .map(p => ({
      url_path: p.url_path,
      visit_count: p.visit_count,
      days_visited: p.days_visited,
      avg_visits_per_day: p.avg_visits_per_day,
    }));

  // High-focus pages (many visits in short time span)
  const highFocus = paths
    .filter(p => {
      const visitsPerDay = p.visit_count / (p.days_visited || 1);
      return p.visit_count >= 5 && visitsPerDay >= 5;
    })
    .slice(0, 10);

  return {
    top_documents: topDocuments,
    core_tools: coreTools,
    potential_timepass: potentialTimepass,
    high_focus_pages: highFocus,
    summary: {
      total_frequent_pages: paths.length,
      most_visited: paths[0],
      avg_visits_per_page: paths.length > 0
        ? Math.round(paths.reduce((sum, p) => sum + p.visit_count, 0) / paths.length)
        : 0,
    },
  };
}

