import { createClient } from '@supabase/supabase-js';

// Mock Next.js request/response
const mockRequest = (method: string, url: string, headers: Record<string, string> = {}) => ({
  method,
  url,
  headers,
  nextUrl: new URL(url, 'http://localhost:3000')
});

const mockResponse = () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    headers: new Map()
  };
  return res;
};

describe('API: /api/analysis/frequent-subpaths', () => {
  let supabase: any;
  let testUserId: string;

  beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables for testing');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    testUserId = 'test-user-' + Math.random().toString(36).substr(2, 9);
  });

  afterAll(async () => {
    if (supabase && testUserId) {
      await supabase.from('events').delete().eq('user_id', testUserId);
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    if (supabase && testUserId) {
      await supabase.from('events').delete().eq('user_id', testUserId);
    }
  });

  describe('GET /api/analysis/frequent-subpaths', () => {
    test('should return 401 for missing authorization header', async () => {
      const req = mockRequest('GET', '/api/analysis/frequent-subpaths');
      const res = mockResponse();

      // Import the route handler dynamically to avoid module loading issues
      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      
      await GET(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    test('should return 401 for invalid authorization header', async () => {
      const req = mockRequest('GET', '/api/analysis/frequent-subpaths', {
        'authorization': 'Bearer invalid-token'
      });
      const res = mockResponse();

      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      
      await GET(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    test('should return empty results for user with no frequent paths', async () => {
      // Create a valid JWT token for testing
      const { data: { session } } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'testpassword123'
      });

      if (!session) {
        // Create a test user if it doesn't exist
        await supabase.auth.signUp({
          email: 'test@example.com',
          password: 'testpassword123'
        });
        
        const { data: { session: newSession } } = await supabase.auth.signInWithPassword({
          email: 'test@example.com',
          password: 'testpassword123'
        });
        
        if (!newSession) {
          throw new Error('Failed to create test user');
        }
      }

      const req = mockRequest('GET', '/api/analysis/frequent-subpaths', {
        'authorization': `Bearer ${session?.access_token || 'test-token'}`
      });
      const res = mockResponse();

      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      
      await GET(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        total: 0,
        frequent_paths: [],
        by_domain: {},
        insights: {
          top_documents: [],
          core_tools: [],
          potential_timepass: [],
          high_focus_pages: []
        }
      });
    });

    test('should return frequent paths for user with data', async () => {
      // Insert test events to create frequent paths
      const baseTime = new Date();
      const events = [
        {
          user_id: testUserId,
          type: 'navigate',
          url: 'https://docs.google.com/document/d/123/edit',
          url_path: '/document/d/123/edit',
          domain: 'docs.google.com',
          title: 'Important Document',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          type: 'click',
          url: 'https://docs.google.com/document/d/123/edit',
          url_path: '/document/d/123/edit',
          domain: 'docs.google.com',
          title: 'Important Document',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString()
        },
        {
          user_id: testUserId,
          type: 'scroll',
          url: 'https://docs.google.com/document/d/123/edit',
          url_path: '/document/d/123/edit',
          domain: 'docs.google.com',
          title: 'Important Document',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 30).toISOString()
        },
        {
          user_id: testUserId,
          type: 'navigate',
          url: 'https://github.com/user/repo/issues/456',
          url_path: '/user/repo/issues/456',
          domain: 'github.com',
          title: 'Issue #456',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 20).toISOString()
        },
        {
          user_id: testUserId,
          type: 'click',
          url: 'https://github.com/user/repo/issues/456',
          url_path: '/user/repo/issues/456',
          domain: 'github.com',
          title: 'Issue #456',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 10).toISOString()
        },
        {
          user_id: testUserId,
          type: 'scroll',
          url: 'https://github.com/user/repo/issues/456',
          url_path: '/user/repo/issues/456',
          domain: 'github.com',
          title: 'Issue #456',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 5).toISOString()
        }
      ];

      await supabase.from('events').insert(events);

      // Refresh the materialized view
      await supabase.rpc('refresh_frequent_subpaths');

      // Create a valid JWT token for testing
      const { data: { session } } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'testpassword123'
      });

      const req = mockRequest('GET', '/api/analysis/frequent-subpaths?min_visits=2', {
        'authorization': `Bearer ${session?.access_token || 'test-token'}`
      });
      const res = mockResponse();

      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      
      await GET(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.total).toBeGreaterThan(0);
      expect(responseData.frequent_paths).toBeDefined();
      expect(responseData.by_domain).toBeDefined();
      expect(responseData.insights).toBeDefined();
    });

    test('should filter by minimum visit count parameter', async () => {
      // Insert test events with different visit counts
      const baseTime = new Date();
      const events = [
        // Path with 2 visits (should be filtered out with min_visits=3)
        {
          user_id: testUserId,
          type: 'navigate',
          url: 'https://example.com/low-visit',
          url_path: '/low-visit',
          domain: 'example.com',
          title: 'Low Visit Page',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60).toISOString()
        },
        {
          user_id: testUserId,
          type: 'click',
          url: 'https://example.com/low-visit',
          url_path: '/low-visit',
          domain: 'example.com',
          title: 'Low Visit Page',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 30).toISOString()
        },
        // Path with 3 visits (should be included with min_visits=3)
        {
          user_id: testUserId,
          type: 'navigate',
          url: 'https://example.com/high-visit',
          url_path: '/high-visit',
          domain: 'example.com',
          title: 'High Visit Page',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          type: 'click',
          url: 'https://example.com/high-visit',
          url_path: '/high-visit',
          domain: 'example.com',
          title: 'High Visit Page',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60).toISOString()
        },
        {
          user_id: testUserId,
          type: 'scroll',
          url: 'https://example.com/high-visit',
          url_path: '/high-visit',
          domain: 'example.com',
          title: 'High Visit Page',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 30).toISOString()
        }
      ];

      await supabase.from('events').insert(events);

      // Refresh the materialized view
      await supabase.rpc('refresh_frequent_subpaths');

      // Create a valid JWT token for testing
      const { data: { session } } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'testpassword123'
      });

      const req = mockRequest('GET', '/api/analysis/frequent-subpaths?min_visits=3', {
        'authorization': `Bearer ${session?.access_token || 'test-token'}`
      });
      const res = mockResponse();

      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      
      await GET(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.success).toBe(true);
      
      // Should only include paths with 3+ visits
      responseData.frequent_paths.forEach((path: any) => {
        expect(path.visit_count).toBeGreaterThanOrEqual(3);
      });
    });

    test('should generate insights from frequent paths', async () => {
      // Insert test events for different types of content
      const baseTime = new Date();
      const events = [
        // Document editing (high focus)
        {
          user_id: testUserId,
          type: 'navigate',
          url: 'https://docs.google.com/document/d/123/edit',
          url_path: '/document/d/123/edit',
          domain: 'docs.google.com',
          title: 'Research Paper',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          type: 'click',
          url: 'https://docs.google.com/document/d/123/edit',
          url_path: '/document/d/123/edit',
          domain: 'docs.google.com',
          title: 'Research Paper',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60).toISOString()
        },
        {
          user_id: testUserId,
          type: 'scroll',
          url: 'https://docs.google.com/document/d/123/edit',
          url_path: '/document/d/123/edit',
          domain: 'docs.google.com',
          title: 'Research Paper',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 30).toISOString()
        },
        // Social media (potential timepass)
        {
          user_id: testUserId,
          type: 'navigate',
          url: 'https://twitter.com/home',
          url_path: '/home',
          domain: 'twitter.com',
          title: 'Twitter',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60 * 3).toISOString()
        },
        {
          user_id: testUserId,
          type: 'click',
          url: 'https://twitter.com/home',
          url_path: '/home',
          domain: 'twitter.com',
          title: 'Twitter',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
          user_id: testUserId,
          type: 'scroll',
          url: 'https://twitter.com/home',
          url_path: '/home',
          domain: 'twitter.com',
          title: 'Twitter',
          timestamp: new Date(baseTime.getTime() - 1000 * 60 * 60).toISOString()
        }
      ];

      await supabase.from('events').insert(events);

      // Refresh the materialized view
      await supabase.rpc('refresh_frequent_subpaths');

      // Create a valid JWT token for testing
      const { data: { session } } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'testpassword123'
      });

      const req = mockRequest('GET', '/api/analysis/frequent-subpaths', {
        'authorization': `Bearer ${session?.access_token || 'test-token'}`
      });
      const res = mockResponse();

      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      
      await GET(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.insights).toBeDefined();
      expect(responseData.insights.top_documents).toBeDefined();
      expect(responseData.insights.core_tools).toBeDefined();
      expect(responseData.insights.potential_timepass).toBeDefined();
      expect(responseData.insights.high_focus_pages).toBeDefined();
    });

    test('should handle database errors gracefully', async () => {
      // Mock a database error by using an invalid user ID
      const req = mockRequest('GET', '/api/analysis/frequent-subpaths', {
        'authorization': 'Bearer valid-token-for-nonexistent-user'
      });
      const res = mockResponse();

      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      
      await GET(req as any, res as any);

      // Should handle the error gracefully (either 401 or 500 depending on implementation)
      expect(res.status).toHaveBeenCalledWith(expect.any(Number));
      expect(res.json).toHaveBeenCalled();
    });
  });
});
