import { createClient } from '@supabase/supabase-js';

describe('E2E: Phase 1 Integration Tests', () => {
  let supabase: any;
  let testUserId: string;
  let testSession: any;

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
      await supabase.from('page_profiles').delete().eq('user_id', testUserId);
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    if (supabase && testUserId) {
      await supabase.from('events').delete().eq('user_id', testUserId);
      await supabase.from('page_profiles').delete().eq('user_id', testUserId);
    }
  });

  describe('Complete Phase 1 Workflow', () => {
    test('should handle full user journey from event capture to insights', async () => {
      // Step 1: Simulate user browsing behavior
      const baseTime = new Date();
      const userJourney = [
        // First visit to a document (should not trigger DOM extraction)
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'nav',
          url: 'https://docs.google.com/document/d/research-paper/edit?usp=sharing',
          url_path: '/document/d/research-paper/edit',
          domain: 'docs.google.com',
          title: 'Research Paper - Google Docs',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 3).toISOString()
        },
        // Second visit (still no DOM extraction)
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://docs.google.com/document/d/research-paper/edit?usp=sharing',
          url_path: '/document/d/research-paper/edit',
          domain: 'docs.google.com',
          title: 'Research Paper - Google Docs',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2).toISOString()
        },
        // Third visit (should trigger DOM extraction and profile creation)
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://docs.google.com/document/d/research-paper/edit?usp=sharing',
          url_path: '/document/d/research-paper/edit',
          domain: 'docs.google.com',
          title: 'Research Paper - Google Docs',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 60 * 1).toISOString()
        },
        // Fourth visit (should use cached profile)
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://docs.google.com/document/d/research-paper/edit?usp=sharing',
          url_path: '/document/d/research-paper/edit',
          domain: 'docs.google.com',
          title: 'Research Paper - Google Docs',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 30).toISOString()
        },
        // Visit to a different document (should create separate profile)
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'nav',
          url: 'https://docs.google.com/document/d/meeting-notes/edit',
          url_path: '/document/d/meeting-notes/edit',
          domain: 'docs.google.com',
          title: 'Meeting Notes - Google Docs',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 20).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://docs.google.com/document/d/meeting-notes/edit',
          url_path: '/document/d/meeting-notes/edit',
          domain: 'docs.google.com',
          title: 'Meeting Notes - Google Docs',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 15).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://docs.google.com/document/d/meeting-notes/edit',
          url_path: '/document/d/meeting-notes/edit',
          domain: 'docs.google.com',
          title: 'Meeting Notes - Google Docs',
          ts: new Date(baseTime.getTime() - 1000 * 60 * 10).toISOString(),
        }
      ];

      // Insert all events
      const { error: insertError } = await supabase
        .from('events')
        .insert(userJourney);

      expect(insertError).toBeNull();

      // Step 2: Verify url_path is correctly populated
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('url, url_path')
        .eq('user_id', testUserId)
        .order('ts', { ascending: true });

      expect(eventsError).toBeNull();
      expect(events).toHaveLength(7);

      // Verify url_path normalization
      const researchPaperEvents = events.filter(e => e.url_path === 'https://docs.google.com/document/d/research-paper/edit');
      const meetingNotesEvents = events.filter(e => e.url_path === 'https://docs.google.com/document/d/meeting-notes/edit');
      
      expect(researchPaperEvents).toHaveLength(4);
      expect(meetingNotesEvents).toHaveLength(3);

      // Verify events are properly stored
      expect(events.length).toBeGreaterThan(0);

      // Step 3: Refresh frequent_subpaths materialized view
      const { error: refreshError } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError).toBeNull();

      // Step 4: Verify frequent_subpaths view is populated
      const { data: frequentPaths, error: pathsError } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId);

      expect(pathsError).toBeNull();
      expect(frequentPaths).toHaveLength(2); // Both paths have 3+ visits

      // Verify visit counts
      const researchPaperPath = frequentPaths.find(p => p.url_path === '/document/d/research-paper/edit');
      const meetingNotesPath = frequentPaths.find(p => p.url_path === '/document/d/meeting-notes/edit');
      
      expect(researchPaperPath.visit_count).toBe(4);
      expect(meetingNotesPath.visit_count).toBe(3);

      // Step 5: Simulate page profile creation (this would happen in the extension)
      const researchPaperProfile = {
        user_id: testUserId,
        url_pattern: 'https://docs.google.com/document/d/research-paper/edit',
        visit_count: 4,
        dom_structure: {
          titleSelector: '.docs-title',
          contentSelector: '.kix-lineview-text-block',
          metadataSelector: 'meta[name="description"]'
        },
        content_signals: {
          hasForms: false,
          hasCode: false,
          hasTables: true,
          hasImages: false,
          wordCount: 1500
        },
        extraction_rules: [
          {
            type: 'title',
            selector: '.docs-title',
            extract: 'text',
            priority: 1
          },
          {
            type: 'content',
            selector: '.kix-lineview-text-block',
            extract: 'text',
            priority: 2
          },
          {
            type: 'metadata',
            selector: 'meta[name="description"]',
            extract: 'content',
            priority: 3
          }
        ]
      };

      const meetingNotesProfile = {
        user_id: testUserId,
        url_pattern: 'https://docs.google.com/document/d/meeting-notes/edit',
        visit_count: 3,
        dom_structure: {
          titleSelector: '.docs-title',
          contentSelector: '.kix-lineview-text-block',
          metadataSelector: 'meta[name="description"]'
        },
        content_signals: {
          hasForms: false,
          hasCode: false,
          hasTables: false,
          hasImages: false,
          wordCount: 200
        },
        extraction_rules: [
          {
            type: 'title',
            selector: '.docs-title',
            extract: 'text',
            priority: 1
          },
          {
            type: 'content',
            selector: '.kix-lineview-text-block',
            extract: 'text',
            priority: 2
          }
        ]
      };

      const { error: profileError } = await supabase
        .from('page_profiles')
        .insert([researchPaperProfile, meetingNotesProfile]);

      expect(profileError).toBeNull();

      // Step 6: Test API endpoint
      // Create a valid session for API testing
      const { data: { session } } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'testpassword123'
      });

      if (!session) {
        // Create test user if needed
        await supabase.auth.signUp({
          email: 'test@example.com',
          password: 'testpassword123'
        });
      }

      // Mock API request
      const mockRequest = {
        method: 'GET',
        url: '/api/analysis/frequent-subpaths?min_visits=3',
        headers: {
          'authorization': `Bearer ${session?.access_token || 'test-token'}`
        },
        nextUrl: new URL('/api/analysis/frequent-subpaths?min_visits=3', 'http://localhost:3000')
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      // Import and call the API route
      const { GET } = await import('../../apps/web/app/api/analysis/frequent-subpaths/route');
      await GET(mockRequest as any, mockResponse as any);

      // Verify API response
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.total).toBe(2);
      expect(responseData.frequent_paths).toHaveLength(2);
      expect(responseData.by_domain).toHaveProperty('docs.google.com');
      expect(responseData.insights).toBeDefined();

      // Step 7: Verify insights are meaningful
      const insights = responseData.insights;
      expect(insights.top_documents).toBeDefined();
      expect(insights.core_tools).toBeDefined();
      expect(insights.potential_timepass).toBeDefined();
      expect(insights.high_focus_pages).toBeDefined();

      // Should identify Google Docs as a core tool
      const coreTools = insights.core_tools;
      expect(coreTools.some((tool: any) => tool.domain === 'docs.google.com')).toBe(true);

      // Should identify research paper as high focus
      const highFocusPages = insights.high_focus_pages;
      expect(highFocusPages.some((page: any) => 
        page.url_path === '/document/d/research-paper/edit'
      )).toBe(true);
    });

    test('should handle edge cases and error scenarios', async () => {
      // Test with malformed URLs
      const malformedEvents = [
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'nav',
          url: 'invalid-url',
          url_path: null, // This should be handled gracefully
          domain: null,
          title: 'Invalid Page',
          ts: new Date().toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://example.com',
          url_path: '/',
          domain: 'example.com',
          title: 'Home Page',
          ts: new Date().toISOString()
        }
      ];

      const { error: insertError } = await supabase
        .from('events')
        .insert(malformedEvents);

      // Should handle gracefully (either succeed or fail with proper error)
      if (insertError) {
        expect(insertError.message).toBeDefined();
      } else {
        // If insertion succeeded, verify data integrity
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .eq('user_id', testUserId);

        expect(events).toBeDefined();
      }
    });

    test('should maintain data consistency across multiple operations', async () => {
      // Insert events in batches
      const batch1 = [
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'nav',
          url: 'https://example.com/page1',
          url_path: '/page1',
          domain: 'example.com',
          title: 'Page 1',
          ts: new Date(Date.now() - 1000 * 60 * 60).toISOString()
        }
      ];

      const batch2 = [
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://example.com/page1',
          url_path: '/page1',
          domain: 'example.com',
          title: 'Page 1',
          ts: new Date(Date.now() - 1000 * 60 * 30).toISOString()
        },
        {
          user_id: testUserId,
          device_id: 'e2e-test-device',
          type: 'click',
          url: 'https://example.com/page1',
          url_path: '/page1',
          domain: 'example.com',
          title: 'Page 1',
          ts: new Date(Date.now() - 1000 * 60 * 10).toISOString()
        }
      ];

      // Insert first batch
      const { error: error1 } = await supabase.from('events').insert(batch1);
      expect(error1).toBeNull();

      // Insert second batch
      const { error: error2 } = await supabase.from('events').insert(batch2);
      expect(error2).toBeNull();

      // Refresh materialized view
      const { error: refreshError } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError).toBeNull();

      // Verify consistency
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_path', 'https://example.com/page1');

      expect(events).toHaveLength(3);

      const { data: frequentPaths } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_path', 'https://example.com/page1');

      expect(frequentPaths).toHaveLength(1);
      expect(frequentPaths[0].visit_count).toBe(3);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large number of events efficiently', async () => {
      const startTime = Date.now();
      
      // Generate 100 events for the same page
      const events = Array.from({ length: 100 }, (_, i) => ({
        user_id: testUserId,
        device_id: 'e2e-test-device',
        type: i % 2 === 0 ? 'click' : 'click',
        url: 'https://example.com/performance-test',
        url_path: '/performance-test',
        domain: 'example.com',
        title: 'Performance Test Page',
        ts: new Date(Date.now() - 1000 * 60 * i).toISOString()
      }));

      const { error: insertError } = await supabase.from('events').insert(events);
      expect(insertError).toBeNull();

      const insertTime = Date.now() - startTime;
      expect(insertTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Refresh materialized view
      const refreshStart = Date.now();
      const { error: refreshError } = await supabase.rpc('refresh_frequent_subpaths');
      expect(refreshError).toBeNull();
      
      const refreshTime = Date.now() - refreshStart;
      expect(refreshTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify data integrity
      const { data: frequentPaths } = await supabase
        .from('frequent_subpaths')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_path', '/performance-test');

      expect(frequentPaths).toHaveLength(1);
      expect(frequentPaths[0].visit_count).toBe(100);
    });
  });
});
