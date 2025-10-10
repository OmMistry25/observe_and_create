/**
 * Content Script
 * 
 * Injected into all pages to capture user activity
 * Runs in isolated context with access to page DOM
 */

console.log('[Content] Script loaded on:', window.location.href);

// Check if extension is enabled
let isEnabled = true;

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn('[Content] Extension context invalidated:', chrome.runtime.lastError.message);
    return;
  }
  if (response) {
    isEnabled = response.enabled;
    console.log('[Content] Extension status:', isEnabled ? 'enabled' : 'disabled');
  }
});

/**
 * Send event to background script
 */
function captureEvent(eventData: any) {
  if (!isEnabled) return;
  
  const event = {
    ...eventData,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
  };
  
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

// Initial page load event
captureEvent({
  type: 'nav',
  referrer: document.referrer || null,
});

export {};

