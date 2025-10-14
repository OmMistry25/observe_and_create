import { createClient } from '@supabase/supabase-js';

describe('Database: URL Path Functionality', () => {
  let supabase: any;
  let testUserId: string;

  beforeAll(async () => {
    // Initialize Supabase client for testing
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables for testing');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    testUserId = '436e9d01-2ef4-4437-975b-dc34ccb4fe21'; // Use existing user from database
  });

  afterAll(async () => {
    // Clean up test data (but keep the existing user profile)
    if (supabase && testUserId) {
      await supabase.from('events').delete().eq('user_id', testUserId).eq('device_id', 'test-device');
      await supabase.from('page_profiles').delete().eq('user_id', testUserId);
    }
  });

  describe('url_path column', () => {
    test('should auto-populate url_path from url on insert', async () => {
      const testEvent = {
        user_id: testUserId,
        device_id: 'test-device',
        type: 'click',
        url: 'https://example.com/test?param=value#hash',
        title: 'Test Page',
        ts: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('events')
        .insert(testEvent)
        .select('url, url_path')
        .single();

      expect(error).toBeNull();
      expect(data.url).toBe('https://example.com/test?param=value#hash');
      expect(data.url_path).toBe('https://example.com/test');
    });

    test('should handle URLs without path', async () => {
      const testEvent = {
        user_id: testUserId,
        device_id: 'test-device',
        type: 'nav',
        url: 'https://example.com',
        title: 'Home Page',
        ts: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('events')
        .insert(testEvent)
        .select('url, url_path')
        .single();

      expect(error).toBeNull();
      expect(data.url_path).toBe('https://example.com');
    });

    test('should handle complex URLs with multiple query params', async () => {
      const testEvent = {
        user_id: testUserId,
        device_id: 'test-device',
        type: 'click',
        url: 'https://docs.google.com/document/d/123/edit?usp=sharing&authuser=0',
        title: 'Google Doc',
        ts: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('events')
        .insert(testEvent)
        .select('url, url_path')
        .single();

      expect(error).toBeNull();
      expect(data.url_path).toBe('https://docs.google.com/document/d/123/edit');
    });
  });

  describe('url_path indexing', () => {
    test('should efficiently query by url_path', async () => {
      // Insert multiple events with same path
      const events = [
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'click',
          url: 'https://example.com/page1?param=1',
          url_path: '/page1',
          title: 'Page 1',
          ts: new Date().toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'test-device',
          type: 'click',
          url: 'https://example.com/page1?param=2',
          url_path: '/page1',
          title: 'Page 1',
          ts: new Date().toISOString()
        }
      ];

      await supabase.from('events').insert(events);

      // Query by url_path
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_path', 'https://example.com/page1');

      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data.every(event => event.url_path === 'https://example.com/page1')).toBe(true);
    });
  });
});
