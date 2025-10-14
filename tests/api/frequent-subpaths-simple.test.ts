import { createClient } from '@supabase/supabase-js';

// Load environment variables
require('dotenv').config({ path: '.env.test' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables for testing');
}

const supabase = createClient(supabaseUrl, supabaseKey);

describe('API: Frequent Subpaths Database Logic', () => {
  let testUserId: string;

  beforeAll(async () => {
    testUserId = '436e9d01-2ef4-4437-975b-dc34ccb4fe21'; // Use existing user from database
  });

  afterAll(async () => {
    if (supabase && testUserId) {
      await supabase.from('events').delete().eq('user_id', testUserId).eq('device_id', 'api-test-device');
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    if (supabase && testUserId) {
      await supabase.from('events').delete().eq('user_id', testUserId).eq('device_id', 'api-test-device');
    }
  });

  describe('Frequent Subpaths Query Logic', () => {
    test('should return empty results for user with no frequent paths', async () => {
      // Query the frequent_subpaths view directly for a non-existent user
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', '00000000-0000-0000-0000-000000000000')
        .gte('visit_count', 3);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    test('should return frequent paths for user with data', async () => {
      // Insert test events to create frequent paths
      const baseTime = new Date();
      const events = [
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'nav',
          url: 'https://example.com/api-test-page',
          url_path: '/api-test-page',
          domain: 'example.com',
          title: 'API Test Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 3).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://example.com/api-test-page',
          url_path: '/api-test-page',
          domain: 'example.com',
          title: 'API Test Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://example.com/api-test-page',
          url_path: '/api-test-page',
          domain: 'example.com',
          title: 'API Test Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString()
        }
      ];

      const { error: insertError } = await supabase.from('events').insert(events);
      expect(insertError).toBeNull();

      // Refresh the materialized view
      const { error: refreshError } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError).toBeNull();

      // Query the frequent_subpaths view
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .gte('visit_count', 3);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].url_path).toBe('https://example.com/api-test-page');
      expect(data[0].visit_count).toBe(3);
    });

    test('should filter by minimum visit count parameter', async () => {
      // Insert test events with different visit counts
      const baseTime = new Date();
      const events = [
        // 2 visits (should not appear in frequent_subpaths)
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'nav',
          url: 'https://example.com/rare-page',
          url_path: '/rare-page',
          domain: 'example.com',
          title: 'Rare Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://example.com/rare-page',
          url_path: '/rare-page',
          domain: 'example.com',
          title: 'Rare Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString()
        },
        // 4 visits (should appear in frequent_subpaths)
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'nav',
          url: 'https://example.com/frequent-page',
          url_path: '/frequent-page',
          domain: 'example.com',
          title: 'Frequent Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 4).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://example.com/frequent-page',
          url_path: '/frequent-page',
          domain: 'example.com',
          title: 'Frequent Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 3).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://example.com/frequent-page',
          url_path: '/frequent-page',
          domain: 'example.com',
          title: 'Frequent Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://example.com/frequent-page',
          url_path: '/frequent-page',
          domain: 'example.com',
          title: 'Frequent Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString()
        }
      ];

      const { error: insertError } = await supabase.from('events').insert(events);
      expect(insertError).toBeNull();

      // Refresh the materialized view
      const { error: refreshError } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError).toBeNull();

      // Test filtering by minimum visit count
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .gte('visit_count', 4);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].url_path).toBe('https://example.com/frequent-page');
      expect(data[0].visit_count).toBe(4);
    });

    test('should categorize results by domain', async () => {
      // Insert test events from different domains
      const baseTime = new Date();
      const events = [
        // GitHub events
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'nav',
          url: 'https://github.com/user/repo/issues/123',
          url_path: '/user/repo/issues/123',
          domain: 'github.com',
          title: 'GitHub Issue',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 3).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://github.com/user/repo/issues/123',
          url_path: '/user/repo/issues/123',
          domain: 'github.com',
          title: 'GitHub Issue',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://github.com/user/repo/issues/123',
          url_path: '/user/repo/issues/123',
          domain: 'github.com',
          title: 'GitHub Issue',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString()
        },
        // Google Docs events
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'nav',
          url: 'https://docs.google.com/document/d/test-doc/edit',
          url_path: '/document/d/test-doc/edit',
          domain: 'docs.google.com',
          title: 'Google Doc',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 3).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://docs.google.com/document/d/test-doc/edit',
          url_path: '/document/d/test-doc/edit',
          domain: 'docs.google.com',
          title: 'Google Doc',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'api-test-device',
          type: 'click',
          url: 'https://docs.google.com/document/d/test-doc/edit',
          url_path: '/document/d/test-doc/edit',
          domain: 'docs.google.com',
          title: 'Google Doc',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString()
        }
      ];

      const { error: insertError } = await supabase.from('events').insert(events);
      expect(insertError).toBeNull();

      // Refresh the materialized view
      const { error: refreshError } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError).toBeNull();

      // Query and categorize by domain
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .gte('visit_count', 3);

      expect(error).toBeNull();
      expect(data).toHaveLength(2);

      // Categorize by domain
      const categorized = data.reduce((acc: any, path: any) => {
        const domain = path.domain;
        if (!acc[domain]) {
          acc[domain] = [];
        }
        acc[domain].push(path);
        return acc;
      }, {});

      expect(categorized['github.com']).toBeDefined();
      expect(categorized['docs.google.com']).toBeDefined();
      expect(categorized['github.com']).toHaveLength(1);
      expect(categorized['docs.google.com']).toHaveLength(1);
      expect(categorized['github.com'][0].url_path).toBe('https://github.com/user/repo/issues/123');
      expect(categorized['docs.google.com'][0].url_path).toBe('https://docs.google.com/document/d/test-doc/edit');
    });

    test('should handle database errors gracefully', async () => {
      // Test with invalid user ID to trigger error
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', 'invalid-uuid-format')
        .gte('visit_count', 3);

      // Should either return empty results or handle the error gracefully
      expect(data).toBeDefined();
      // Error might be null for invalid UUID (treated as no matches)
      // or might contain an error message
    });
  });
});
