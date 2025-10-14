/**
 * Page Profiler - Smart Adaptive DOM Context Extraction
 * Part of Issue #1: Learns page structure automatically and triggers DOM extraction only for frequently visited pages
 */

export interface PageProfile {
  urlPattern: string; // Normalized URL (without query params)
  visitCount: number;
  domStructure: DOMStructure;
  contentSignals: ContentSignals;
  extractionRules: ExtractionRule[];
  lastUpdated: number;
  profileVersion: number;
}

export interface DOMStructure {
  titleSelector: string; // Where the title lives
  contentSelector: string; // Main content area
  metadataSelectors: Record<string, string>; // Other key elements
}

export interface ContentSignals {
  hasCheckboxes: number;
  hasCodeBlocks: number;
  hasTables: number;
  hasImages: number;
  hasForms: number;
  hasHeadings: number;
  wordCount: number;
  hasDatePickers: number;
}

export interface ExtractionRule {
  selector: string;
  attribute: 'textContent' | 'value' | 'innerHTML' | 'checked' | string;
  label: string; // What this represents (e.g., "documentTitle", "todoItems")
  confidence: number; // How confident we are this is correct (0-1)
}

export interface SubpathFrequency {
  urlPath: string;
  visitCount: number;
  shouldProfile: boolean; // Only profile if visited 3+ times
  lastProfiled: number | null;
}

export interface DocumentContext {
  urlPattern: string;
  visitCount: number;
  [key: string]: any; // Extracted fields from rules
}

/**
 * PageProfiler class - Intelligent, adaptive DOM extraction
 */
export class PageProfiler {
  private profiles: Map<string, PageProfile> = new Map();
  private subpathCache: Map<string, SubpathFrequency> = new Map();
  private dbName = 'PageProfilerDB';
  private storeName = 'profiles';

  constructor() {
    this.initIndexedDB();
    this.loadProfilesFromStorage();
  }

  /**
   * Initialize IndexedDB for persistent storage
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'urlPattern' });
        }
      };
    });
  }

  /**
   * Load profiles from IndexedDB on initialization
   */
  private async loadProfilesFromStorage(): Promise<void> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const profiles = request.result as PageProfile[];
        profiles.forEach(profile => {
          this.profiles.set(profile.urlPattern, profile);
        });
        console.log(`[PageProfiler] Loaded ${profiles.length} profiles from storage`);
      };
    } catch (error) {
      console.warn('[PageProfiler] Failed to load profiles from storage:', error);
    }
  }

  /**
   * Save profile to IndexedDB
   */
  private async saveProfile(profile: PageProfile): Promise<void> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.put(profile);
    } catch (error) {
      console.warn('[PageProfiler] Failed to save profile:', error);
    }
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Get or create profile for current page
   */
  async getOrCreateProfile(url: string): Promise<PageProfile> {
    const normalizedUrl = this.normalizeUrl(url);

    // Check if we have a profile for this exact subpath
    let profile = this.profiles.get(normalizedUrl);

    if (!profile) {
      // First visit to this specific page - analyze it
      profile = await this.analyzeAndCreateProfile(normalizedUrl);
      this.profiles.set(normalizedUrl, profile);

      // Save to IndexedDB for persistence
      await this.saveProfile(profile);
    } else {
      // Increment visit count
      profile.visitCount++;

      // Re-analyze every 10 visits to improve accuracy
      if (profile.visitCount % 10 === 0) {
        console.log(`[PageProfiler] Re-analyzing profile (visit #${profile.visitCount})`);
        profile = await this.refineProfile(profile);
        await this.saveProfile(profile);
      }
    }

    return profile;
  }

  /**
   * Analyze page and create initial profile
   */
  private async analyzeAndCreateProfile(url: string): Promise<PageProfile> {
    console.log(`[PageProfiler] Analyzing new page: ${url}`);

    const domStructure = this.analyzeDOMStructure();
    const contentSignals = this.detectContentSignals();
    const extractionRules = this.generateExtractionRules(domStructure, contentSignals);

    return {
      urlPattern: url,
      visitCount: 1,
      domStructure,
      contentSignals,
      extractionRules,
      lastUpdated: Date.now(),
      profileVersion: 1,
    };
  }

  /**
   * Refine existing profile with new analysis
   */
  private async refineProfile(profile: PageProfile): Promise<PageProfile> {
    const domStructure = this.analyzeDOMStructure();
    const contentSignals = this.detectContentSignals();
    const extractionRules = this.generateExtractionRules(domStructure, contentSignals);

    return {
      ...profile,
      domStructure,
      contentSignals,
      extractionRules,
      lastUpdated: Date.now(),
      profileVersion: profile.profileVersion + 1,
    };
  }

  /**
   * Analyze DOM structure to find important elements
   */
  private analyzeDOMStructure(): DOMStructure {
    // Smart heuristics to find important elements
    const potentialTitles = [
      { selector: 'h1', score: 10 },
      { selector: '[contenteditable="true"]', score: 8 },
      { selector: '.docs-title-input', score: 10 }, // Google Docs
      { selector: '[data-content-editable-leaf="true"]', score: 9 }, // Notion
      { selector: '.notion-page-content h1', score: 10 },
      { selector: 'title', score: 5 },
    ];

    const titleSelector = potentialTitles
      .filter(t => document.querySelector(t.selector))
      .sort((a, b) => b.score - a.score)[0]?.selector || 'h1';

    const contentSelector = this.findMainContentArea();

    return {
      titleSelector,
      contentSelector,
      metadataSelectors: this.findMetadataElements(),
    };
  }

  /**
   * Find the main content area of the page
   */
  private findMainContentArea(): string {
    // Find the largest text container
    const candidates = Array.from(document.querySelectorAll('article, main, [role="main"], .content, #content'));

    if (candidates.length === 0) {
      // Fallback: find element with most text
      const allDivs = Array.from(document.querySelectorAll('div'));
      const sorted = allDivs.sort((a, b) =>
        (b.textContent?.length || 0) - (a.textContent?.length || 0)
      );
      return sorted[0] ? this.getUniqueSelector(sorted[0]) : 'body';
    }

    return this.getUniqueSelector(candidates[0]);
  }

  /**
   * Find metadata elements (author, date, etc.)
   */
  private findMetadataElements(): Record<string, string> {
    const metadata: Record<string, string> = {};

    // Look for common metadata patterns
    const authorEl = document.querySelector('[rel="author"], .author, [itemprop="author"]');
    if (authorEl) metadata.author = this.getUniqueSelector(authorEl);

    const dateEl = document.querySelector('time, .date, [itemprop="datePublished"]');
    if (dateEl) metadata.date = this.getUniqueSelector(dateEl);

    return metadata;
  }

  /**
   * Detect content signals on the page
   */
  private detectContentSignals(): ContentSignals {
    return {
      hasCheckboxes: document.querySelectorAll('[type="checkbox"]').length,
      hasCodeBlocks: document.querySelectorAll('pre, code').length,
      hasTables: document.querySelectorAll('table').length,
      hasImages: document.querySelectorAll('img').length,
      hasForms: document.querySelectorAll('form, input').length,
      hasHeadings: document.querySelectorAll('h1, h2, h3, h4').length,
      wordCount: (document.body.textContent || '').split(/\s+/).length,
      hasDatePickers: document.querySelectorAll('[type="date"]').length,
    };
  }

  /**
   * Generate extraction rules based on DOM structure and content signals
   */
  private generateExtractionRules(structure: DOMStructure, signals: ContentSignals): ExtractionRule[] {
    const rules: ExtractionRule[] = [];

    // Always extract title
    rules.push({
      selector: structure.titleSelector,
      attribute: 'textContent',
      label: 'pageTitle',
      confidence: 0.9,
    });

    // Extract main content (first 500 chars for classification)
    rules.push({
      selector: structure.contentSelector,
      attribute: 'textContent',
      label: 'mainContent',
      confidence: 0.8,
    });

    // If has checkboxes, likely a todo list
    if (signals.hasCheckboxes > 3) {
      rules.push({
        selector: '[type="checkbox"]',
        attribute: 'checked',
        label: 'todoItems',
        confidence: 0.85,
      });
    }

    // If has code blocks, likely documentation/code
    if (signals.hasCodeBlocks > 2) {
      rules.push({
        selector: 'pre, code',
        attribute: 'textContent',
        label: 'codeSnippets',
        confidence: 0.9,
      });
    }

    // If has lots of headings, likely structured content
    if (signals.hasHeadings > 5) {
      rules.push({
        selector: 'h1, h2, h3',
        attribute: 'textContent',
        label: 'outline',
        confidence: 0.8,
      });
    }

    return rules;
  }

  /**
   * Generate a unique CSS selector for an element
   */
  private getUniqueSelector(element: Element): string {
    if (element.id) return `#${element.id}`;

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.className) {
        const classes = current.className.split(' ').filter(Boolean);
        if (classes.length > 0) {
          selector += `.${classes[0]}`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Normalize URL (remove query params and hash)
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Check if a subpath should be profiled (3+ visits)
   */
  async shouldProfile(url: string): Promise<boolean> {
    const urlPath = this.normalizeUrl(url);
    let subpath = this.subpathCache.get(urlPath);

    if (!subpath) {
      // First time seeing this path in current session
      subpath = {
        urlPath,
        visitCount: 1,
        shouldProfile: false,
        lastProfiled: null,
      };
      this.subpathCache.set(urlPath, subpath);
      return false;
    }

    // Increment visit count
    subpath.visitCount++;

    // Profile if visited 3+ times
    return subpath.visitCount >= 3;
  }

  /**
   * Extract context using learned profile
   */
  extractUsingProfile(profile: PageProfile): DocumentContext {
    const extracted: Record<string, any> = {
      urlPattern: profile.urlPattern,
      visitCount: profile.visitCount,
      platform: this.detectPlatform(window.location.href),
      lastUpdated: Date.now(),
    };

    // Apply each learned extraction rule
    for (const rule of profile.extractionRules) {
      try {
        const elements = document.querySelectorAll(rule.selector);

        if (elements.length === 0) continue;

        if (rule.label === 'pageTitle' && elements.length === 1) {
          extracted[rule.label] = elements[0]?.textContent?.trim();
        } else if (rule.label === 'mainContent') {
          const text = elements[0]?.textContent?.trim() || '';
          extracted[rule.label] = text.substring(0, 500); // First 500 chars
          extracted['contentCategory'] = this.classifyContent(text, profile.contentSignals);
        } else {
          // Multiple elements - collect all
          extracted[rule.label] = Array.from(elements).map(el => {
            if (rule.attribute === 'textContent') {
              return el.textContent?.trim();
            } else if (rule.attribute === 'checked') {
              return (el as HTMLInputElement).checked;
            } else {
              return el.getAttribute(rule.attribute);
            }
          });
        }
      } catch (error) {
        console.warn(`[PageProfiler] Failed to extract ${rule.label}:`, error);
      }
    }

    return extracted;
  }

  /**
   * Classify content based on text and signals
   */
  private classifyContent(text: string, signals: ContentSignals): string {
    const lower = text.toLowerCase();

    // Smart classification based on signals + content
    if (signals.hasCheckboxes > 3 && /todo|task|due|deadline/i.test(text)) {
      return 'todo_list';
    }

    if (signals.hasCodeBlocks > 5 || /function|class|import|const|let/i.test(text)) {
      return 'code_documentation';
    }

    if (/essay|thesis|abstract|introduction|conclusion|references/i.test(text)) {
      return 'academic_writing';
    }

    if (/meeting|agenda|attendees|action items|minutes/i.test(text)) {
      return 'meeting_notes';
    }

    if (signals.hasHeadings > 5 && text.length > 1000) {
      return 'long_form_document';
    }

    return 'general_content';
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): string {
    if (url.includes('docs.google.com')) return 'google_docs';
    if (url.includes('notion.so')) return 'notion';
    if (url.includes('github.com')) return 'github';
    if (url.includes('canvas.illinois.edu')) return 'canvas_lms';
    if (url.includes('linkedin.com')) return 'linkedin';
    return 'web';
  }
}

