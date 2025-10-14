import { createClient } from '@supabase/supabase-js';

describe('Database: Frequent Subpaths View', () => {
  let supabase: any;
  let testUserId: string;

  beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables for testing');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    testUserId = '436e9d01-2ef4-4437-975b-dc34ccb4fe21'; // Use existing user from database
  });

  afterAll(async () => {
    if (supabase && testUserId) {
      await supabase.from('events').delete().eq('user_id', testUserId);
    }
  });

  describe('frequent_subpaths materialized view', () => {
    test('should populate view with frequently visited paths', async () => {
      // Insert events for the same path (3+ times to trigger frequent_subpaths)
      const baseTime = new Date();
      const events = [
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'nav',
          url: 'https://example.com/important-doc',
          url_path: '/important-doc',
          domain: 'example.com',
          title: 'Important Document',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString() // 2 hours ago
        },
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'click',
          url: 'https://example.com/important-doc',
          url_path: '/important-doc',
          domain: 'example.com',
          title: 'Important Document',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString() // 1 hour ago
        },
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'click',
          url: 'https://example.com/important-doc',
          url_path: '/important-doc',
          domain: 'example.com',
          title: 'Important Document',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 30).toISOString() // 30 minutes ago
        },
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'nav',
          url: 'https://example.com/important-doc',
          url_path: '/important-doc',
          domain: 'example.com',
          title: 'Important Document',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 10).toISOString() // 10 minutes ago
        }
      ];

      const { error: insertError } = await supabase.from('events').insert(events);
      expect(insertError).toBeNull();

      // Refresh the materialized view
      const { error: refreshError } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError).toBeNull();

      // Query the view
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_path', 'https://example.com/important-doc');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      
      const frequentPath = data[0];
      expect(frequentPath.user_id).toBe(testUserId);
      expect(frequentPath.url_path).toBe('https://example.com/important-doc');
      expect(frequentPath.visit_count).toBe(4);
      expect(frequentPath.days_visited).toBe(1); // All visits on same day
      expect(frequentPath.time_span_hours).toBeGreaterThan(0);
    });

    test('should not include paths with less than 3 visits', async () => {
      // Insert events for a path with only 2 visits
      const baseTime = new Date();
      const events = [
        {
          user_id: testUserId,
          type: 'nav',
          url: 'https://example.com/rare-page',
          url_path: '/rare-page',
          domain: 'example.com',
          title: 'Rare Page',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60).toISOString()
        },
        {
          user_id: testUserId,
          type: 'click',
          url: 'https://example.com/rare-page',
          url_path: '/rare-page',
          domain: 'example.com',
          title: 'Rare Page',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 30).toISOString()
        }
      ];

      await supabase.from('events').insert(events);

      // Refresh the materialized view
      await supabase.rpc('refresh_frequent_subpaths');

      // Query the view
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_path', 'https://example.com/rare-page');

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // Should not appear in frequent_subpaths
    });

    test('should calculate time span correctly', async () => {
      // Insert events spanning multiple days
      const baseTime = new Date();
      const events = [
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'nav',
          url: 'https://example.com/multi-day-page',
          url_path: '/multi-day-page',
          domain: 'example.com',
          title: 'Multi Day Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString() // 2 days ago
        },
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'click',
          url: 'https://example.com/multi-day-page',
          url_path: '/multi-day-page',
          domain: 'example.com',
          title: 'Multi Day Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 24).toISOString() // 1 day ago
        },
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'click',
          url: 'https://example.com/multi-day-page',
          url_path: '/multi-day-page',
          domain: 'example.com',
          title: 'Multi Day Page',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60).toISOString() // 1 hour ago
        }
      ];

      const { error: insertError2 } = await supabase.from('events').insert(events);
      expect(insertError2).toBeNull();

      // Refresh the materialized view
      const { error: refreshError2 } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError2).toBeNull();

      // Query the view
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_path', 'https://example.com/multi-day-page');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      
      const frequentPath = data[0];
      expect(frequentPath.visit_count).toBe(3);
      expect(frequentPath.days_visited).toBe(3); // Visits on 3 different days
      expect(frequentPath.time_span_hours).toBeGreaterThanOrEqual(47); // At least 2 days
    });

    test('should handle refresh function', async () => {
      // Test the refresh function exists and works
      const { data, error } = await supabase.rpc('refresh_frequent_subpaths');

      expect(error).toBeNull();
      // The function should return successfully (no specific return value expected)
    });
  });

  describe('frequent_subpaths filtering', () => {
    test('should filter by minimum visit count', async () => {
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .gte('visit_count', 3);

      expect(error).toBeNull();
      // All returned paths should have 3+ visits
      data.forEach(path => {
        expect(path.visit_count).toBeGreaterThanOrEqual(3);
      });
    });

    test('should order by visit count descending', async () => {
      const { data, error } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .order('visit_count', { ascending: false });

      expect(error).toBeNull();
      
      // Verify descending order
      for (let i = 0; i < data.length - 1; i++) {
        expect(data[i].visit_count).toBeGreaterThanOrEqual(data[i + 1].visit_count);
      }
    });
  });
});
