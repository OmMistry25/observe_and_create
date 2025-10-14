'use client';

/**
 * Productivity Dashboard Component
 * 
 * Shows productivity metrics and insights summary
 */

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase-client';

interface ProductivityStats {
  total_events: number;
  total_patterns: number;
  high_impact_insights: number;
  total_insights: number;
  top_domains: { domain: string; count: number }[];
  top_goals: { goal: string; count: number }[];
  friction_count: number;
  focus_time: number;
}

export default function ProductivityDashboard() {
  const [stats, setStats] = useState<ProductivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');

  const supabase = createBrowserClient();

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Calculate time range
      const now = new Date();
      const startDate = new Date();
      if (timeRange === 'day') {
        startDate.setDate(now.getDate() - 1);
      } else if (timeRange === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else {
        startDate.setMonth(now.getMonth() - 1);
      }

      // Fetch events count
      const { count: eventCount } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('timestamp', startDate.toISOString());

      // Fetch patterns count
      const { count: patternCount } = await supabase
        .from('patterns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Fetch insights
      const { data: insights } = await supabase
        .from('workflow_insights')
        .select('impact_level')
        .eq('user_id', user.id)
        .eq('status', 'new');

      const highImpactCount = insights?.filter(i => i.impact_level === 'high').length || 0;

      // Fetch top domains (from events)
      const { data: events } = await supabase
        .from('events')
        .select('url')
        .eq('user_id', user.id)
        .gte('timestamp', startDate.toISOString())
        .limit(1000);

      const domainCounts: Record<string, number> = {};
      events?.forEach(event => {
        try {
          const url = new URL(event.url);
          const domain = url.hostname;
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        } catch {
          // Skip invalid URLs
        }
      });

      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count }));

      // Fetch top goals (from patterns)
      const { data: patterns } = await supabase
        .from('patterns')
        .select('inferred_goal, support')
        .eq('user_id', user.id)
        .not('inferred_goal', 'is', null);

      const goalCounts: Record<string, number> = {};
      patterns?.forEach(pattern => {
        if (pattern.inferred_goal) {
          goalCounts[pattern.inferred_goal] = (goalCounts[pattern.inferred_goal] || 0) + pattern.support;
        }
      });

      const topGoals = Object.entries(goalCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([goal, count]) => ({ goal, count }));

      // Fetch friction events
      const { data: frictionEvents } = await supabase
        .from('interaction_quality')
        .select('friction_score')
        .eq('user_id', user.id)
        .gte('friction_score', 0.6);

      setStats({
        total_events: eventCount || 0,
        total_patterns: patternCount || 0,
        high_impact_insights: highImpactCount,
        total_insights: insights?.length || 0,
        top_domains: topDomains,
        top_goals: topGoals,
        friction_count: frictionEvents?.length || 0,
        focus_time: 0, // TODO: Calculate from dwell events
      });
    } catch (err) {
      console.error('Error fetching productivity stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading stats...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">📊 Productivity Intelligence</h2>
          <p className="text-sm text-gray-600 mt-1">
            Overview of your browsing patterns and insights
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange('day')}
            className={`px-3 py-1 rounded text-sm ${
              timeRange === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            24h
          </button>
          <button
            onClick={() => setTimeRange('week')}
            className={`px-3 py-1 rounded text-sm ${
              timeRange === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            7d
          </button>
          <button
            onClick={() => setTimeRange('month')}
            className={`px-3 py-1 rounded text-sm ${
              timeRange === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            30d
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium mb-1">Total Activity</p>
          <p className="text-3xl font-bold text-blue-900">{stats?.total_events || 0}</p>
          <p className="text-xs text-blue-700 mt-1">Events captured</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-purple-600 font-medium mb-1">Patterns</p>
          <p className="text-3xl font-bold text-purple-900">{stats?.total_patterns || 0}</p>
          <p className="text-xs text-purple-700 mt-1">Detected workflows</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium mb-1">Insights</p>
          <p className="text-3xl font-bold text-green-900">{stats?.total_insights || 0}</p>
          <p className="text-xs text-green-700 mt-1">
            {stats?.high_impact_insights || 0} high impact
          </p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <p className="text-sm text-yellow-600 font-medium mb-1">Friction</p>
          <p className="text-3xl font-bold text-yellow-900">{stats?.friction_count || 0}</p>
          <p className="text-xs text-yellow-700 mt-1">Points detected</p>
        </div>
      </div>

      {/* Top Domains & Goals */}
      <div className="grid grid-cols-2 gap-6">
        {/* Top Domains */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">🌐 Most Visited</h3>
          {stats?.top_domains && stats.top_domains.length > 0 ? (
            <div className="space-y-2">
              {stats.top_domains.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-900 truncate flex-1">{item.domain}</span>
                  <span className="text-sm font-medium text-gray-600 ml-2">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data yet</p>
          )}
        </div>

        {/* Top Goals */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">🎯 Top Workflows</h3>
          {stats?.top_goals && stats.top_goals.length > 0 ? (
            <div className="space-y-2">
              {stats.top_goals.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-900 truncate flex-1">{item.goal}</span>
                  <span className="text-sm font-medium text-gray-600 ml-2">{item.count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No patterns detected yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

