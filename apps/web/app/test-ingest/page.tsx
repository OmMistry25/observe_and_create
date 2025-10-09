'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createBrowserClient } from '@/lib/supabase-client';

export default function TestIngestPage() {
  const router = useRouter();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const validPayload = {
    events: [
      {
        device_id: 'test-device-123',
        ts: new Date().toISOString(),
        type: 'click',
        url: 'https://example.com/page',
        title: 'Test Page',
        dom_path: 'body > div > button',
        text: 'Click me',
        meta: { elementType: 'button', elementId: 'test-btn' },
        dwell_ms: 1500,
        context_events: [],
      },
      {
        device_id: 'test-device-123',
        ts: new Date().toISOString(),
        type: 'search',
        url: 'https://example.com/search?q=test',
        title: 'Search Results',
        text: 'test',
        meta: { query: 'test' },
      },
    ],
  };

  const invalidPayload = {
    events: [
      {
        // Missing required fields
        type: 'invalid-type',
        url: 'not-a-url',
      },
    ],
  };

  const testIngest = async (payload: any, testName: string) => {
    setLoading(true);
    setResult(null);

    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setResult({
          testName,
          error: 'Not authenticated',
          status: 'error',
        });
        return;
      }

      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      setResult({
        testName,
        status: response.status,
        statusText: response.statusText,
        data,
      });
    } catch (error: any) {
      setResult({
        testName,
        error: error.message,
        status: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <Card>
          <CardHeader>
            <CardTitle>Test Ingest API (T05)</CardTitle>
            <CardDescription>
              Test the POST /api/ingest endpoint with valid and invalid payloads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!user && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ You need to be signed in to test the API.{' '}
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

            <div className="flex gap-2">
              <Button
                onClick={() => testIngest(validPayload, 'Valid Payload')}
                disabled={loading}
              >
                Test Valid Payload
              </Button>
              <Button
                onClick={() => testIngest(invalidPayload, 'Invalid Payload')}
                variant="destructive"
                disabled={loading}
              >
                Test Invalid Payload
              </Button>
            </div>

            {loading && (
              <div className="text-sm text-muted-foreground">
                Sending request...
              </div>
            )}

            {result && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Result: {result.testName}</h3>
                <div className="bg-gray-100 p-4 rounded-md">
                  <pre className="text-sm overflow-auto">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>

                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Expected Results:</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>✅ Valid Payload: Status 200, success: true, inserted: 2</li>
                    <li>✅ Invalid Payload: Status 400, validation errors listed</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="mt-8 pt-8 border-t">
              <h3 className="text-lg font-semibold mb-2">Valid Payload Example:</h3>
              <div className="bg-gray-100 p-4 rounded-md">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(validPayload, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

