/**
 * Content Script
 * 
 * Injected into all pages to capture user activity
 * Runs in isolated context with access to page DOM
 */

import { addEventAndDetect, getDetectedPatterns } from './patternDetector';
import { PageProfiler } from './pageProfiler';

// Initialize Page Profiler for smart DOM extraction
const pageProfiler = new PageProfiler();

// Log to both extension console and page console
console.log('[Content] Script loaded on:', window.location.href);
window.postMessage({ type: 'EXTENSION_LOG', message: `[Content] Script loaded on: ${window.location.href}` }, '*');

// T19.1: Ignored domains (localhost, development environments)
const IGNORED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
];

/**
 * Check if current domain should be ignored
 */
function shouldIgnoreCurrentDomain(): boolean {
  const hostname = window.location.hostname;
  const host = window.location.host; // includes port
  
  return IGNORED_DOMAINS.some(ignored => 
    hostname === ignored || 
    host.includes(ignored) ||
    hostname.includes(ignored)
  );
}

// Check if we should ignore this domain
const shouldIgnore = shouldIgnoreCurrentDomain();
if (shouldIgnore) {
  console.log('[Content] Ignoring domain:', window.location.host);
  // Still log to page but don't capture events
}

// Check if extension is enabled
let isEnabled = true;

// T13: Context Builder - Track recent events for context
interface EventContext {
  id: string;
  type: string;
  timestamp: string;
}

const recentEvents: EventContext[] = [];
const MAX_CONTEXT_SIZE = 5;

/**
 * Generate a simple event ID based on timestamp and type
 */
function generateEventId(type: string): string {
  return `${Date.now()}-${type}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add event to context and maintain FIFO buffer
 */
function addToContext(id: string, type: string, timestamp: string) {
  recentEvents.push({ id, type, timestamp });
  if (recentEvents.length > MAX_CONTEXT_SIZE) {
    recentEvents.shift(); // Remove oldest
  }
}

/**
 * Get 3-5 preceding events for context
 */
function getEventContext(): string[] {
  // Return IDs of last 3-5 events (excluding current)
  return recentEvents.slice(-5).map(e => e.id);
}

// ============================================================================
// LEVEL 1: SEMANTIC CONTEXT CAPTURE
// Enhanced context to understand "why" behind user actions
// ============================================================================

/**
 * Session start time for journey tracking
 */
const sessionStart = Date.now();

/**
 * Track previous pages for journey analysis
 */
const previousPages: string[] = [];
const MAX_PREVIOUS_PAGES = 3;

/**
 * Infer element purpose from its context and attributes
 */
function inferElementPurpose(el: HTMLElement): string {
  const text = (el.textContent || '').toLowerCase().trim();
  const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
  const role = el.getAttribute('role') || '';
  const href = el.getAttribute('href') || '';
  const className = el.className || '';
  
  // Purchase/Transaction signals
  if (text.includes('buy') || text.includes('add to cart') || 
      text.includes('checkout') || text.includes('purchase') ||
      ariaLabel.includes('buy') || ariaLabel.includes('cart') ||
      className.includes('cart') || className.includes('buy')) {
    return 'purchase_intent';
  }
  
  // Navigation signals
  if (el.tagName === 'A' || role === 'link' || role === 'navigation') {
    if (href.includes('http') && !href.includes(window.location.host)) {
      return 'external_navigation';
    }
    return 'navigation';
  }
  
  // Submission/Action signals
  if ((el.tagName === 'BUTTON' || role === 'button') && 
      (text.includes('submit') || text.includes('send') || 
       text.includes('save') || text.includes('confirm') ||
       text.includes('apply'))) {
    return 'form_submission';
  }
  
  // Information seeking
  if (text.includes('learn more') || text.includes('read more') || 
      text.includes('details') || text.includes('view') ||
      text.includes('show') || text.includes('expand') ||
      ariaLabel.includes('more information')) {
    return 'information_seeking';
  }
  
  // Comparison/Research
  if (text.includes('compare') || text.includes('vs') || 
      text.includes('review') || text.includes('rating')) {
    return 'comparison_research';
  }
  
  // Social/Communication
  if (text.includes('share') || text.includes('comment') || 
      text.includes('reply') || text.includes('message') ||
      text.includes('post') || text.includes('tweet')) {
    return 'social_interaction';
  }
  
  // Download
  if (text.includes('download') || href.includes('.pdf') || 
      href.includes('.zip') || href.includes('.doc')) {
    return 'download';
  }
  
  return 'unknown';
}

/**
 * Get semantic label for element
 */
function getSemanticLabel(el: HTMLElement): string {
  return el.getAttribute('aria-label') || 
         el.getAttribute('title') || 
         el.getAttribute('alt') || 
         el.textContent?.trim().substring(0, 50) || 
         '';
}

/**
 * Get text near element for context
 */
function getNearbyText(el: HTMLElement, maxChars: number = 50): string {
  const parent = el.parentElement;
  if (!parent) return '';
  
  const siblingTexts: string[] = [];
  const siblings = Array.from(parent.children);
  
  for (const sibling of siblings) {
    if (sibling !== el && sibling.textContent) {
      siblingTexts.push(sibling.textContent.trim());
    }
  }
  
  return siblingTexts.join(' ').substring(0, maxChars);
}

/**
 * Estimate visual weight/importance of element
 */
function getVisualWeight(el: HTMLElement): number {
  const computedStyle = window.getComputedStyle(el);
  let weight = 0.5; // Base weight
  
  // Size matters
  const area = el.offsetWidth * el.offsetHeight;
  if (area > 10000) weight += 0.2; // Large element
  if (area < 1000) weight -= 0.2;  // Small element
  
  // Position matters (above fold is more important)
  const rect = el.getBoundingClientRect();
  if (rect.top < window.innerHeight) weight += 0.1;
  
  // Color/contrast
  const color = computedStyle.color;
  const bgColor = computedStyle.backgroundColor;
  if (color && bgColor && color !== bgColor) weight += 0.1;
  
  // Font weight/size
  const fontSize = parseInt(computedStyle.fontSize || '16');
  if (fontSize > 20) weight += 0.1;
  
  return Math.max(0, Math.min(1, weight)); // Clamp 0-1
}

/**
 * Determine which section of page element is in
 */
function getPageSection(el: HTMLElement): string {
  let current: HTMLElement | null = el;
  
  while (current && current !== document.body) {
    const tagName = current.tagName.toLowerCase();
    const role = current.getAttribute('role');
    
    if (tagName === 'header' || role === 'banner') return 'header';
    if (tagName === 'nav' || role === 'navigation') return 'nav';
    if (tagName === 'main' || role === 'main') return 'main';
    if (tagName === 'aside' || role === 'complementary') return 'sidebar';
    if (tagName === 'footer' || role === 'contentinfo') return 'footer';
    
    current = current.parentElement;
  }
  
  return 'body';
}

/**
 * Infer page type from URL and content
 */
function inferPageType(): string {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  const body = document.body.textContent?.toLowerCase() || '';
  
  // Ecommerce/Product
  if (url.includes('/product/') || url.includes('/item/') ||
      body.includes('add to cart') || body.includes('price:') ||
      document.querySelector('[itemprop="price"]')) {
    return 'product';
  }
  
  // Content/Article
  if (url.includes('/article/') || url.includes('/blog/') ||
      url.includes('/post/') || document.querySelector('article') ||
      title.includes('blog') || title.includes('article')) {
    return 'article';
  }
  
  // Search results
  if (url.includes('/search') || url.includes('?q=') || 
      url.includes('?query=') || url.includes('google.com/search')) {
    return 'search_results';
  }
  
  // Transaction/Checkout
  if (url.includes('/cart') || url.includes('/checkout') || 
      url.includes('/payment') || title.includes('checkout')) {
    return 'checkout';
  }
  
  // Dashboard/Portal
  if (url.includes('/dashboard') || url.includes('/home') || 
      url.includes('/portal') || url.includes('/account') ||
      title.includes('dashboard')) {
    return 'dashboard';
  }
  
  // Form/Application
  if (document.querySelectorAll('form').length > 0) {
    return 'form';
  }
  
  // Video/Media
  if (document.querySelector('video') || url.includes('youtube.com/watch') ||
      url.includes('vimeo.com') || url.includes('twitch.tv')) {
    return 'video';
  }
  
  // Documentation
  if (url.includes('/docs/') || url.includes('/documentation/') ||
      title.includes('documentation') || title.includes('api reference')) {
    return 'documentation';
  }
  
  // Social media
  if (url.includes('twitter.com') || url.includes('facebook.com') ||
      url.includes('linkedin.com') || url.includes('instagram.com')) {
    return 'social_media';
  }
  
  return 'general';
}

/**
 * Extract main heading
 */
function getMainHeading(): string {
  const h1 = document.querySelector('h1');
  return h1?.textContent?.trim().substring(0, 100) || '';
}

/**
 * Infer page category from URL patterns
 */
function inferPageCategory(): string {
  const url = window.location.href.toLowerCase();
  
  if (url.includes('github.com') || url.includes('gitlab.com')) return 'development';
  if (url.includes('stackoverflow.com') || url.includes('reddit.com')) return 'community';
  if (url.includes('youtube.com') || url.includes('netflix.com')) return 'entertainment';
  if (url.includes('gmail.com') || url.includes('outlook')) return 'email';
  if (url.includes('amazon.com') || url.includes('ebay.com')) return 'shopping';
  if (url.includes('linkedin.com')) return 'professional';
  if (url.includes('wikipedia.org')) return 'reference';
  if (url.includes('docs.') || url.includes('/documentation')) return 'documentation';
  
  return 'general';
}

/**
 * Get page description
 */
function getPageDescription(): string {
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    return metaDesc.getAttribute('content')?.substring(0, 200) || '';
  }
  
  // Fallback: first paragraph
  const firstP = document.querySelector('p');
  return firstP?.textContent?.trim().substring(0, 200) || '';
}

/**
 * Extract key entities (brands, products, topics)
 */
function extractKeyEntities(): string[] {
  const entities: Set<string> = new Set();
  
  // Extract from title
  const title = document.title;
  const titleWords = title.split(/\s+/).filter(w => w.length > 3 && /^[A-Z]/.test(w));
  titleWords.slice(0, 3).forEach(w => entities.add(w));
  
  // Extract from main heading
  const h1 = document.querySelector('h1')?.textContent || '';
  const h1Words = h1.split(/\s+/).filter(w => w.length > 3 && /^[A-Z]/.test(w));
  h1Words.slice(0, 2).forEach(w => entities.add(w));
  
  return Array.from(entities).slice(0, 5);
}

/**
 * Calculate scroll depth
 */
function getScrollDepth(): number {
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;
  const scrollTop = window.scrollY;
  
  const depth = (scrollTop + windowHeight) / documentHeight;
  return Math.round(depth * 100);
}

/**
 * Count interactions in current session
 */
let interactionCount = 0;
function incrementInteractionCount() {
  interactionCount++;
}
function getInteractionCount(): number {
  return interactionCount;
}

/**
 * Track page in previous pages history
 */
function trackPageInHistory() {
  const pageTitle = document.title;
  if (pageTitle && !previousPages.includes(pageTitle)) {
    previousPages.push(pageTitle);
    if (previousPages.length > MAX_PREVIOUS_PAGES) {
      previousPages.shift();
    }
  }
}

// Track current page on load
trackPageInHistory();

/**
 * Analyze content signals on page
 */
function analyzeContentSignals() {
  const text = document.body.textContent?.toLowerCase() || '';
  
  return {
    hasVideo: !!document.querySelector('video'),
    hasImages: document.querySelectorAll('img').length > 3,
    hasForms: document.querySelectorAll('form').length > 0,
    hasPricing: /\$\d+|€\d+|£\d+|price:/i.test(text),
    hasReviews: /\d+\s*star|rating|review/i.test(text),
    hasComparison: /\bvs\b|compare|comparison/i.test(text),
  };
}

/**
 * Capture enhanced semantic context for event
 */
function captureSemanticContext(element?: HTMLElement) {
  const now = new Date();
  
  return {
    // Element-level semantics (if element provided)
    ...(element && {
      purpose: inferElementPurpose(element),
      semanticRole: element.getAttribute('aria-label') || element.getAttribute('role') || '',
      elementContext: {
        text: element.textContent?.trim().substring(0, 100) || '',
        nearbyText: getNearbyText(element, 50),
        visualWeight: getVisualWeight(element),
        pageSection: getPageSection(element),
      },
    }),
    
    // Page-level semantics
    pageMetadata: {
      type: inferPageType(),
      mainHeading: getMainHeading(),
      category: inferPageCategory(),
      description: getPageDescription(),
      keyEntities: extractKeyEntities(),
    },
    
    // Journey-level signals
    journeyState: {
      sessionDuration: Math.round((Date.now() - sessionStart) / 1000), // seconds
      scrollDepth: getScrollDepth(),
      interactionDepth: getInteractionCount(),
      previousPages: [...previousPages],
    },
    
    // Temporal context
    temporal: {
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
      isWorkHours: now.getHours() >= 9 && now.getHours() <= 17 && now.getDay() >= 1 && now.getDay() <= 5,
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
    },
    
    // Content analysis
    contentSignals: analyzeContentSignals(),
  };
}

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn('[Content] Extension context invalidated:', chrome.runtime.lastError.message);
    return;
  }
  if (response) {
    isEnabled = response.enabled;
    const statusMsg = `[Content] Extension status: ${isEnabled ? 'enabled' : 'disabled'}`;
    console.log(statusMsg);
    window.postMessage({ type: 'EXTENSION_LOG', message: statusMsg }, '*');
  }
});

/**
 * Send event to background script
 */
async function captureEvent(eventData: any) {
  if (!isEnabled) return;
  if (shouldIgnore) return; // T19.1: Don't capture events from ignored domains
  
  // Increment interaction count for journey tracking
  incrementInteractionCount();
  
  // Generate unique ID for this event
  const eventId = generateEventId(eventData.type);
  const timestamp = new Date().toISOString();
  
  // Get context before adding current event
  const context = getEventContext();
  
  // LEVEL 1: Capture enhanced semantic context
  const semanticContext = captureSemanticContext(eventData.element);
  
  // Extract domain from URL for efficient server-side filtering
  const domain = window.location.hostname.replace('www.', '');
  
  // Extract URL path (normalized) for frequency tracking
  const urlPath = pageProfiler['normalizeUrl'](window.location.href);
  
  // Issue #1: Smart DOM extraction - only extract if page is visited frequently
  let documentContext = null;
  const shouldExtractDOM = await pageProfiler.shouldProfile(window.location.href);
  
  if (shouldExtractDOM) {
    try {
      const profile = await pageProfiler.getOrCreateProfile(window.location.href);
      documentContext = pageProfiler.extractUsingProfile(profile);
      console.log(`[PageProfiler] ✅ Extracted DOM context for frequent page (${profile.visitCount} visits)`);
    } catch (error) {
      console.warn('[PageProfiler] Failed to extract DOM context:', error);
    }
  } else {
    console.log(`[PageProfiler] ⏭️  Skipping DOM extraction for infrequent page`);
  }
  
  const event = {
    ...eventData,
    id: eventId,
    timestamp,
    url: window.location.href,
    url_path: urlPath, // Issue #1: Track normalized URL path
    title: document.title,
    domain, // Add domain for efficient server-side queries
    context, // T13: Include 3-5 preceding event IDs
    semantic_context: semanticContext, // LEVEL 1: Rich semantic context
    document_context: documentContext, // Issue #1: Smart-extracted DOM context (only for frequent pages)
  };
  
  // Add current event to context for next event
  addToContext(eventId, eventData.type, timestamp);
  
  // T18: Real-time pattern detection
  const detectedPattern = addEventAndDetect(event);
  if (detectedPattern) {
    const patternMsg = `[PatternDetector] 🎯 Pattern detected! ${detectedPattern.sequence.map(e => e.type).join(' → ')} (${detectedPattern.occurrences}x, confidence: ${detectedPattern.confidence})`;
    console.log(patternMsg);
    window.postMessage({ type: 'EXTENSION_LOG', message: patternMsg }, '*');
    
    // Notify background about detected pattern
    chrome.runtime.sendMessage({
      type: 'PATTERN_DETECTED',
      pattern: detectedPattern,
    });
  }
  
  // Log event capture to page console with semantic details
  const semanticDetails = semanticContext.purpose 
    ? ` | Purpose: ${semanticContext.purpose} | PageType: ${semanticContext.pageMetadata?.type || 'unknown'}`
    : '';
  const eventMsg = `[Content] Event captured: ${eventData.type} on ${eventData.tagName || 'element'} (context: ${context.length} events)${semanticDetails}`;
  console.log(eventMsg);
  console.log('[Content] Full semantic context:', semanticContext);
  window.postMessage({ type: 'EXTENSION_LOG', message: eventMsg }, '*');
  
  chrome.runtime.sendMessage({
    type: 'EVENT_CAPTURED',
    event,
  }, (response) => {
    if (chrome.runtime.lastError) {
      // Extension context invalidated - this is normal during development
      if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
        console.warn('[Content] Extension context invalidated - extension may have been reloaded');
      } else {
        console.error('[Content] Error sending event:', chrome.runtime.lastError);
      }
    }
  });
}

/**
 * Click tracking
 */
document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  
  // Get useful information about the click
  const clickData = {
    type: 'click',
    tagName: target.tagName,
    id: target.id || null,
    className: target.className || null,
    text: target.textContent?.trim().substring(0, 100) || null,
    domPath: getDomPath(target),
    attributes: getElementAttributes(target),
    position: {
      x: e.clientX,
      y: e.clientY,
    },
    timestamp: new Date().toISOString(),
    element: target, // Pass element for semantic context
  };
  
  captureEvent(clickData);
}, { passive: true });

/**
 * Form submission tracking
 */
document.addEventListener('submit', (e: Event) => {
  const form = e.target as HTMLFormElement;
  
  const formData = {
    type: 'form',
    action: form.action || null,
    method: form.method || 'get',
    fieldCount: form.elements.length,
    fields: getFormFields(form),
    timestamp: new Date().toISOString(),
  };
  
  captureEvent(formData);
}, { passive: true });

/**
 * Page visibility (dwell time tracking)
 */
let pageVisibleStart = Date.now();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const dwellMs = Date.now() - pageVisibleStart;
    captureEvent({
      type: 'blur',
      dwellMs,
    });
  } else {
    pageVisibleStart = Date.now();
    captureEvent({
      type: 'focus',
    });
  }
});

/**
 * Page unload (final dwell time)
 */
window.addEventListener('beforeunload', () => {
  const dwellMs = Date.now() - pageVisibleStart;
  captureEvent({
    type: 'nav',
    dwellMs,
  });
});

/**
 * Get DOM path for an element
 */
function getDomPath(element: HTMLElement): string {
  const path: string[] = [];
  let current: HTMLElement | null = element;
  
  while (current && current !== document.body && path.length < 5) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector += `#${current.id}`;
    } else if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 2);
      if (classes.length > 0 && classes[0]) {
        selector += `.${classes.join('.')}`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

/**
 * Get element attributes
 */
function getElementAttributes(element: HTMLElement): Record<string, string> {
  const attributes: Record<string, string> = {};
  const importantAttrs = ['href', 'src', 'alt', 'title', 'data-testid', 'aria-label'];
  
  for (const attr of importantAttrs) {
    const value = element.getAttribute(attr);
    if (value) {
      attributes[attr] = value;
    }
  }
  
  return attributes;
}

/**
 * Get form field information
 */
function getFormFields(form: HTMLFormElement): any[] {
  const fields: any[] = [];
  
  for (let i = 0; i < form.elements.length; i++) {
    const element = form.elements[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    
    if (element.name || element.id) {
      fields.push({
        name: element.name || element.id,
        type: element.type || element.tagName.toLowerCase(),
        required: element.hasAttribute('required'),
        placeholder: element.getAttribute('placeholder') || null,
      });
    }
  }
  
  return fields;
}

/**
 * Search query detection
 * Looks for common search patterns in URLs
 */
if (window.location.search) {
  const params = new URLSearchParams(window.location.search);
  const searchKeys = ['q', 'query', 'search', 's'];
  
  for (const key of searchKeys) {
    const value = params.get(key);
    if (value) {
      captureEvent({
        type: 'search',
        query: value.substring(0, 200), // Limit length
      });
      break;
    }
  }
}

// Listen for session from web app
window.addEventListener('message', (event) => {
  if (event.data.type === 'SUPABASE_SESSION') {
    // Store session in extension storage
    chrome.storage.local.set({ session: event.data.session }, () => {
      console.log('[Content] Session received and stored');
      window.postMessage({ type: 'EXTENSION_LOG', message: '[Content] Session received and stored' }, '*');
    });
  }
});

/**
 * Friction Detection Sensors (T11.1)
 */

// 1. Scroll velocity tracking
let lastScrollTime = Date.now();
let lastScrollY = window.scrollY;
let rapidScrollCount = 0;

window.addEventListener('scroll', () => {
  const now = Date.now();
  const currentScrollY = window.scrollY;
  const timeDelta = now - lastScrollTime;
  const scrollDelta = Math.abs(currentScrollY - lastScrollY);
  
  if (timeDelta > 0) {
    const velocity = scrollDelta / timeDelta; // pixels per millisecond
    
    // Detect rapid scrolling (> 2 pixels per millisecond = frustration indicator)
    if (velocity > 2) {
      rapidScrollCount++;
      
      // Log friction after 3 rapid scrolls
      if (rapidScrollCount >= 3) {
        captureEvent({
          type: 'friction',
          frictionType: 'rapid_scroll',
          velocity: Math.round(velocity * 1000), // convert to pixels/second
          scrollDelta,
        });
        rapidScrollCount = 0; // Reset counter
      }
    }
  }
  
  lastScrollTime = now;
  lastScrollY = currentScrollY;
}, { passive: true });

// 2. Back button usage tracking
window.addEventListener('popstate', () => {
  captureEvent({
    type: 'friction',
    frictionType: 'back_button',
    previousUrl: document.referrer,
  });
});

// 3. Form abandonment detection
const formInteractions = new Map();

document.addEventListener('input', (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.form) {
    const formId = target.form.id || target.form.action || 'anonymous-form';
    formInteractions.set(formId, {
      form: target.form,
      startTime: Date.now(),
      fieldCount: target.form.elements.length,
    });
  }
}, { passive: true });

// Track form abandonment on page unload
window.addEventListener('beforeunload', () => {
  formInteractions.forEach((interaction, formId) => {
    // Form was interacted with but not submitted
    captureEvent({
      type: 'friction',
      frictionType: 'form_abandon',
      formId,
      timeSpent: Date.now() - interaction.startTime,
      fieldCount: interaction.fieldCount,
    });
  });
});

// Clear form from tracking when submitted
document.addEventListener('submit', (e: Event) => {
  const form = e.target as HTMLFormElement;
  const formId = form.id || form.action || 'anonymous-form';
  formInteractions.delete(formId);
});

// 4. Error detection - 404 and error pages
if (document.title.toLowerCase().includes('404') || 
    document.title.toLowerCase().includes('not found') ||
    document.title.toLowerCase().includes('error')) {
  captureEvent({
    type: 'error',
    errorType: 'page_error',
    title: document.title,
  });
}

// 5. Loading time tracking
window.addEventListener('load', () => {
  const perfData = performance.timing;
  const loadTime = perfData.loadEventEnd - perfData.navigationStart;
  
  // Flag slow loads (> 3 seconds)
  if (loadTime > 3000) {
    captureEvent({
      type: 'friction',
      frictionType: 'slow_load',
      loadTime,
      dns: perfData.domainLookupEnd - perfData.domainLookupStart,
      tcp: perfData.connectEnd - perfData.connectStart,
      request: perfData.responseEnd - perfData.requestStart,
      render: perfData.loadEventEnd - perfData.responseEnd,
    });
  }
});

// 6. Rage click detection
const clickTracker = new Map();

document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  const elementPath = getDomPath(target);
  
  const now = Date.now();
  const tracked = clickTracker.get(elementPath);
  
  if (tracked && now - tracked.lastClick < 1000) {
    // Multiple clicks within 1 second
    tracked.count++;
    tracked.lastClick = now;
    
    // Rage click detected (3+ clicks in short succession)
    if (tracked.count >= 3) {
      captureEvent({
        type: 'friction',
        frictionType: 'rage_click',
        element: elementPath,
        clickCount: tracked.count,
        tagName: target.tagName,
      });
      clickTracker.delete(elementPath); // Reset
    }
  } else {
    // New click or too much time passed
    clickTracker.set(elementPath, {
      count: 1,
      lastClick: now,
    });
  }
  
  // Clean up old entries (older than 2 seconds)
  clickTracker.forEach((value, key) => {
    if (now - value.lastClick > 2000) {
      clickTracker.delete(key);
    }
  });
});

// Initial page load event
captureEvent({
  type: 'nav',
  referrer: document.referrer || null,
});

export {};

