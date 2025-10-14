'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Pattern {
  id: string;
  pattern_type: string;
  sequence: any[];
  support: number;
  confidence: number;
  first_seen: string;
  last_seen: string;
}

export default function PatternsPage() {
  const router = useRouter();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }
      setUser(user);
      fetchPatterns();
    });
  }, [router]);

  const fetchPatterns = async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) return;

      const response = await fetch('/api/patterns', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setPatterns(data.patterns);
      }
    } catch (error) {
      console.error('Error fetching patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  const minePatterns = async () => {
    setMining(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) return;

      const response = await fetch('/api/patterns/mine', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        alert(`${data.message}\n\nMined ${data.patterns_found} patterns with smart weighting!`);
        fetchPatterns();
      } else {
        alert('Error mining patterns: ' + data.error);
      }
    } catch (error) {
      console.error('Error mining patterns:', error);
      alert('Error mining patterns');
    } finally {
      setMining(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/signin');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading patterns...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              ← Dashboard
            </Button>
            <h1 className="text-2xl font-bold">Patterns</h1>
          </div>
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
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Workflow Patterns</h2>
              <p className="text-muted-foreground mt-2">
                Recurring sequences detected from your browser activity
              </p>
            </div>
            <Button onClick={minePatterns} disabled={mining}>
              {mining ? 'Mining...' : 'Mine Patterns'}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{patterns.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Frequency Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {patterns.filter(p => p.pattern_type === 'frequency').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Support</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {patterns.length > 0
                    ? Math.round(patterns.reduce((sum, p) => sum + p.support, 0) / patterns.length)
                    : 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pattern List */}
          {patterns.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">
                    No patterns detected yet. Start browsing to collect data, then click "Mine Patterns" above.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {patterns.map((pattern) => (
                <Card key={pattern.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="capitalize">{pattern.pattern_type} Pattern</CardTitle>
                        <CardDescription>
                          Detected {pattern.support} times · Confidence: {Math.round(pattern.confidence * 100)}%
                        </CardDescription>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(pattern.first_seen).toLocaleDateString()}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Sequence:</h4>
                      <div className="flex flex-wrap gap-2">
                        {pattern.sequence.map((event: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-md"
                          >
                            <span className="font-medium capitalize">{event.type}</span>
                            {idx < pattern.sequence.length - 1 && (
                              <span className="text-muted-foreground">→</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        {pattern.sequence.length} steps
                        {pattern.sequence[0]?.url && ` · ${new URL(pattern.sequence[0].url).hostname}`}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

