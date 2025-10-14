// Global test setup
import { config } from 'dotenv';

// Load environment variables for testing
config({ path: '.env.test' });

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console.log in tests unless explicitly enabled
  if (!process.env.TEST_VERBOSE) {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
});

// Global test utilities
global.testUtils = {
  // Wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create test user data
  createTestUser: () => ({
    id: 'test-user-' + Math.random().toString(36).substr(2, 9),
    email: 'test@example.com'
  }),
  
  // Create test event data
  createTestEvent: (overrides = {}) => ({
    id: 'test-event-' + Math.random().toString(36).substr(2, 9),
    user_id: 'test-user-123',
    type: 'click',
    url: 'https://example.com/test',
    url_path: '/test',
    domain: 'example.com',
    title: 'Test Page',
    timestamp: new Date().toISOString(),
    ...overrides
  }),
  
  // Create test page profile
  createTestProfile: (overrides = {}) => ({
    id: 'test-profile-' + Math.random().toString(36).substr(2, 9),
    user_id: 'test-user-123',
    url_pattern: 'https://example.com/test',
    visit_count: 3,
    dom_structure: {
      titleSelector: 'h1',
      contentSelector: '.content'
    },
    content_signals: {
      hasForms: false,
      hasCode: false,
      hasTables: false
    },
    extraction_rules: [
      {
        type: 'content',
        selector: '.content',
        extract: 'text'
      }
    ],
    ...overrides
  })
};
