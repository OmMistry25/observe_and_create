'use client';

/**
 * Insight Cards Component
 * 
 * Displays actionable workflow insights and recommendations
 */

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase-client';

interface WorkflowInsight {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  recommendation: string;
  impact_level: 'high' | 'medium' | 'low';
  impact_score: number;
  confidence: number;
  time_saved_estimate?: number;
  effort_saved_estimate?: number;
  status: string;
  created_at: string;
  patterns?: {
    inferred_goal?: string;
    support: number;
  };
}

export default function InsightCards() {
  const [insights, setInsights] = useState<WorkflowInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const supabase = createBrowserClient();

  const fetchInsights = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const impactParam = filter !== 'all' ? `&impact=${filter}` : '';
      const response = await fetch(`/api/insights?status=new&limit=20${impactParam}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch insights');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch insights');
      }

      setInsights(data.insights || []);
    } catch (err) {
      console.error('Error fetching insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const generateInsights = async () => {
    try {
      setGenerating(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate insights');
      }

      // Refresh insights list
      await fetchInsights();
    } catch (err) {
      console.error('Error generating insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setGenerating(false);
    }
  };

  const handleFeedback = async (insightId: string, status: 'helpful' | 'not_helpful' | 'dismissed') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update insight');
      }

      // Remove from UI
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Error updating insight:', err);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [filter]);

  const getImpactBadge = (level: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200',
    };
    return colors[level as keyof typeof colors] || colors.low;
  };

  const getImpactIcon = (level: string) => {
    const icons = {
      high: '🔴',
      medium: '🟡',
      low: '🔵',
    };
    return icons[level as keyof typeof icons] || '🔵';
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}min`;
  };

  if (loading && insights.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading insights...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">💡 Workflow Insights</h2>
          <p className="text-sm text-gray-600 mt-1">
            Actionable recommendations to improve your browsing efficiency
          </p>
        </div>
        <button
          onClick={generateInsights}
          disabled={generating}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {generating ? 'Generating...' : '🔄 Generate Insights'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('high')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'high' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🔴 High Impact
        </button>
        <button
          onClick={() => setFilter('medium')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'medium' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🟡 Medium Impact
        </button>
        <button
          onClick={() => setFilter('low')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'low' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🔵 Low Impact
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Insights List */}
      {insights.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-4">No insights available yet.</p>
          <p className="text-sm text-gray-500 mb-4">
            Keep browsing to build patterns, then generate insights to see recommendations!
          </p>
          <button
            onClick={generateInsights}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {generating ? 'Generating...' : 'Generate Insights Now'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{getImpactIcon(insight.impact_level)}</span>
                    <h3 className="font-semibold text-gray-900">{insight.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getImpactBadge(insight.impact_level)}`}>
                      {insight.impact_level} impact
                    </span>
                  </div>
                  {insight.patterns?.inferred_goal && (
                    <p className="text-xs text-gray-500 mb-2">
                      Goal: {insight.patterns.inferred_goal} • Occurs {insight.patterns.support}x
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-700 mb-3">{insight.description}</p>

              {/* Recommendation */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                <p className="text-sm font-medium text-blue-900 mb-1">💡 Recommendation:</p>
                <p className="text-sm text-blue-800 whitespace-pre-line">{insight.recommendation}</p>
              </div>

              {/* Metrics */}
              <div className="flex gap-4 mb-3 text-xs text-gray-600">
                {insight.time_saved_estimate && (
                  <span className="flex items-center gap-1">
                    ⏱️ Save ~{formatTime(insight.time_saved_estimate)} per occurrence
                  </span>
                )}
                {insight.effort_saved_estimate && (
                  <span className="flex items-center gap-1">
                    ⚡ Effort reduction: {insight.effort_saved_estimate}/10
                  </span>
                )}
                <span className="flex items-center gap-1">
                  📊 Confidence: {(insight.confidence * 100).toFixed(0)}%
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleFeedback(insight.id, 'helpful')}
                  className="px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 text-xs font-medium"
                >
                  👍 Helpful
                </button>
                <button
                  onClick={() => handleFeedback(insight.id, 'not_helpful')}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-xs font-medium"
                >
                  👎 Not Helpful
                </button>
                <button
                  onClick={() => handleFeedback(insight.id, 'dismissed')}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-xs"
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

