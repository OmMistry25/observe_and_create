'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { createBrowserClient } from '@/lib/supabase-client';

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
    dataRetention: number; // days
    allowAnalytics: boolean;
    allowSharing: boolean;
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [consent, setConsent] = useState<ConsentData>({
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
  const [isLoading, setIsLoading] = useState(false);

  const handleCategoryChange = (category: keyof ConsentData['categories']) => {
    setConsent(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [category]: !prev.categories[category],
      },
    }));
  };

  const handlePrivacyChange = (field: keyof ConsentData['privacy'], value: any) => {
    setConsent(prev => ({
      ...prev,
      privacy: {
        ...prev.privacy,
        [field]: value,
      },
    }));
  };

  const handleSaveConsent = async () => {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      // Save consent to user profile
      const { error } = await supabase
        .from('profiles')
        .update({
          consent_data: consent,
          consent_given_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving consent:', error);
        return;
      }

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Welcome to Observe & Create</CardTitle>
        <CardDescription>
          Let&apos;s set up your privacy preferences and data collection settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">What we collect</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Your browsing activity (clicks, searches, page visits)</li>
            <li>• Time spent on websites (dwell time)</li>
            <li>• Form interactions and navigation patterns</li>
            <li>• All data is processed locally and encrypted</li>
          </ul>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-900 mb-2">Your privacy is protected</h3>
          <ul className="text-sm text-green-800 space-y-1">
            <li>• Data never leaves your device without permission</li>
            <li>• You control what gets collected and shared</li>
            <li>• You can pause or delete data anytime</li>
            <li>• No tracking across websites or third parties</li>
          </ul>
        </div>

        <Button 
          onClick={() => setStep(2)} 
          className="w-full"
          size="lg"
        >
          Continue to Settings
        </Button>
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Data Collection Settings</CardTitle>
        <CardDescription>
          Choose what types of activity you want to track
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
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
        </div>

        <div className="flex space-x-3">
          <Button 
            variant="outline" 
            onClick={() => setStep(1)}
            className="flex-1"
          >
            Back
          </Button>
          <Button 
            onClick={() => setStep(3)}
            className="flex-1"
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Privacy & Data Settings</CardTitle>
        <CardDescription>
          Configure how your data is stored and used
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
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
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg">
          <h3 className="font-semibold text-yellow-900 mb-2">Important</h3>
          <p className="text-sm text-yellow-800">
            You can change these settings anytime in your dashboard. 
            Your data is encrypted and stored securely.
          </p>
        </div>

        <div className="flex space-x-3">
          <Button 
            variant="outline" 
            onClick={() => setStep(2)}
            className="flex-1"
          >
            Back
          </Button>
          <Button 
            onClick={handleSaveConsent}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? 'Saving...' : 'Complete Setup'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
}
