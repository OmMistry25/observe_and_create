'use client';

/**
 * Workflow Comparison Component
 * 
 * Shows side-by-side comparison of current vs optimized workflow
 */

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase-client';

interface WorkflowStep {
  step: number;
  action: string;
  domain?: string;
  time_estimate?: number;
  is_redundant?: boolean;
  is_friction?: boolean;
}

interface WorkflowAnalysis {
  pattern_id: string;
  pattern_goal?: string;
  pattern_support: number;
  comparison: {
    current: {
      steps: WorkflowStep[];
      total_time: number;
      total_steps: number;
      friction_points: number;
    };
    suggested: {
      steps: WorkflowStep[];
      total_time: number;
      total_steps: number;
      friction_points: number;
    };
    improvement: {
      steps_saved: number;
      time_saved: number;
      friction_reduced: number;
      efficiency_gain: number;
    };
    explanation: string;
  };
  friction_causes: string[];
}

export default function WorkflowComparison() {
  const [analyses, setAnalyses] = useState<WorkflowAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  const supabase = createBrowserClient();

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/analysis/workflows?limit=10', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch workflow analyses');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch workflow analyses');
      }

      setAnalyses(data.analyses || []);
      if (data.analyses && data.analyses.length > 0) {
        setSelectedPattern(data.analyses[0].pattern_id);
      }
    } catch (err) {
      console.error('Error fetching analyses:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analyses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyses();
  }, []);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Analyzing workflows...</span>
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

  if (analyses.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Workflow Comparisons</h2>
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No workflows to analyze yet.</p>
          <p className="text-sm text-gray-500 mt-2">
            Keep browsing to build patterns that can be optimized!
          </p>
        </div>
      </div>
    );
  }

  const selected = analyses.find(a => a.pattern_id === selectedPattern);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Workflow Comparisons</h2>

      {/* Pattern Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select a workflow to analyze:
        </label>
        <select
          value={selectedPattern || ''}
          onChange={(e) => setSelectedPattern(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {analyses.map((analysis) => (
            <option key={analysis.pattern_id} value={analysis.pattern_id}>
              {analysis.pattern_goal || `Pattern ${analysis.pattern_id.slice(0, 8)}`}
              {' '}
              ({analysis.pattern_support}x) - Save {analysis.comparison.improvement.steps_saved} steps
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium mb-1">Steps Saved</p>
              <p className="text-2xl font-bold text-blue-900">
                {selected.comparison.improvement.steps_saved}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                {selected.comparison.current.total_steps} → {selected.comparison.suggested.total_steps} steps
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600 font-medium mb-1">Time Saved</p>
              <p className="text-2xl font-bold text-green-900">
                {formatTime(selected.comparison.improvement.time_saved)}
              </p>
              <p className="text-xs text-green-700 mt-1">
                Per occurrence
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-purple-600 font-medium mb-1">Efficiency Gain</p>
              <p className="text-2xl font-bold text-purple-900">
                {selected.comparison.improvement.efficiency_gain.toFixed(0)}%
              </p>
              <p className="text-xs text-purple-700 mt-1">
                Improvement
              </p>
            </div>
          </div>

          {/* Explanation */}
          {selected.comparison.explanation && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900">{selected.comparison.explanation}</p>
            </div>
          )}

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Current Workflow */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-red-500">📋</span>
                Current Workflow
                <span className="text-xs font-normal text-gray-500">
                  ({selected.comparison.current.total_steps} steps, {formatTime(selected.comparison.current.total_time)})
                </span>
              </h3>
              <div className="space-y-2">
                {selected.comparison.current.steps.map((step, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded border ${
                      step.is_redundant
                        ? 'bg-red-50 border-red-200'
                        : step.is_friction
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium text-gray-600 min-w-[24px]">
                        {step.step}.
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{step.action}</p>
                        {step.domain && step.domain !== 'unknown' && (
                          <p className="text-xs text-gray-500 mt-1">{step.domain}</p>
                        )}
                        <div className="flex gap-2 mt-1">
                          {step.is_redundant && (
                            <span className="text-xs text-red-600">🔁 Redundant</span>
                          )}
                          {step.is_friction && (
                            <span className="text-xs text-yellow-600">⚠️ Friction</span>
                          )}
                          {step.time_estimate && (
                            <span className="text-xs text-gray-500">
                              ~{formatTime(step.time_estimate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested Workflow */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-green-500">✅</span>
                Optimized Workflow
                <span className="text-xs font-normal text-gray-500">
                  ({selected.comparison.suggested.total_steps} steps, {formatTime(selected.comparison.suggested.total_time)})
                </span>
              </h3>
              <div className="space-y-2">
                {selected.comparison.suggested.steps.map((step, index) => (
                  <div
                    key={index}
                    className="p-3 rounded border bg-green-50 border-green-200"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium text-gray-600 min-w-[24px]">
                        {step.step}.
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{step.action}</p>
                        {step.domain && step.domain !== 'unknown' && (
                          <p className="text-xs text-gray-500 mt-1">{step.domain}</p>
                        )}
                        {step.time_estimate && (
                          <p className="text-xs text-gray-500 mt-1">
                            ~{formatTime(step.time_estimate)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Friction Causes */}
          {selected.friction_causes && selected.friction_causes.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-900 mb-2">⚠️ Detected Issues:</h4>
              <ul className="space-y-1">
                {selected.friction_causes.map((cause, index) => (
                  <li key={index} className="text-sm text-yellow-800">
                    • {cause}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

