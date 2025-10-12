'use client';

import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';

interface TemplateSuggestion {
  template_id: string;
  template_name: string;
  category: string;
  confidence: number;
  matched_events: string[];
  match_reason: string;
}

interface SuggestionsResponse {
  suggestions: TemplateSuggestion[];
  user_age_in_days: number;
  events_analyzed: number;
  days_analyzed: number;
  is_new_user: boolean;
  message?: string;
}

export default function TemplateSuggestions() {
  const [suggestions, setSuggestions] = useState<TemplateSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{
    isNewUser: boolean;
    eventsAnalyzed: number;
    message?: string;
  } | null>(null);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  async function fetchSuggestions() {
    try {
      setLoading(true);
      setError(null);

      // Get session for auth
      const { createBrowserClient } = await import('@/lib/supabase-client');
      const supabase = createBrowserClient();

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/templates/suggestions?limit=5', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      const data: SuggestionsResponse = await response.json();
      setSuggestions(data.suggestions);
      setMetadata({
        isNewUser: data.is_new_user,
        eventsAnalyzed: data.events_analyzed,
        message: data.message,
      });
    } catch (err) {
      console.error('Error fetching template suggestions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      data_transfer: 'bg-blue-100 text-blue-800',
      monitoring: 'bg-green-100 text-green-800',
      data_entry: 'bg-yellow-100 text-yellow-800',
      reporting: 'bg-purple-100 text-purple-800',
      content_creation: 'bg-pink-100 text-pink-800',
      social_media: 'bg-indigo-100 text-indigo-800',
      development: 'bg-gray-100 text-gray-800',
      shopping: 'bg-orange-100 text-orange-800',
      scheduling: 'bg-teal-100 text-teal-800',
      support: 'bg-red-100 text-red-800',
      accounting: 'bg-cyan-100 text-cyan-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">💡 Automation Suggestions</h3>
        <div className="text-gray-500">Loading suggestions...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">💡 Automation Suggestions</h3>
        <div className="text-red-500">Error: {error}</div>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">💡 Automation Suggestions</h3>
        <div className="text-gray-500">
          {metadata?.message || 'No automation suggestions yet. Keep browsing!'}
        </div>
        {metadata?.isNewUser && (
          <p className="text-sm text-gray-400 mt-2">
            As a new user, we need a bit more activity to provide meaningful suggestions.
            Analyzed {metadata.eventsAnalyzed} events so far.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">💡 Automation Suggestions</h3>
        {metadata?.isNewUser && (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
            New User Mode
          </span>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Based on {metadata?.eventsAnalyzed || 0} events, we found {suggestions.length} workflow patterns you might want to automate.
      </p>

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.template_id}
            className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-medium text-gray-900">{suggestion.template_name}</h4>
                <p className="text-sm text-gray-500 mt-1">{suggestion.match_reason}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs px-2 py-1 rounded ${getCategoryColor(suggestion.category)}`}>
                  {suggestion.category.replace('_', ' ')}
                </span>
                <span className="text-xs font-semibold text-purple-600">
                  {Math.round(suggestion.confidence * 100)}% match
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // TODO: Implement automation creation
                  alert('Automation creation coming soon!');
                }}
              >
                Create Automation
              </Button>
              <span className="text-xs text-gray-400">
                {suggestion.matched_events.length} matching events
              </span>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full mt-4"
        onClick={fetchSuggestions}
      >
        Refresh Suggestions
      </Button>
    </Card>
  );
}

