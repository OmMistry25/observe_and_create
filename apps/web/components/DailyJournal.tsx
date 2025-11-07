'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface JournalEntry {
  id: string;
  date: string;
  generated_at: string;
  top_domains: Array<{
    domain: string;
    visits: number;
    time_spent_ms: number;
  }>;
  intent_breakdown: Record<string, {
    count: number;
    time_spent_ms: number;
  }>;
  pattern_summary: {
    frequency_patterns: Array<{
      description: string;
      confidence: number;
      occurrences: number;
    }>;
    temporal_patterns: Array<{
      type: string;
      description: string;
      confidence: number;
    }>;
  };
  productivity_insights: string[];
  total_events: number;
  active_time_ms: number;
  sessions: number;
}

export function DailyJournal() {
  const [journal, setJournal] = useState<JournalEntry | null>(null);
  const [allJournals, setAllJournals] = useState<JournalEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    loadJournal(today);
    loadAllJournals();
  }, []);

  const loadJournal = async (date: string) => {
    setLoading(true);
    try {
      // Request journal from extension
      const response = await chrome.runtime.sendMessage({
        type: 'GET_JOURNAL',
        date,
      });

      if (response.success && response.journal) {
        setJournal(response.journal);
      } else {
        setJournal(null);
      }
    } catch (error) {
      console.error('Failed to load journal:', error);
      setJournal(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAllJournals = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ALL_JOURNALS',
      });

      if (response.success) {
        setAllJournals(response.journals || []);
      }
    } catch (error) {
      console.error('Failed to load journals:', error);
    }
  };

  const generateJournal = async () => {
    setGenerating(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_JOURNAL',
        date: selectedDate,
        useLLM: true,
      });

      if (response.success) {
        setJournal(response.journal);
        loadAllJournals();
      } else {
        alert('Failed to generate journal: ' + response.error);
      }
    } catch (error) {
      console.error('Failed to generate journal:', error);
      alert('Failed to generate journal');
    } finally {
      setGenerating(false);
    }
  };

  const formatTime = (ms: number): string => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Daily Digital Journal</h2>
          <p className="text-muted-foreground mt-1">
            AI-powered insights from your daily browsing patterns
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              loadJournal(e.target.value);
            }}
            className="px-3 py-2 border rounded-md"
          />
          <Button
            onClick={generateJournal}
            disabled={generating}
          >
            {generating ? '🔄 Generating...' : '📔 Generate Journal'}
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading journal...
          </CardContent>
        </Card>
      )}

      {/* No Journal State */}
      {!loading && !journal && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No journal entry for {formatDate(selectedDate)}
            </p>
            <Button onClick={generateJournal} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Now'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Journal Content */}
      {!loading && journal && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Events</CardDescription>
                <CardTitle className="text-3xl">{journal.total_events}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Time</CardDescription>
                <CardTitle className="text-3xl">{formatTime(journal.active_time_ms)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Sessions</CardDescription>
                <CardTitle className="text-3xl">{journal.sessions}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Patterns</CardDescription>
                <CardTitle className="text-3xl">
                  {journal.pattern_summary.frequency_patterns.length + journal.pattern_summary.temporal_patterns.length}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Top Domains */}
          <Card>
            <CardHeader>
              <CardTitle>🌐 Top 5 Domains</CardTitle>
              <CardDescription>Most visited websites today</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {journal.top_domains.map((domain, index) => (
                  <div key={domain.domain} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{domain.domain}</div>
                        <div className="text-sm text-muted-foreground">
                          {domain.visits} visits
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatTime(domain.time_spent_ms)}</div>
                      <div className="text-sm text-muted-foreground">time spent</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Intent Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>🎯 Time by Intent</CardTitle>
              <CardDescription>How you spent your time categorized by activity type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(journal.intent_breakdown)
                  .sort((a, b) => b[1].time_spent_ms - a[1].time_spent_ms)
                  .map(([intent, data]) => {
                    const percentage = Math.round((data.time_spent_ms / journal.active_time_ms) * 100);
                    return (
                      <div key={intent}>
                        <div className="flex justify-between mb-1">
                          <span className="font-medium capitalize">{intent}</span>
                          <span className="text-sm text-muted-foreground">
                            {formatTime(data.time_spent_ms)} ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          {/* Pattern Summary */}
          <Card>
            <CardHeader>
              <CardTitle>🔄 Pattern Summary</CardTitle>
              <CardDescription>Detected behavioral patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Frequency Patterns */}
                {journal.pattern_summary.frequency_patterns.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Frequency Patterns</h4>
                    <div className="space-y-2">
                      {journal.pattern_summary.frequency_patterns.map((pattern, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                          <div className="text-lg">🔁</div>
                          <div className="flex-1">
                            <div className="font-medium">{pattern.description}</div>
                            <div className="text-sm text-muted-foreground">
                              {pattern.occurrences}x occurrences · {Math.round(pattern.confidence * 100)}% confidence
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Temporal Patterns */}
                {journal.pattern_summary.temporal_patterns.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Temporal Patterns</h4>
                    <div className="space-y-2">
                      {journal.pattern_summary.temporal_patterns.map((pattern, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                          <div className="text-lg">⏰</div>
                          <div className="flex-1">
                            <div className="font-medium">{pattern.description}</div>
                            <div className="text-sm text-muted-foreground">
                              {pattern.type} · {Math.round(pattern.confidence * 100)}% confidence
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {journal.pattern_summary.frequency_patterns.length === 0 &&
                  journal.pattern_summary.temporal_patterns.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No patterns detected for this day
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>

          {/* Productivity Insights */}
          <Card>
            <CardHeader>
              <CardTitle>💡 Productivity Insights</CardTitle>
              <CardDescription>AI-generated insights from your activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {journal.productivity_insights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                    <div className="text-xl">✨</div>
                    <p className="flex-1">{insight}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Historical Journals */}
          {allJournals.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>📅 Historical Journals</CardTitle>
                <CardDescription>Previous journal entries</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {allJournals
                    .filter(j => j.date !== selectedDate)
                    .slice(0, 6)
                    .map(j => (
                      <button
                        key={j.id}
                        onClick={() => {
                          setSelectedDate(j.date);
                          loadJournal(j.date);
                        }}
                        className="p-4 border rounded-lg hover:bg-gray-50 text-left transition"
                      >
                        <div className="font-medium">{formatDate(j.date)}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {j.total_events} events · {formatTime(j.active_time_ms)}
                        </div>
                      </button>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

