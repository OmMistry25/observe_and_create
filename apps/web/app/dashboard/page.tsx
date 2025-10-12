'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TimelineChart } from '@/components/TimelineChart';
import AutomationSuggestions from '@/components/AutomationSuggestions';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<any>(null);
  
  // Filters
  const [filters, setFilters] = useState({
    domain: '',
    type: '',
    intent: '',
  });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      setUser(user);
      
      // Check if user has given consent
      const { data: profile } = await supabase
        .from('profiles')
        .select('consent_data, consent_given_at')
        .eq('id', user.id)
        .single();

      if (!profile?.consent_data || !profile?.consent_given_at) {
        router.push('/onboarding');
        return;
      }
      
      // Share session with extension
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Send session to extension via postMessage
        window.postMessage({
          type: 'SUPABASE_SESSION',
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: session.user
          }
        }, '*');
      }
    });
  }, []);

  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user, currentPage, filters]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      // Build query params
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });

      if (filters.domain) params.append('domain', filters.domain);
      if (filters.type) params.append('type', filters.type);
      if (filters.intent) params.append('intent', filters.intent);

      const response = await fetch(`/api/events?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/signin');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const applyFilters = () => {
    setCurrentPage(1);
    fetchEvents();
  };

  const clearFilters = () => {
    setFilters({ domain: '', type: '', intent: '' });
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Observe & Create</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button onClick={handleSignOut} variant="outline" size="sm">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
              <p className="text-muted-foreground mt-2">
                Your browser activity intelligence and insights
              </p>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => router.push('/patterns')}>
                Patterns
              </Button>
              <Button variant="outline" onClick={() => router.push('/settings')}>
                Settings
              </Button>
              <Button variant="outline" onClick={() => router.push('/test-ingest')}>
                Test Ingest
              </Button>
            </div>
          </div>

          {/* Timeline Chart */}
          <TimelineChart hours={24} />

          {/* T19: Automation Suggestions - Only shows when enough data is collected */}
          <AutomationSuggestions />

          <div className="pt-4">
            <h3 className="text-2xl font-bold tracking-tight">Activity Feed</h3>
            <p className="text-muted-foreground mt-1">
              Recent browser events captured from your activity
            </p>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Filter events by domain, type, or intent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Domain</label>
                  <Input
                    placeholder="e.g., example.com"
                    value={filters.domain}
                    onChange={(e) => setFilters({ ...filters, domain: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Type</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  >
                    <option value="">All Types</option>
                    <option value="click">Click</option>
                    <option value="search">Search</option>
                    <option value="form">Form</option>
                    <option value="nav">Navigation</option>
                    <option value="focus">Focus</option>
                    <option value="blur">Blur</option>
                    <option value="idle">Idle</option>
                    <option value="error">Error</option>
                    <option value="friction">Friction</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Intent</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={filters.intent}
                    onChange={(e) => setFilters({ ...filters, intent: e.target.value })}
                  >
                    <option value="">All Intents</option>
                    <option value="research">Research</option>
                    <option value="transaction">Transaction</option>
                    <option value="comparison">Comparison</option>
                    <option value="creation">Creation</option>
                    <option value="communication">Communication</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={applyFilters} size="sm">
                  Apply Filters
                </Button>
                <Button onClick={clearFilters} variant="outline" size="sm">
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Events Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
              <CardDescription>
                {pagination && `Showing ${events.length} of ${pagination.total} events`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading events...
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No events found.</p>
                  <p className="text-sm mt-2">
                    Go to{' '}
                    <a href="/test-ingest" className="text-blue-600 underline">
                      /test-ingest
                    </a>{' '}
                    to add some test events.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((event: any) => (
                    <div
                      key={event.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {event.type}
                            </span>
                            {event.interaction_quality?.inferred_intent && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                {event.interaction_quality.inferred_intent}
                              </span>
                            )}
                            {event.interaction_quality?.friction_score > 0.5 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                High Friction
                              </span>
                            )}
                          </div>
                          <div className="font-medium">
                            {event.title || extractDomain(event.url)}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {extractDomain(event.url)}
                          </div>
                          {event.text && (
                            <div className="text-sm text-gray-500 mt-1 truncate">
                              {event.text}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-sm text-gray-500 ml-4">
                          <div>{formatDate(event.ts)}</div>
                          {event.dwell_ms && (
                            <div className="text-xs mt-1">
                              {(event.dwell_ms / 1000).toFixed(1)}s dwell
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex justify-between items-center mt-6 pt-6 border-t">
                  <div className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={!pagination.hasPreviousPage}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={!pagination.hasNextPage}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
