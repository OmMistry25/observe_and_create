'use client';

import { useState } from 'react';

export default function TestRLSPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testRLS = async () => {
    console.log('Testing RLS...');
    setLoading(true);
    try {
      console.log('Fetching /api/test-rls');
      const response = await fetch('/api/test-rls');
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      setResult(data);
    } catch (error) {
      console.error('Error testing RLS:', error);
      setResult({ status: 'error', message: String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: '800px' }}>
      <h1>RLS Policy Test</h1>
      <p>Test Row Level Security policies to ensure data isolation</p>
      
      <button
        onClick={testRLS}
        disabled={loading}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginTop: '1rem',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        {loading ? 'Testing...' : 'Test RLS Policies'}
      </button>

      {result && (
        <div
          style={{
            marginTop: '2rem',
            padding: '1rem',
            background: result.status === 'authenticated' ? '#d4edda' : 
                       result.status === 'unauthenticated' ? '#fff3cd' : '#f8d7da',
            border: `1px solid ${
              result.status === 'authenticated' ? '#c3e6cb' : 
              result.status === 'unauthenticated' ? '#ffeeba' : '#f5c6cb'
            }`,
            borderRadius: '4px',
          }}
        >
          <h2>Result:</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(result, null, 2)}
          </pre>

          {result.status === 'unauthenticated' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#e7f3ff', borderRadius: '4px' }}>
              <strong>Note:</strong> You&apos;re not authenticated. RLS is working correctly by blocking access.
              In a real app, you&apos;d need to sign in first.
            </div>
          )}

          {result.status === 'authenticated' && (
            <div style={{ marginTop: '1rem' }}>
              <h3>RLS Status:</h3>
              <ul>
                {result.tests?.profiles && (
                  <li>
                    <strong>Profiles:</strong> {result.tests.profiles.success ? '✅' : '❌'} 
                    {' '}Found {result.tests.profiles.count} records (should be 0 or 1)
                  </li>
                )}
                {result.tests?.events && (
                  <li>
                    <strong>Events:</strong> {result.tests.events.success ? '✅' : '❌'} 
                    {' '}Found {result.tests.events.count} records (should only be yours)
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

