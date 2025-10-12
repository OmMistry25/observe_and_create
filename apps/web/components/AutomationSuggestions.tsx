'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase-client';

/**
 * T19: Automation Suggestions Component
 * 
 * Displays automation suggestions generated from patterns and templates
 */

interface Suggestion {
  id: string;
  source_type: 'pattern' | 'template';
  name: string;
  description: string;
  confidence: number;
  evidence: string;
  sequence: any[];
  metadata: any;
}

export default function AutomationSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  async function fetchSuggestions() {
    try {
      setLoading(true);
      setError(null);

      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/suggest?limit=10', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      console.log('[AutomationSuggestions] API Response:', data);
      
      if (data.success) {
        setSuggestions(data.suggestions || []);
      } else {
        setError(data.error || 'Failed to fetch suggestions');
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">🤖 Automation Suggestions</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">🤖 Automation Suggestions</h2>
        <div className="text-red-600 text-center py-4">
          Error: {error}
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">🤖 Automation Suggestions</h2>
        <div className="text-gray-500 text-center py-8">
          <p className="mb-2">No automation suggestions yet.</p>
          <p className="text-sm">Keep using the extension to detect patterns that can be automated!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">🤖 Automation Suggestions</h2>
        <span className="text-sm text-gray-500">
          {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-4">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{suggestion.name}</h3>
                  {suggestion.source_type === 'template' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
                      Template
                    </span>
                  )}
                  {suggestion.source_type === 'pattern' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200">
                      Your Pattern
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
              </div>
              <div className="ml-4">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    suggestion.confidence >= 0.8
                      ? 'bg-green-100 text-green-800'
                      : suggestion.confidence >= 0.6
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {Math.round(suggestion.confidence * 100)}% confidence
                </span>
              </div>
            </div>

            {/* Evidence */}
            <div className="bg-gray-50 rounded p-3 mb-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">📊 Evidence:</span> {suggestion.evidence}
              </p>
            </div>

            {/* Sequence Preview */}
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">Workflow steps:</p>
              <div className="flex items-center space-x-2 overflow-x-auto">
                {suggestion.sequence.slice(0, 5).map((step: any, idx: number) => (
                  <div key={idx} className="flex items-center">
                    <div className="flex-shrink-0 bg-indigo-50 px-2 py-1 rounded text-xs">
                      {step.type}
                    </div>
                    {idx < Math.min(4, suggestion.sequence.length - 1) && (
                      <span className="text-gray-400 mx-1">→</span>
                    )}
                  </div>
                ))}
                {suggestion.sequence.length > 5 && (
                  <span className="text-xs text-gray-400">
                    +{suggestion.sequence.length - 5} more
                  </span>
                )}
              </div>
            </div>

            {/* Metadata */}
            {suggestion.metadata && (
              <div className="flex items-center space-x-4 text-xs text-gray-500 mb-3">
                {suggestion.metadata.support && (
                  <span>Detected {suggestion.metadata.support}x</span>
                )}
                {suggestion.metadata.domains && suggestion.metadata.domains.length > 0 && (
                  <span>
                    on {suggestion.metadata.domains.slice(0, 2).join(', ')}
                    {suggestion.metadata.domains.length > 2 && ` +${suggestion.metadata.domains.length - 2}`}
                  </span>
                )}
                {suggestion.metadata.pattern_type && (
                  <span className="capitalize">{suggestion.metadata.pattern_type} pattern</span>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors text-sm font-medium"
                onClick={() => {
                  // T20: Will implement approval flow
                  alert('Approval flow coming in T20!');
                }}
              >
                Create Automation
              </button>
              <button
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-sm"
                onClick={() => {
                  // Dismiss suggestion
                  setSuggestions(suggestions.filter(s => s.id !== suggestion.id));
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Refresh button */}
      <div className="mt-4 text-center">
        <button
          onClick={fetchSuggestions}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          ↻ Refresh suggestions
        </button>
      </div>
    </div>
  );
}

