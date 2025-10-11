/**
 * Content Script
 * 
 * Injected into all pages to capture user activity
 * Runs in isolated context with access to page DOM
 */

// Log to both extension console and page console
console.log('[Content] Script loaded on:', window.location.href);
window.postMessage({ type: 'EXTENSION_LOG', message: `[Content] Script loaded on: ${window.location.href}` }, '*');

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
function captureEvent(eventData: any) {
  if (!isEnabled) return;
  
  // Generate unique ID for this event
  const eventId = generateEventId(eventData.type);
  const timestamp = new Date().toISOString();
  
  // Get context before adding current event
  const context = getEventContext();
  
  const event = {
    ...eventData,
    id: eventId,
    timestamp,
    url: window.location.href,
    title: document.title,
    context, // T13: Include 3-5 preceding event IDs
  };
  
  // Add current event to context for next event
  addToContext(eventId, eventData.type, timestamp);
  
  // Log event capture to page console
  const eventMsg = `[Content] Event captured: ${eventData.type} on ${eventData.tagName || 'element'} (context: ${context.length} events)`;
  console.log(eventMsg);
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

