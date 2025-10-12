'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Automation {
  id: string;
  name: string;
  description: string;
  status: string;
  trigger: any;
  actions: any[];
  scope: any;
  health: any;
  created_at: string;
  updated_at: string;
  created_from_pattern: string | null;
}

export default function AutomationsPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    fetchAutomations();
  }, []);

  async function checkAuth() {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth');
    }
  }

  async function fetchAutomations() {
    try {
      setLoading(true);
      setError(null);

      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/automations', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setAutomations(data.automations || []);
      } else {
        setError(data.error || 'Failed to fetch automations');
      }
    } catch (err) {
      console.error('Error fetching automations:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase
        .from('automations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        alert(`Error: ${error.message}`);
        return;
      }

      // Refresh list
      fetchAutomations();
    } catch (err) {
      console.error('Error updating status:', err);
      alert(`Failed to update status`);
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'needs_repair':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Automations</h1>
              <p className="text-gray-600 mt-2">
                Manage your approved workflow automations
              </p>
            </div>
            <Button onClick={() => router.push('/dashboard')}>
              ← Back to Dashboard
            </Button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading automations...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-600">Error: {error}</p>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && !error && automations.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-gray-600 text-lg mb-4">No automations yet</p>
              <p className="text-gray-500 mb-6">
                Approve suggestions from the dashboard to create your first automation!
              </p>
              <Button onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Automations List */}
        {!loading && !error && automations.length > 0 && (
          <div className="space-y-4">
            {automations.map((automation) => (
              <Card key={automation.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{automation.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {automation.description}
                      </CardDescription>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                        automation.status
                      )}`}
                    >
                      {automation.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-gray-600">Trigger:</span>
                      <span className="ml-2 font-medium capitalize">
                        {automation.trigger?.kind || 'manual'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Actions:</span>
                      <span className="ml-2 font-medium">{automation.actions?.length || 0} steps</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Domains:</span>
                      <span className="ml-2 font-medium">
                        {automation.scope?.domains?.join(', ') || 'All'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Created:</span>
                      <span className="ml-2 font-medium">
                        {new Date(automation.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions Preview */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Workflow Steps:</h4>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                      {automation.actions?.slice(0, 5).map((action: any, idx: number) => (
                        <li key={idx}>
                          <span className="capitalize">{action.kind}</span>
                          {action.spec?.text && (
                            <span className="text-gray-500 ml-1">
                              &quot;{action.spec.text.substring(0, 40)}...&quot;
                            </span>
                          )}
                        </li>
                      ))}
                      {automation.actions?.length > 5 && (
                        <li className="text-gray-400">
                          ...and {automation.actions.length - 5} more steps
                        </li>
                      )}
                    </ol>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 pt-4 border-t">
                    {automation.status === 'approved' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(automation.id, 'active')}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Activate
                      </Button>
                    )}
                    {automation.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(automation.id, 'paused')}
                      >
                        Pause
                      </Button>
                    )}
                    {automation.status === 'paused' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(automation.id, 'active')}
                      >
                        Resume
                      </Button>
                    )}
                    <Button size="sm" variant="outline">
                      View Details
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

