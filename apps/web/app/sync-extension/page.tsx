'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SyncExtensionPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [status, setStatus] = useState<string>('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    
    setUser(session.user);
    setStatus(`✅ Logged in as: ${session.user.email}`);
  }

  async function syncSession() {
    try {
      setSyncing(true);
      setStatus('⏳ Getting session...');
      
      const supabase = createBrowserClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        setStatus('❌ Not authenticated. Please refresh the page.');
        setSyncing(false);
        return;
      }
      
      setStatus(`✅ Session found for: ${session.user.email}\n⏳ Storing in extension...`);
      
      // Store directly in Chrome extension storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        try {
          await chrome.storage.local.set({ 
            session: session,
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          });
          
          setStatus(`✅ Session stored in extension!\n\n` +
                    `User: ${session.user.email}\n` +
                    `Expires: ${new Date(session.expires_at! * 1000).toLocaleString()}\n\n` +
                    `✅ Extension authenticated! Events will now upload to Supabase.`);
        } catch (chromeError) {
          console.error('[SyncExtension] Chrome storage error:', chromeError);
          setStatus(`⚠️ Could not access Chrome storage directly.\n\n` +
                    `Trying alternative method via content script...`);
          
          // Fallback: Send via postMessage to content script
          window.postMessage({
            type: 'SUPABASE_SESSION',
            session: session
          }, '*');
          
          setTimeout(() => {
            setStatus(`✅ Session sent to content script!\n\n` +
                      `User: ${session.user.email}\n\n` +
                      `Check console for: "[Content] Session received and stored"`);
          }, 500);
        }
      } else {
        // Fallback for non-extension context
        setStatus(`⚠️ Chrome extension API not available.\n\n` +
                  `Make sure you're running this in a browser with the extension installed.`);
      }
      
      setSyncing(false);
    } catch (err) {
      console.error('[SyncExtension] Error:', err);
      setStatus(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setSyncing(false);
    }
  }

  async function triggerUpload() {
    try {
      setStatus('⏳ Triggering event upload...');
      
      // Send message to background script to trigger upload
      window.postMessage({ type: 'TRIGGER_UPLOAD' }, '*');
      
      setTimeout(() => {
        setStatus('✅ Upload triggered! Check Supabase for new events in a few seconds.');
      }, 500);
    } catch (err) {
      console.error('[SyncExtension] Error:', err);
      setStatus(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="text-2xl">🔄 Sync Extension with Dashboard</CardTitle>
          <CardDescription>
            Authenticate your browser extension to enable event uploads to Supabase
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium">
                ✅ Logged in as: {user.email}
              </p>
            </div>
          )}

          {status && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <pre className="text-sm text-blue-900 whitespace-pre-wrap font-mono">
                {status}
              </pre>
            </div>
          )}

          <div className="space-y-2">
            <Button 
              onClick={syncSession} 
              disabled={syncing || !user}
              className="w-full"
              size="lg"
            >
              {syncing ? '🔄 Syncing...' : '🔄 Sync Session to Extension'}
            </Button>

            <Button 
              onClick={triggerUpload}
              variant="outline"
              className="w-full"
              size="lg"
            >
              📤 Trigger Manual Upload
            </Button>

            <Button 
              onClick={() => router.push('/dashboard')}
              variant="outline"
              className="w-full"
            >
              ← Back to Dashboard
            </Button>
          </div>

          <div className="border-t pt-4 mt-4">
            <h3 className="font-semibold mb-2">📋 Instructions:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Click <strong>"Sync Session to Extension"</strong> to authenticate</li>
              <li>Check console for: <code className="bg-gray-100 px-2 py-1 rounded">[Content] Session received and stored</code></li>
              <li>Click around the page to capture events</li>
              <li>Click <strong>"Trigger Manual Upload"</strong> to force upload</li>
              <li>Check Supabase: <code className="bg-gray-100 px-2 py-1 rounded">SELECT COUNT(*) FROM events</code></li>
            </ol>
          </div>

          <div className="border-t pt-4 mt-4">
            <h3 className="font-semibold mb-2">🔍 Debugging:</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <p><strong>Check IndexedDB:</strong> DevTools → Application → IndexedDB → observe-create-db → events</p>
              <p><strong>Check Console:</strong> Look for <code className="bg-gray-100 px-2 py-1 rounded">[Background]</code> and <code className="bg-gray-100 px-2 py-1 rounded">[Content]</code> logs</p>
              <p><strong>Extension Icon:</strong> Click extension icon to see connection status</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

