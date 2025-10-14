'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function TestExtensionPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    // Listen for events from the extension
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'EXTENSION_EVENT') {
        setEvents(prev => [event.data.event, ...prev.slice(0, 9)]); // Keep last 10 events
      }
    };

    window.addEventListener('message', handleMessage);
    setIsListening(true);

    return () => {
      window.removeEventListener('message', handleMessage);
      setIsListening(false);
    };
  }, []);

  const clearEvents = () => {
    setEvents([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Extension Test Page</h1>
          <p className="text-gray-600 mt-2">
            This page helps test the browser extension&apos;s event capture functionality
          </p>
        </div>

        <div className="grid gap-6">
          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>How to Test</CardTitle>
              <CardDescription>
                Follow these steps to test the extension
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">1. Load the Extension</h3>
                <p className="text-sm text-blue-800">
                  Make sure the extension is loaded in Chrome and enabled
                </p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2">2. Interact with This Page</h3>
                <p className="text-sm text-green-800">
                  Click buttons, fill forms, and navigate to trigger events
                </p>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-900 mb-2">3. Check the Console</h3>
                <p className="text-sm text-yellow-800">
                  Open DevTools (F12) and look for [Content] and [Background] messages
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Test Elements */}
          <Card>
            <CardHeader>
              <CardTitle>Test Elements</CardTitle>
              <CardDescription>
                Click these elements to test event capture
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <Button id="test-button-1" className="bg-blue-600 hover:bg-blue-700">
                  Test Button 1
                </Button>
                <Button id="test-button-2" variant="outline">
                  Test Button 2
                </Button>
                <Button id="test-button-3" variant="destructive">
                  Test Button 3
                </Button>
              </div>

              <div className="space-y-2">
                <label htmlFor="test-input" className="block text-sm font-medium">
                  Test Input Field
                </label>
                <Input 
                  id="test-input" 
                  placeholder="Type something here..."
                  className="max-w-md"
                />
              </div>

              <form id="test-form" className="space-y-4 max-w-md">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-1">
                    Name
                  </label>
                  <Input id="name" name="name" placeholder="Your name" required />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1">
                    Email
                  </label>
                  <Input id="email" name="email" type="email" placeholder="your@email.com" required />
                </div>
                <Button type="submit" className="w-full">
                  Submit Form
                </Button>
              </form>

              <div className="space-y-2">
                <label htmlFor="test-textarea" className="block text-sm font-medium">
                  Test Textarea
                </label>
                <textarea 
                  id="test-textarea"
                  className="w-full max-w-md p-2 border rounded-md"
                  rows={3}
                  placeholder="Type a longer message here..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Event Display */}
          <Card>
            <CardHeader>
              <CardTitle>Captured Events</CardTitle>
              <CardDescription>
                {isListening ? 'Listening for events...' : 'Not listening'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-600">
                  Events will appear here when captured by the extension
                </p>
                <Button variant="outline" size="sm" onClick={clearEvents}>
                  Clear Events
                </Button>
              </div>

              {events.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No events captured yet.</p>
                  <p className="text-sm mt-2">
                    Try clicking the buttons above or filling out the form.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((event, index) => (
                    <div key={index} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm">
                          {event.type?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <pre className="text-xs text-gray-700 overflow-x-auto">
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Debug Info */}
          <Card>
            <CardHeader>
              <CardTitle>Debug Information</CardTitle>
              <CardDescription>
                Technical details for debugging
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-100 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Console Messages to Look For:</h3>
                <ul className="text-sm space-y-1">
                  <li>• <code>[Content] Script loaded on: [current URL]</code></li>
                  <li>• <code>[Content] Extension status: enabled</code></li>
                  <li>• <code>[Content] Event captured: ...</code></li>
                  <li>• <code>[Background] Event captured: ...</code></li>
                  <li>• <code>[Background] Queued event, queue size: X</code></li>
                  <li>• <code>[Background] Uploaded X events successfully</code></li>
                </ul>
              </div>

              <div className="bg-gray-100 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Current Page Info:</h3>
                <ul className="text-sm space-y-1">
                  <li>• URL: <code>[current URL]</code></li>
                  <li>• Title: <code>[page title]</code></li>
                  <li>• User Agent: <code>[browser info]</code></li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
