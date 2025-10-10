/**
 * Background Service Worker (MV3)
 * 
 * Handles:
 * - Extension lifecycle
 * - Message passing between content scripts and popup
 * - Storage management
 * - Tab tracking
 */

console.log('[Background] Service worker started');

// Extension installed/updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // First install - set default settings
    chrome.storage.local.set({
      enabled: true,
      domains: {},
      settings: {
        captureClicks: true,
        captureSearches: true,
        captureForms: true,
        captureNav: true,
        captureDwell: true,
      },
    });
    
    // Open onboarding page
    chrome.tabs.create({
      url: 'https://localhost:3000/dashboard',
    });
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type, sender);
  
  switch (message.type) {
    case 'PING':
      sendResponse({ status: 'ok' });
      break;
      
    case 'GET_STATUS':
      chrome.storage.local.get(['enabled'], (result) => {
        sendResponse({ enabled: result.enabled ?? true });
      });
      return true; // Keep channel open for async response
      
    case 'SET_STATUS':
      chrome.storage.local.set({ enabled: message.enabled }, () => {
        sendResponse({ success: true });
      });
      return true;
      
    case 'EVENT_CAPTURED':
      // Event captured by content script
      console.log('[Background] Event captured:', message.event);
      queueEventForUpload(message.event);
      sendResponse({ received: true });
      break;
      
    default:
      console.warn('[Background] Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
  }
});

// Track active tab for dwell time
let activeTabId: number | null = null;
let activeTabStartTime: number | null = null;

chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('[Background] Tab activated:', activeInfo.tabId);
  
  // Record dwell time for previous tab
  if (activeTabId !== null && activeTabStartTime !== null) {
    const dwellTime = Date.now() - activeTabStartTime;
    console.log('[Background] Previous tab dwell:', dwellTime, 'ms');
    // TODO: Send dwell event
  }
  
  activeTabId = activeInfo.tabId;
  activeTabStartTime = Date.now();
});

// Tab updated (URL change, load complete)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('[Background] Tab updated:', tab.url);
  }
});

// Window focus changed
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log('[Background] Lost focus');
  } else {
    console.log('[Background] Window focused:', windowId);
  }
});

// Event queue for batching uploads
let eventQueue: any[] = [];
const BATCH_SIZE = 10;
const UPLOAD_INTERVAL = 30000; // 30 seconds

/**
 * Queue event for upload to server
 */
async function queueEventForUpload(event: any) {
  // Check if user has given consent
  const { enabled } = await chrome.storage.local.get(['enabled']);
  if (!enabled) {
    console.log('[Background] Extension disabled, skipping event');
    return;
  }

  eventQueue.push(event);
  console.log(`[Background] Queued event, queue size: ${eventQueue.length}`);

  // Upload if batch is full
  if (eventQueue.length >= BATCH_SIZE) {
    await uploadEventBatch();
  }
}

/**
 * Upload event batch to server
 */
async function uploadEventBatch() {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    // Get user session
    const { session } = await chrome.storage.local.get(['session']);
    if (!session?.access_token) {
      console.log('[Background] No session found, storing events for later');
      // Store events for later upload
      const { storedEvents = [] } = await chrome.storage.local.get(['storedEvents']);
      await chrome.storage.local.set({ storedEvents: [...storedEvents, ...events] });
      return;
    }

    const response = await fetch('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ events }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Background] Uploaded ${result.inserted} events successfully`);
    } else {
      console.error('[Background] Upload failed:', response.status, response.statusText);
      // Store failed events for retry
      const { storedEvents = [] } = await chrome.storage.local.get(['storedEvents']);
      await chrome.storage.local.set({ storedEvents: [...storedEvents, ...events] });
    }
  } catch (error) {
    console.error('[Background] Upload error:', error);
    // Store failed events for retry
    const { storedEvents = [] } = await chrome.storage.local.get(['storedEvents']);
    await chrome.storage.local.set({ storedEvents: [...storedEvents, ...events] });
  }
}

/**
 * Retry stored events
 */
async function retryStoredEvents() {
  const { storedEvents = [] } = await chrome.storage.local.get(['storedEvents']);
  if (storedEvents.length === 0) return;

  console.log(`[Background] Retrying ${storedEvents.length} stored events`);
  
  // Move stored events to queue
  eventQueue = [...storedEvents];
  await chrome.storage.local.set({ storedEvents: [] });
  
  // Upload them
  await uploadEventBatch();
}

// Keep service worker alive
// Note: Service workers in MV3 can be terminated at any time
// Use chrome.alarms for periodic tasks
if (chrome.alarms) {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.create('uploadEvents', { periodInMinutes: 0.5 }); // Every 30 seconds

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'keepAlive') {
      console.log('[Background] Keep-alive ping');
    } else if (alarm.name === 'uploadEvents') {
      await uploadEventBatch();
      await retryStoredEvents();
    }
  });
} else {
  console.warn('[Background] chrome.alarms not available');
}

export {};
