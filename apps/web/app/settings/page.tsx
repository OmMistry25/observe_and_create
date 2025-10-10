'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { createBrowserClient } from '@/lib/supabase-client';
import { requireAuth } from '@/lib/auth';

interface ConsentData {
  domains: string[];
  categories: {
    clicks: boolean;
    searches: boolean;
    forms: boolean;
    navigation: boolean;
    dwell: boolean;
  };
  privacy: {
    dataRetention: number;
    allowAnalytics: boolean;
    allowSharing: boolean;
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [consent, setConsent] = useState<ConsentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConsent();
  }, []);

  const loadConsent = async () => {
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('consent_data')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error loading consent:', error);
        return;
      }

      if (profile?.consent_data) {
        setConsent(profile.consent_data);
      } else {
        // Default consent if none exists
        setConsent({
          domains: [],
          categories: {
            clicks: true,
            searches: true,
            forms: true,
            navigation: true,
            dwell: true,
          },
          privacy: {
            dataRetention: 30,
            allowAnalytics: true,
            allowSharing: false,
          },
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryChange = (category: keyof ConsentData['categories']) => {
    if (!consent) return;
    
    setConsent(prev => ({
      ...prev!,
      categories: {
        ...prev!.categories,
        [category]: !prev!.categories[category],
      },
    }));
  };

  const handlePrivacyChange = (field: keyof ConsentData['privacy'], value: any) => {
    if (!consent) return;
    
    setConsent(prev => ({
      ...prev!,
      privacy: {
        ...prev!.privacy,
        [field]: value,
      },
    }));
  };

  const handleSaveSettings = async () => {
    if (!consent) return;
    
    setIsSaving(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          consent_data: consent,
          consent_given_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving settings:', error);
        return;
      }

      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteData = async () => {
    if (!confirm('Are you sure you want to delete all your data? This cannot be undone.')) {
      return;
    }

    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      // Delete all user data
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting data:', error);
        return;
      }

      alert('All data deleted successfully!');
      router.push('/dashboard');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!consent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No consent data found. Please complete onboarding first.</p>
          <Button onClick={() => router.push('/onboarding')} className="mt-4">
            Go to Onboarding
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Privacy Settings</h1>
          <p className="text-gray-600 mt-2">Manage your data collection and privacy preferences</p>
        </div>

        <div className="grid gap-6">
          {/* Data Collection Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Data Collection</CardTitle>
              <CardDescription>
                Choose what types of activity you want to track
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="clicks"
                  checked={consent.categories.clicks}
                  onCheckedChange={() => handleCategoryChange('clicks')}
                />
                <div className="flex-1">
                  <label htmlFor="clicks" className="font-medium">Click Tracking</label>
                  <p className="text-sm text-gray-600">Track where you click on pages</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="searches"
                  checked={consent.categories.searches}
                  onCheckedChange={() => handleCategoryChange('searches')}
                />
                <div className="flex-1">
                  <label htmlFor="searches" className="font-medium">Search Queries</label>
                  <p className="text-sm text-gray-600">Capture search terms from URLs</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="forms"
                  checked={consent.categories.forms}
                  onCheckedChange={() => handleCategoryChange('forms')}
                />
                <div className="flex-1">
                  <label htmlFor="forms" className="font-medium">Form Interactions</label>
                  <p className="text-sm text-gray-600">Track form submissions and fields</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="navigation"
                  checked={consent.categories.navigation}
                  onCheckedChange={() => handleCategoryChange('navigation')}
                />
                <div className="flex-1">
                  <label htmlFor="navigation" className="font-medium">Page Navigation</label>
                  <p className="text-sm text-gray-600">Track page visits and URL changes</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="dwell"
                  checked={consent.categories.dwell}
                  onCheckedChange={() => handleCategoryChange('dwell')}
                />
                <div className="flex-1">
                  <label htmlFor="dwell" className="font-medium">Dwell Time</label>
                  <p className="text-sm text-gray-600">Measure time spent on each page</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Privacy Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Privacy & Data</CardTitle>
              <CardDescription>
                Configure how your data is stored and used
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="font-medium">Data Retention Period</label>
                <select
                  value={consent.privacy.dataRetention}
                  onChange={(e) => handlePrivacyChange('dataRetention', parseInt(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
                <p className="text-sm text-gray-600 mt-1">
                  How long to keep your activity data
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="analytics"
                  checked={consent.privacy.allowAnalytics}
                  onCheckedChange={(checked) => handlePrivacyChange('allowAnalytics', checked)}
                />
                <div className="flex-1">
                  <label htmlFor="analytics" className="font-medium">Allow Analytics</label>
                  <p className="text-sm text-gray-600">Help improve the product with anonymous usage data</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="sharing"
                  checked={consent.privacy.allowSharing}
                  onCheckedChange={(checked) => handlePrivacyChange('allowSharing', checked)}
                />
                <div className="flex-1">
                  <label htmlFor="sharing" className="font-medium">Allow Data Sharing</label>
                  <p className="text-sm text-gray-600">Share anonymized patterns for research (optional)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>
                Manage your data and account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-4">
                <Button 
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => router.push('/dashboard')}
                >
                  Back to Dashboard
                </Button>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-red-600 mb-2">Danger Zone</h3>
                <Button 
                  variant="destructive"
                  onClick={handleDeleteData}
                >
                  Delete All Data
                </Button>
                <p className="text-sm text-gray-600 mt-1">
                  This will permanently delete all your activity data
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
