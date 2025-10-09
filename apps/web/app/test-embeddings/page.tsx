'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createBrowserClient } from '@/lib/supabase-client';

export default function TestEmbeddingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('example page');
  const [searchResults, setSearchResults] = useState<any>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setSearchResults(null);

    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setSearchResults({ error: 'Not authenticated' });
        return;
      }

      const response = await fetch(
        `/api/embeddings/search?q=${encodeURIComponent(searchQuery)}&k=5`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();
      setSearchResults(data);
    } catch (error: any) {
      setSearchResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <Card>
          <CardHeader>
            <CardTitle>Test Embeddings & Semantic Search (T06)</CardTitle>
            <CardDescription>
              Search for similar events using semantic similarity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!user && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ You need to be signed in to test embeddings.{' '}
                  <Button
                    variant="link"
                    className="p-0 h-auto text-yellow-800 underline"
                    onClick={() => router.push('/auth/signin')}
                  >
                    Sign in here
                  </Button>
                </p>
              </div>
            )}

            {user && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                <p className="text-sm text-green-800">
                  ✅ Signed in as: {user.email}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Search Query</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter search text (e.g., 'example page')"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={loading || !user}>
                  {loading ? 'Searching...' : 'Search'}
                </Button>
              </div>
            </div>

            {searchResults && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Results</h3>
                <div className="bg-gray-100 p-4 rounded-md">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(searchResults, null, 2)}
                  </pre>
                </div>

                {searchResults.results && searchResults.results.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="font-semibold">Similar Events:</h4>
                    {searchResults.results.map((result: any, index: number) => (
                      <div
                        key={result.id}
                        className="border rounded p-3 bg-white"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{result.title || result.url}</div>
                            <div className="text-sm text-gray-600">{result.type}</div>
                            {result.text && (
                              <div className="text-sm text-gray-500 mt-1">
                                {result.text}
                              </div>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-green-600">
                            {(result.similarity * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 pt-8 border-t">
              <h3 className="text-lg font-semibold mb-2">Instructions:</h3>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>First, go to <a href="/test-ingest" className="text-blue-600 underline">/test-ingest</a> and insert some test events</li>
                <li>Wait a few seconds for embeddings to be generated</li>
                <li>Come back here and search for similar events</li>
                <li>The search will find events with similar semantic meaning</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

