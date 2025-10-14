/**
 * @jest-environment jsdom
 */

import { PageProfiler } from '../../apps/extension/src/pageProfiler';

// Mock IndexedDB
const mockIndexedDB = {
  open: jest.fn(),
  deleteDatabase: jest.fn()
};

// Mock DOM methods
const mockDocument = {
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(),
  title: 'Test Page',
  body: {
    innerHTML: '<h1>Test Title</h1><div class="content">Test content</div>'
  }
};

// Mock window.location
const mockLocation = {
  href: 'https://example.com/test?param=value#hash',
  hostname: 'example.com',
  pathname: '/test',
  search: '?param=value',
  hash: '#hash'
};

// Mock console to reduce test noise
const mockConsole = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('PageProfiler', () => {
  let pageProfiler: PageProfiler;
  let mockDB: any;
  let mockTransaction: any;
  let mockStore: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock global objects
    global.indexedDB = mockIndexedDB as any;
    global.document = mockDocument as any;
    global.window = { location: mockLocation } as any;
    global.console = mockConsole as any;

    // Mock IndexedDB transaction chain
    mockStore = {
      get: jest.fn(),
      put: jest.fn(),
      add: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn()
    };

    mockTransaction = {
      objectStore: jest.fn().mockReturnValue(mockStore),
      oncomplete: null,
      onerror: null
    };

    mockDB = {
      transaction: jest.fn().mockReturnValue(mockTransaction),
      close: jest.fn()
    };

    mockIndexedDB.open.mockImplementation((name: string) => {
      const request = {
        onsuccess: null,
        onerror: null,
        result: mockDB
      };
      
      // Simulate successful open
      setTimeout(() => {
        if (request.onsuccess) request.onsuccess({ target: request } as any);
      }, 0);
      
      return request;
    });

    pageProfiler = new PageProfiler();
  });

  describe('normalizeUrl', () => {
    test('should remove query parameters and hash', () => {
      const normalized = pageProfiler['normalizeUrl']('https://example.com/path?param=value#hash');
      expect(normalized).toBe('https://example.com/path');
    });

    test('should handle URLs without query params', () => {
      const normalized = pageProfiler['normalizeUrl']('https://example.com/path');
      expect(normalized).toBe('https://example.com/path');
    });

    test('should handle root path', () => {
      const normalized = pageProfiler['normalizeUrl']('https://example.com/');
      expect(normalized).toBe('https://example.com/');
    });

    test('should handle URLs with only hash', () => {
      const normalized = pageProfiler['normalizeUrl']('https://example.com/path#section');
      expect(normalized).toBe('https://example.com/path');
    });
  });

  describe('detectPlatform', () => {
    test('should detect Google Docs', () => {
      const platform = pageProfiler['detectPlatform']('https://docs.google.com/document/d/123/edit');
      expect(platform).toBe('google_docs');
    });

    test('should detect GitHub', () => {
      const platform = pageProfiler['detectPlatform']('https://github.com/user/repo/issues/123');
      expect(platform).toBe('github');
    });

    test('should detect Notion', () => {
      const platform = pageProfiler['detectPlatform']('https://notion.so/workspace/page');
      expect(platform).toBe('notion');
    });

    test('should detect Canvas LMS', () => {
      const platform = pageProfiler['detectPlatform']('https://canvas.illinois.edu/courses/123/assignments');
      expect(platform).toBe('canvas_lms');
    });

    test('should default to web for unknown platforms', () => {
      const platform = pageProfiler['detectPlatform']('https://example.com/page');
      expect(platform).toBe('web');
    });
  });

  describe('analyzeDOMStructure', () => {
    test('should find title selector', () => {
      mockDocument.querySelector.mockImplementation((selector: string) => {
        if (selector === 'h1') return { textContent: 'Test Title' };
        if (selector === 'title') return { textContent: 'Test Page' };
        return null;
      });

      const structure = pageProfiler['analyzeDOMStructure']();
      
      expect(structure.titleSelector).toBe('h1');
      expect(mockDocument.querySelector).toHaveBeenCalledWith('h1');
    });

    test('should find content selector', () => {
      mockDocument.querySelectorAll.mockImplementation((selector: string) => {
        if (selector === '.content') return [{ textContent: 'Test content' }];
        if (selector === 'main') return [{ textContent: 'Main content' }];
        if (selector === 'article') return [];
        return [];
      });

      const structure = pageProfiler['analyzeDOMStructure']();
      
      expect(structure.contentSelector).toBe('.content');
    });

    test('should find metadata selector', () => {
      mockDocument.querySelector.mockImplementation((selector: string) => {
        if (selector === 'meta[name="description"]') {
          return { getAttribute: () => 'Test description' };
        }
        return null;
      });

      const structure = pageProfiler['analyzeDOMStructure']();
      
      expect(structure.metadataSelector).toBe('meta[name="description"]');
    });
  });

  describe('detectContentSignals', () => {
    test('should detect forms', () => {
      mockDocument.querySelectorAll.mockImplementation((selector: string) => {
        if (selector === 'form') return [{ tagName: 'FORM' }];
        if (selector === 'input[type="checkbox"]') return [];
        if (selector === 'pre, code') return [];
        if (selector === 'table') return [];
        if (selector === 'img') return [];
        if (selector === 'h1, h2, h3, h4, h5, h6') return [];
        return [];
      });

      const signals = pageProfiler['detectContentSignals']();
      
      expect(signals.hasForms).toBe(true);
    });

    test('should detect code blocks', () => {
      mockDocument.querySelectorAll.mockImplementation((selector: string) => {
        if (selector === 'form') return [];
        if (selector === 'input[type="checkbox"]') return [];
        if (selector === 'pre, code') return [{ tagName: 'CODE' }];
        if (selector === 'table') return [];
        if (selector === 'img') return [];
        if (selector === 'h1, h2, h3, h4, h5, h6') return [];
        return [];
      });

      const signals = pageProfiler['detectContentSignals']();
      
      expect(signals.hasCode).toBe(true);
    });

    test('should count words in content', () => {
      mockDocument.querySelectorAll.mockImplementation((selector: string) => {
        if (selector === 'form') return [];
        if (selector === 'input[type="checkbox"]') return [];
        if (selector === 'pre, code') return [];
        if (selector === 'table') return [];
        if (selector === 'img') return [];
        if (selector === 'h1, h2, h3, h4, h5, h6') return [];
        return [];
      });

      // Mock body text content
      Object.defineProperty(mockDocument.body, 'textContent', {
        value: 'This is a test document with multiple words for counting purposes.',
        configurable: true
      });

      const signals = pageProfiler['detectContentSignals']();
      
      expect(signals.wordCount).toBeGreaterThan(10);
    });
  });

  describe('generateExtractionRules', () => {
    test('should generate rules based on content signals', () => {
      const domStructure = {
        titleSelector: 'h1',
        contentSelector: '.content',
        metadataSelector: 'meta[name="description"]'
      };

      const contentSignals = {
        hasForms: true,
        hasCode: false,
        hasTables: true,
        hasImages: false,
        wordCount: 500
      };

      const rules = pageProfiler['generateExtractionRules'](domStructure, contentSignals);
      
      expect(rules).toHaveLength(3); // title, content, metadata
      expect(rules[0].type).toBe('title');
      expect(rules[1].type).toBe('content');
      expect(rules[2].type).toBe('metadata');
    });

    test('should generate todo rules for forms with checkboxes', () => {
      const domStructure = {
        titleSelector: 'h1',
        contentSelector: '.content',
        metadataSelector: null
      };

      const contentSignals = {
        hasForms: true,
        hasCode: false,
        hasTables: false,
        hasImages: false,
        wordCount: 100
      };

      // Mock checkbox detection
      mockDocument.querySelectorAll.mockImplementation((selector: string) => {
        if (selector === 'input[type="checkbox"]') return [{ checked: false }];
        return [];
      });

      const rules = pageProfiler['generateExtractionRules'](domStructure, contentSignals);
      
      const todoRule = rules.find(rule => rule.type === 'todo_items');
      expect(todoRule).toBeDefined();
      expect(todoRule?.selector).toBe('input[type="checkbox"]');
    });
  });

  describe('classifyContent', () => {
    test('should classify todo list content', () => {
      const text = 'Buy groceries, Do laundry, Call mom';
      const signals = {
        hasForms: true,
        hasCode: false,
        hasTables: false,
        hasImages: false,
        wordCount: 10
      };

      const classification = pageProfiler['classifyContent'](text, signals);
      
      expect(classification).toBe('todo_list');
    });

    test('should classify code documentation', () => {
      const text = 'function example() { return "hello"; }';
      const signals = {
        hasForms: false,
        hasCode: true,
        hasTables: false,
        hasImages: false,
        wordCount: 20
      };

      const classification = pageProfiler['classifyContent'](text, signals);
      
      expect(classification).toBe('code_documentation');
    });

    test('should classify academic writing', () => {
      const text = 'This research paper examines the effects of climate change on biodiversity in tropical rainforests. The methodology involves...';
      const signals = {
        hasForms: false,
        hasCode: false,
        hasTables: true,
        hasImages: false,
        wordCount: 500
      };

      const classification = pageProfiler['classifyContent'](text, signals);
      
      expect(classification).toBe('academic_writing');
    });

    test('should default to general content', () => {
      const text = 'This is just some regular content';
      const signals = {
        hasForms: false,
        hasCode: false,
        hasTables: false,
        hasImages: false,
        wordCount: 10
      };

      const classification = pageProfiler['classifyContent'](text, signals);
      
      expect(classification).toBe('general_content');
    });
  });

  describe('getUniqueSelector', () => {
    test('should generate unique selector for element with ID', () => {
      const mockElement = {
        id: 'unique-id',
        tagName: 'DIV',
        className: 'test-class',
        parentElement: {
          tagName: 'BODY'
        }
      };

      const selector = pageProfiler['getUniqueSelector'](mockElement as any);
      
      expect(selector).toBe('#unique-id');
    });

    test('should generate selector with class when no ID', () => {
      const mockElement = {
        id: '',
        tagName: 'DIV',
        className: 'unique-class',
        parentElement: {
          tagName: 'BODY'
        }
      };

      const selector = pageProfiler['getUniqueSelector'](mockElement as any);
      
      expect(selector).toBe('div.unique-class');
    });

    test('should generate tag-based selector when no ID or class', () => {
      const mockElement = {
        id: '',
        tagName: 'H1',
        className: '',
        parentElement: {
          tagName: 'BODY'
        }
      };

      const selector = pageProfiler['getUniqueSelector'](mockElement as any);
      
      expect(selector).toBe('h1');
    });
  });

  describe('shouldProfile', () => {
    test('should return false for new URLs (placeholder implementation)', async () => {
      const shouldProfile = await pageProfiler.shouldProfile('https://example.com/new-page');
      
      // Current implementation always returns false (placeholder)
      expect(shouldProfile).toBe(false);
    });
  });

  describe('getOrCreateProfile', () => {
    test('should create new profile for new URL', async () => {
      // Mock successful database operations
      mockStore.get.mockImplementation((key: string) => {
        const request = {
          onsuccess: null,
          result: undefined // No existing profile
        };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request } as any);
        }, 0);
        return request;
      });

      mockStore.add.mockImplementation((data: any) => {
        const request = {
          onsuccess: null,
          result: { ...data, id: 'new-profile-id' }
        };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request } as any);
        }, 0);
        return request;
      });

      const profile = await pageProfiler.getOrCreateProfile('https://example.com/test');
      
      expect(profile).toBeDefined();
      expect(profile.urlPattern).toBe('https://example.com/test');
      expect(profile.visitCount).toBe(1);
      expect(mockStore.add).toHaveBeenCalled();
    });

    test('should return existing profile if found', async () => {
      const existingProfile = {
        id: 'existing-profile',
        urlPattern: 'https://example.com/test',
        visitCount: 3,
        domStructure: { titleSelector: 'h1' },
        contentSignals: { hasForms: false },
        extractionRules: []
      };

      mockStore.get.mockImplementation((key: string) => {
        const request = {
          onsuccess: null,
          result: existingProfile
        };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request } as any);
        }, 0);
        return request;
      });

      const profile = await pageProfiler.getOrCreateProfile('https://example.com/test');
      
      expect(profile).toEqual(existingProfile);
      expect(mockStore.add).not.toHaveBeenCalled();
    });
  });

  describe('extractUsingProfile', () => {
    test('should extract content using profile rules', () => {
      const profile = {
        id: 'test-profile',
        urlPattern: 'https://example.com/test',
        visitCount: 3,
        domStructure: {
          titleSelector: 'h1',
          contentSelector: '.content',
          metadataSelector: 'meta[name="description"]'
        },
        contentSignals: {
          hasForms: false,
          hasCode: false,
          hasTables: false,
          hasImages: false,
          wordCount: 100
        },
        extractionRules: [
          {
            type: 'title',
            selector: 'h1',
            extract: 'text',
            priority: 1
          },
          {
            type: 'content',
            selector: '.content',
            extract: 'text',
            priority: 2
          }
        ]
      };

      // Mock DOM queries
      mockDocument.querySelector.mockImplementation((selector: string) => {
        if (selector === 'h1') return { textContent: 'Test Title' };
        if (selector === '.content') return { textContent: 'Test content here' };
        return null;
      });

      const extracted = pageProfiler.extractUsingProfile(profile);
      
      expect(extracted).toBeDefined();
      expect(extracted.title).toBe('Test Title');
      expect(extracted.content).toBe('Test content here');
    });

    test('should handle missing elements gracefully', () => {
      const profile = {
        id: 'test-profile',
        urlPattern: 'https://example.com/test',
        visitCount: 3,
        domStructure: {
          titleSelector: 'h1',
          contentSelector: '.missing-content',
          metadataSelector: null
        },
        contentSignals: {
          hasForms: false,
          hasCode: false,
          hasTables: false,
          hasImages: false,
          wordCount: 100
        },
        extractionRules: [
          {
            type: 'title',
            selector: 'h1',
            extract: 'text',
            priority: 1
          },
          {
            type: 'content',
            selector: '.missing-content',
            extract: 'text',
            priority: 2
          }
        ]
      };

      // Mock DOM queries - missing content element
      mockDocument.querySelector.mockImplementation((selector: string) => {
        if (selector === 'h1') return { textContent: 'Test Title' };
        if (selector === '.missing-content') return null;
        return null;
      });

      const extracted = pageProfiler.extractUsingProfile(profile);
      
      expect(extracted).toBeDefined();
      expect(extracted.title).toBe('Test Title');
      expect(extracted.content).toBe(''); // Should be empty for missing element
    });
  });
});
