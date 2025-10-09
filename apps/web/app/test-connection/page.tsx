'use client';

import { useState } from 'react';

export default function TestConnectionPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ status: 'error', message: String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Supabase Connection Test</h1>
      <p>Test your Supabase configuration</p>
      
      <button
        onClick={testConnection}
        disabled={loading}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginTop: '1rem',
        }}
      >
        {loading ? 'Testing...' : 'Test Connection'}
      </button>

      {result && (
        <div
          style={{
            marginTop: '2rem',
            padding: '1rem',
            background: result.status === 'ok' ? '#d4edda' : '#f8d7da',
            border: `1px solid ${result.status === 'ok' ? '#c3e6cb' : '#f5c6cb'}`,
            borderRadius: '4px',
          }}
        >
          <h2>Result:</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}

