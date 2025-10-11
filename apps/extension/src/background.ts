/**
 * Background Service Worker (MV3)
 * 
 * Handles:
 * - Extension lifecycle
 * - Message passing between content scripts and popup
 * - Storage management
 * - Tab tracking
 * - Event upload to server
 */

// Import offline queue functions
import {
  enqueueEvents,
  getEventsToRetry,
  dequeueEvents,
  scheduleRetry,
  getQueueStats,
} from './offline-queue';

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
 * Estimate payload size in bytes (rough approximation)
 * T15: Helps prevent 413 errors by splitting large batches proactively
 */
function estimatePayloadSize(events: any[]): number {
  // Rough estimate: JSON.stringify length + some overhead
  return JSON.stringify({ events }).length;
}

/**
 * Upload event batch to server
 * T14: Uses IndexedDB for persistent offline queue with exponential backoff
 * T15: Handles 413 errors by splitting batches, validates batch size
 */
async function uploadEventBatch() {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    // Check session validity
    const { session } = await chrome.storage.local.get(['session']);
    if (!session?.access_token) {
      console.log('[Background] No session found, queueing events offline');
      // T14: Store in IndexedDB for persistent offline queue
      await enqueueEvents(events);
      return;
    }

    // Check if token is expired
    const tokenExpiry = session.expires_at * 1000;
    const now = Date.now();
    if (now >= tokenExpiry) {
      console.log('[Background] Token expired, queueing events offline');
      await chrome.storage.local.remove(['session']);
      // T14: Store in IndexedDB for persistent offline queue
      await enqueueEvents(events);
      return;
    }

    // T15: Validate batch size (API limit is 100 events)
    if (events.length > 100) {
      console.warn(`[Background] Batch too large (${events.length} events), splitting...`);
      // Split into smaller batches and upload separately
      await uploadBatchWithSplit(events, session);
      return;
    }

    // Transform events to match API schema
    const transformedEvents = events.map(event => ({
      device_id: 'extension-device', // TODO: Generate unique device ID
      ts: event.timestamp || new Date().toISOString(),
      type: event.type,
      url: event.url,
      title: event.title || '',
      dom_path: event.domPath || event.element || '',
      text: event.text || '',
      meta: {
        // Basic event metadata
        tagName: event.tagName,
        eventId: event.id, // Store event ID in meta
        className: event.className,
        attributes: event.attributes,
        position: event.position,
        action: event.action,
        method: event.method,
        fieldCount: event.fieldCount,
        fields: event.fields,
        referrer: event.referrer,
        dwellMs: event.dwellMs,
        // Friction detection metadata (T11.1)
        frictionType: event.frictionType,
        velocity: event.velocity,
        scrollDelta: event.scrollDelta,
        previousUrl: event.previousUrl,
        formId: event.formId,
        timeSpent: event.timeSpent,
        loadTime: event.loadTime,
        dns: event.dns,
        tcp: event.tcp,
        request: event.request,
        render: event.render,
        clickCount: event.clickCount,
        errorType: event.errorType,
      },
      dwell_ms: event.dwellMs,
      // T13: Include context array (3-5 preceding event IDs)
      context_events: event.context || [],
    }));

    const response = await fetch('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ events: transformedEvents }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Background] Uploaded ${result.inserted} events successfully`);
    } else if (response.status === 413) {
      // T15: Payload too large - split batch and retry
      console.warn('[Background] 413 Payload Too Large - splitting batch');
      await uploadBatchWithSplit(events, session);
    } else {
      console.error('[Background] Upload failed:', response.status, response.statusText);
      // T14: Queue for retry with exponential backoff
      await enqueueEvents(events);
    }
  } catch (error) {
    console.error('[Background] Upload error (likely offline):', error);
    // T14: Queue for retry with exponential backoff
    await enqueueEvents(events);
  }
}

/**
 * Upload batch with automatic splitting if too large
 * T15: Handles 413 errors by splitting into smaller batches
 */
async function uploadBatchWithSplit(events: any[], session: any, maxBatchSize: number = 50) {
  if (events.length === 0) return;

  // If batch is small enough, try to upload directly
  if (events.length <= maxBatchSize) {
    // Transform and upload
    const transformedEvents = events.map(event => ({
      device_id: 'extension-device',
      ts: event.timestamp || new Date().toISOString(),
      type: event.type,
      url: event.url,
      title: event.title || '',
      dom_path: event.domPath || event.element || '',
      text: event.text || '',
      meta: {
        tagName: event.tagName,
        eventId: event.id,
        className: event.className,
        attributes: event.attributes,
        position: event.position,
        action: event.action,
        method: event.method,
        fieldCount: event.fieldCount,
        fields: event.fields,
        referrer: event.referrer,
        dwellMs: event.dwellMs,
        frictionType: event.frictionType,
        velocity: event.velocity,
        scrollDelta: event.scrollDelta,
        previousUrl: event.previousUrl,
        formId: event.formId,
        timeSpent: event.timeSpent,
        loadTime: event.loadTime,
        dns: event.dns,
        tcp: event.tcp,
        request: event.request,
        render: event.render,
        clickCount: event.clickCount,
        errorType: event.errorType,
      },
      dwell_ms: event.dwellMs,
      context_events: event.context || [],
    }));

    try {
      const response = await fetch('http://localhost:3000/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ events: transformedEvents }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`[Background] Split batch uploaded: ${result.inserted} events`);
      } else if (response.status === 413 && maxBatchSize > 10) {
        // Still too large, split further
        console.warn(`[Background] Still 413 with ${events.length} events, splitting smaller (max: ${maxBatchSize / 2})`);
        await uploadBatchWithSplit(events, session, Math.floor(maxBatchSize / 2));
      } else {
        console.error('[Background] Split batch upload failed:', response.status);
        await enqueueEvents(events);
      }
    } catch (error) {
      console.error('[Background] Split batch error:', error);
      await enqueueEvents(events);
    }
  } else {
    // Split into chunks and upload recursively
    console.log(`[Background] Splitting ${events.length} events into batches of ${maxBatchSize}`);
    for (let i = 0; i < events.length; i += maxBatchSize) {
      const chunk = events.slice(i, i + maxBatchSize);
      await uploadBatchWithSplit(chunk, session, maxBatchSize);
      // Small delay between chunks to avoid overwhelming server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Retry stored events from IndexedDB queue
 * T14: Implements exponential backoff for failed uploads
 */
async function retryStoredEvents() {
  try {
    // Get queue stats
    const stats = await getQueueStats();
    if (stats.pending === 0) return;

    console.log(`[Background] Retrying ${stats.pending} pending events (${stats.total} total in queue)`);
    
    // Get events ready for retry (respects exponential backoff timing)
    const queuedEvents = await getEventsToRetry(50); // Batch of 50
    if (queuedEvents.length === 0) return;

    // Check session validity
    const { session } = await chrome.storage.local.get(['session']);
    if (!session?.access_token) {
      console.log('[Background] No session for retry, will try again later');
      return;
    }

    // Extract event IDs and events
    const eventIds = queuedEvents.map(qe => qe.id);
    const events = queuedEvents.map(qe => qe.event);

    // Transform events to match API schema
    const transformedEvents = events.map(event => ({
      device_id: 'extension-device',
      ts: event.timestamp || new Date().toISOString(),
      type: event.type,
      url: event.url,
      title: event.title || '',
      dom_path: event.domPath || event.element || '',
      text: event.text || '',
      meta: {
        tagName: event.tagName,
        eventId: event.id,
        className: event.className,
        attributes: event.attributes,
        position: event.position,
        action: event.action,
        method: event.method,
        fieldCount: event.fieldCount,
        fields: event.fields,
        referrer: event.referrer,
        dwellMs: event.dwellMs,
        frictionType: event.frictionType,
        velocity: event.velocity,
        scrollDelta: event.scrollDelta,
        previousUrl: event.previousUrl,
        formId: event.formId,
        timeSpent: event.timeSpent,
        loadTime: event.loadTime,
        dns: event.dns,
        tcp: event.tcp,
        request: event.request,
        render: event.render,
        clickCount: event.clickCount,
        errorType: event.errorType,
      },
      dwell_ms: event.dwellMs,
      context_events: event.context || [],
    }));

    // Attempt upload
    const response = await fetch('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ events: transformedEvents }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Background] Retry successful: uploaded ${result.inserted} events`);
      // Remove successfully uploaded events from queue
      await dequeueEvents(eventIds);
    } else {
      console.error('[Background] Retry failed:', response.status, response.statusText);
      // Schedule retry with exponential backoff
      await scheduleRetry(eventIds);
    }
  } catch (error) {
    console.error('[Background] Retry error:', error);
    // Events remain in queue, will retry based on exponential backoff schedule
  }
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
