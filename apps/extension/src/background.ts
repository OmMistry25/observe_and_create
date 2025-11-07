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

// Import local database
import { getDB, type Event as DBEvent } from '@observe-create/storage';

console.log('[Background] Service worker started');

// Initialize local database
let localDB: Awaited<ReturnType<typeof getDB>> | null = null;

async function initLocalDB() {
  if (!localDB) {
    try {
      localDB = await getDB();
      console.log('[Background] ✅ Local database initialized');
    } catch (error) {
      console.error('[Background] ❌ Failed to initialize local database:', error);
    }
  }
  return localDB;
}

// Initialize on startup
initLocalDB();

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
      url: 'https://observeandcreate-ogvlapqej-ommistry25s-projects.vercel.app/dashboard',
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
      
    case 'PATTERN_DETECTED':
      // T18: Real-time pattern detected
      console.log('[Background] 🎯 Pattern detected in real-time:', message.pattern);
      console.log('[Background] Sequence:', message.pattern.sequence.map((e: any) => e.type).join(' → '));
      console.log('[Background] Occurrences:', message.pattern.occurrences);
      console.log('[Background] Confidence:', message.pattern.confidence);
      sendResponse({ acknowledged: true });
      break;
      
    case 'NUDGE_ACTION':
      // T18.1: User clicked on a nudge action
      console.log('[Background] Nudge action clicked:', message.nudge.type);
      // Could track this in analytics or sync to server
      sendResponse({ acknowledged: true });
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
 * Save event batch to local SQLite database
 * Replaces Supabase upload with 100% reliable local storage
 */
async function uploadEventBatch() {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    // Ensure database is initialized
    const db = await initLocalDB();
    if (!db) {
      console.error('[Background] Database not initialized, queueing for retry');
      await enqueueEvents(events);
      return;
    }

    // Get or create device ID
    const { device_id } = await chrome.storage.local.get(['device_id']);
    let deviceId = device_id;
    if (!deviceId) {
      deviceId = `ext-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
      await chrome.storage.local.set({ device_id: deviceId });
      console.log('[Background] Generated device ID:', deviceId);
    }

    console.log(`[Background] Saving ${events.length} events to local database...`);

    // Transform events to database schema
    const dbEvents: DBEvent[] = events.map(event => ({
      id: event.id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      client_timestamp: event.client_timestamp || Date.now(),
      local_timestamp: event.local_timestamp || new Date().toISOString(),
      timezone_offset: event.timezone_offset !== undefined ? event.timezone_offset : new Date().getTimezoneOffset(),
      type: event.type,
      url: event.url,
      domain: event.domain || new URL(event.url).hostname,
      url_path: event.url_path,
      title: event.title,
      semantic_context: event.semantic_context,
      document_context: event.document_context,
      device_id: deviceId,
      session_id: event.session_id,
    }));

    // Insert into database (using batch insert for performance)
    db.insertEventsBatch(dbEvents);

    // Save database to chrome.storage backup
    await db.saveToStorage();

    console.log(`[Background] ✅ Saved ${events.length} events successfully to local database`);
  } catch (error) {
    console.error('[Background] Local save error:', error);
    // Fallback to IndexedDB queue if local save fails
    await enqueueEvents(events);
  }
}

/**
 * Retry queued events from IndexedDB
 * Attempts to save them to local database
 */
async function retryQueuedEvents() {
  try {
    const queuedEvents = await getEventsToRetry(100);
    if (queuedEvents.length === 0) return;

    console.log(`[Background] Retrying ${queuedEvents.length} queued events`);
    
    // Extract event data from queued format
    const events = queuedEvents.map(qe => qe.event);
    
    // Add back to event queue for processing
    eventQueue.push(...events);
    
    // Try to save
    await uploadEventBatch();
    
    // If successful, dequeue them
    await dequeueEvents(queuedEvents.map(qe => qe.id));
  } catch (error) {
    console.error('[Background] Error retrying queued events:', error);
  }
}


// Keep service worker alive
// Note: Service workers in MV3 can be terminated at any time
// Use chrome.alarms for periodic tasks
if (chrome.alarms) {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.create('saveEvents', { periodInMinutes: 0.5 }); // Every 30 seconds

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'keepAlive') {
      console.log('[Background] Keep-alive ping');
    } else if (alarm.name === 'saveEvents') {
      await uploadEventBatch(); // Actually saves to local DB now
      await retryQueuedEvents(); // Retry any failed saves from IndexedDB queue
    }
  });
} else {
  console.warn('[Background] chrome.alarms not available');
}

export {};
