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

// Import export utilities
import { 
  downloadDataAsJSON, 
  downloadEventsAsCSV, 
  downloadPatternsAsJSON,
  getExportSummary,
  createAutoBackup
} from './export';

// Import journal generator
import {
  generateDailyJournal,
  saveJournalEntry,
  getJournalEntry,
  getAllJournalEntries,
  type JournalEntry,
} from './journalGenerator';

console.log('[Background] Service worker started');

// Offscreen document management for local LLM
let offscreenDocumentCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) {
    return true;
  }

  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as any],
    });

    if (existingContexts.length > 0) {
      offscreenDocumentCreated = true;
      return true;
    }

    // Create offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS' as any], // For Web Workers/WASM
      justification: 'Running local LLM (Transformers.js) for privacy-preserving intent classification',
    });

    offscreenDocumentCreated = true;
    console.log('[Background] ✅ Offscreen document created for LLM processing');
    return true;
  } catch (error) {
    console.warn('[Background] ⚠️ Failed to create offscreen document:', error);
    return false;
  }
}

/**
 * Send message specifically to offscreen document
 * Note: chrome.runtime.sendMessage broadcasts to all listeners,
 * but offscreen documents will filter for their specific message types
 */
async function sendToOffscreen(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function closeOffscreenDocument() {
  if (!offscreenDocumentCreated) {
    return;
  }

  try {
    await chrome.offscreen.closeDocument();
    offscreenDocumentCreated = false;
    console.log('[Background] Offscreen document closed');
  } catch (error) {
    console.warn('[Background] Failed to close offscreen document:', error);
  }
}

// Initialize local database (optional - falls back to IndexedDB if fails)
let localDB: Awaited<ReturnType<typeof getDB>> | null = null;
let dbInitFailed = false;

async function initLocalDB() {
  if (dbInitFailed) {
    // Already tried and failed, don't retry
    return null;
  }
  
  if (!localDB) {
    try {
      localDB = await getDB();
      console.log('[Background] ✅ Local SQLite database initialized');
      return localDB;
    } catch (error) {
      // Database initialization failed - this is OK, we'll use IndexedDB instead
      console.warn('[Background] SQLite unavailable, using IndexedDB fallback');
      dbInitFailed = true;
      return null;
    }
  }
  return localDB;
}

// Try to initialize on startup (non-blocking, optional)
initLocalDB().catch(() => {
  console.log('[Background] Using IndexedDB for event storage');
});

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
  
  // Ignore messages meant for offscreen document (they'll be handled there)
  const offscreenMessages = ['EXPORT_ALL_DATA', 'EXPORT_EVENTS_DATA', 'EXPORT_JOURNALS_DATA', 
                              'CLASSIFY_EVENTS_BATCH', 'GENERATE_INSIGHTS', 'INIT_MODEL', 'GET_LLM_STATUS'];
  if (offscreenMessages.includes(message.type)) {
    // Don't handle these in background, they're for offscreen document
    return false;
  }
  
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
      
      // Local LLM disabled in service workers (Chrome MV3 limitation)
      // Events are stored with pattern detection only
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
      
    case 'TEMPORAL_PATTERN_DETECTED':
      // Temporal pattern detected (hourly, daily, weekly, etc.)
      console.log('[Background] ⏰ Temporal pattern detected:', message.pattern.type);
      console.log('[Background] Description:', message.pattern.description);
      console.log('[Background] Confidence:', message.pattern.confidence);
      
      // Pattern embedding disabled (local LLM not available in service workers)
      
      sendResponse({ acknowledged: true });
      break;
      
    case 'NUDGE_ACTION':
      // T18.1: User clicked on a nudge action
      console.log('[Background] Nudge action clicked:', message.nudge.type);
      // Could track this in analytics or sync to server
      sendResponse({ acknowledged: true });
      break;
      
    case 'EXPORT_DATA':
      // Export all data as JSON
      // Service workers can't access IndexedDB, so we forward to offscreen document
      (async () => {
        try {
          console.log('[Background] Starting export process...');
          await ensureOffscreenDocument();
          
          // Forward request to offscreen document which has IndexedDB access
          console.log('[Background] Requesting data from offscreen document...');
          const response = await sendToOffscreen({ type: 'EXPORT_ALL_DATA' });
          
          if (response && response.success) {
            console.log('[Background] Data received, triggering download...');
            // Convert to data URL (URL.createObjectURL not available in service workers)
            const jsonString = JSON.stringify(response.data, null, 2);
            const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
            const dataUrl = `data:application/json;base64,${base64Data}`;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `observe-create-export-${timestamp}.json`;
            
            await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
            console.log('[Background] ✅ Export successful:', filename);
            sendResponse({ success: true });
          } else {
            console.error('[Background] Export failed:', response?.error || 'Unknown error');
            sendResponse({ success: false, error: response?.error || 'Failed to get data from offscreen' });
          }
        } catch (error: any) {
          console.error('[Background] Export failed:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Keep channel open for async response
      
    case 'EXPORT_EVENTS_CSV':
      // Export events as CSV
      (async () => {
        try {
          await ensureOffscreenDocument();
          const response = await sendToOffscreen({ type: 'EXPORT_EVENTS_DATA' });
          if (response && response.success) {
            // Convert to CSV
            const events = response.events;
            const headers = ['id', 'timestamp', 'type', 'url', 'domain', 'title', 'client_timestamp', 'timezone_offset', 'device_id', 'session_id'];
            const rows = events.map((event: any) => [
              event.id || '', event.local_timestamp || '', event.type || '', event.url || '',
              event.domain || '', event.title || '', event.client_timestamp || '',
              event.timezone_offset || '', event.device_id || '', event.session_id || ''
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            
            // Convert to data URL
            const base64Data = btoa(unescape(encodeURIComponent(csv)));
            const dataUrl = `data:text/csv;base64,${base64Data}`;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `observe-create-events-${timestamp}.csv`;
            
            await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: response.error });
          }
        } catch (error) {
          console.error('[Background] CSV export failed:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    case 'EXPORT_PATTERNS':
      // Export patterns as JSON
      (async () => {
        try {
          await ensureOffscreenDocument();
          const response = await sendToOffscreen({ type: 'EXPORT_JOURNALS_DATA' });
          if (response && response.success) {
            const journals = response.journals;
            const patterns: any[] = [];
            
            for (const journal of journals) {
              if (journal.pattern_summary?.frequency_patterns) {
                patterns.push(...journal.pattern_summary.frequency_patterns.map((p: any) => ({
                  ...p, date: journal.date, type: 'frequency'
                })));
              }
              if (journal.pattern_summary?.temporal_patterns) {
                patterns.push(...journal.pattern_summary.temporal_patterns.map((p: any) => ({
                  ...p, date: journal.date, type: 'temporal'
                })));
              }
            }
            
            const data = {
              exportDate: new Date().toISOString(),
              version: '1.0',
              totalPatterns: patterns.length,
              patterns
            };
            
            // Convert to data URL
            const jsonString = JSON.stringify(data, null, 2);
            const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
            const dataUrl = `data:application/json;base64,${base64Data}`;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `observe-create-patterns-${timestamp}.json`;
            
            await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: response.error });
          }
        } catch (error) {
          console.error('[Background] Patterns export failed:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    case 'GET_EXPORT_SUMMARY':
      // Get export summary
      getExportSummary()
        .then(summary => sendResponse({ success: true, summary }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'GET_DB_STATS':
      // Get database statistics
      initLocalDB()
        .then(db => {
          if (db) {
            const stats = db.getStats();
            sendResponse({ success: true, stats });
          } else {
            sendResponse({ success: false, error: 'Database not initialized' });
          }
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'GENERATE_JOURNAL':
      // Manually trigger journal generation
      (async () => {
        const journal = await generateJournal(message.date, { useLLM: message.useLLM ?? true });
        if (journal) {
          sendResponse({ success: true, journal });
        } else {
          sendResponse({ success: false, error: 'Failed to generate journal' });
        }
      })();
      return true;
      
    case 'GET_JOURNAL':
      // Get journal entry for a specific date
      (async () => {
        const journal = await getJournalEntry(message.date);
        sendResponse({ success: true, journal });
      })();
      return true;
      
    case 'GET_ALL_JOURNALS':
      // Get all journal entries
      (async () => {
        const journals = await getAllJournalEntries();
        sendResponse({ success: true, journals });
      })();
      return true;
      
    case 'GET_JOURNAL_CONFIG':
      // Get journal configuration
      (async () => {
        const config = await getJournalConfig();
        sendResponse({ success: true, config });
      })();
      return true;
      
    case 'UPDATE_JOURNAL_CONFIG':
      // Update journal configuration
      (async () => {
        await updateJournalConfig(message.config);
        sendResponse({ success: true });
      })();
      return true;
      
    case 'CLASSIFY_EVENTS_BATCH':
    case 'GENERATE_INSIGHTS':
    case 'INIT_MODEL':
    case 'GET_LLM_STATUS':
      // Forward to offscreen document for LLM processing
      if (offscreenDocumentCreated) {
        // Forward message to offscreen document
        chrome.runtime.sendMessage(message)
          .then(response => sendResponse(response))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      } else {
        sendResponse({ success: false, error: 'Offscreen document not available' });
      }
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
    // Try to initialize database (optional SQLite, falls back to IndexedDB)
    const db = await initLocalDB();
    if (!db) {
      // Database not available, fall back to IndexedDB queue
      console.log('[Background] Using IndexedDB for event storage');
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


/**
 * Generate daily journal from stored events
 */
async function generateJournal(date?: string, options: { useLLM?: boolean } = {}): Promise<JournalEntry | null> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    console.log(`[Background] 📔 Generating journal for ${targetDate}...`);

    // Get events for the target date from IndexedDB
    const events = await getEventsForDate(targetDate);
    
    if (events.length === 0) {
      console.log('[Background] No events found for date, skipping journal generation');
      return null;
    }

    console.log(`[Background] Found ${events.length} events for ${targetDate}`);

    // Ensure offscreen document is available for LLM if needed
    if (options.useLLM) {
      const offscreenReady = await ensureOffscreenDocument();
      if (!offscreenReady) {
        console.warn('[Background] Offscreen document not available, generating without LLM');
        options.useLLM = false;
      }
    }

    // Generate journal entry
    const journal = await generateDailyJournal(events, targetDate, {
      classifyIntents: options.useLLM,
    });

    // Save journal entry
    await saveJournalEntry(journal);

    console.log('[Background] ✅ Journal generated and saved:', journal.id);

    // Close offscreen document to free memory
    if (options.useLLM) {
      await closeOffscreenDocument();
    }

    return journal;
  } catch (error) {
    console.error('[Background] Failed to generate journal:', error);
    return null;
  }
}

/**
 * Get events for a specific date from IndexedDB
 */
async function getEventsForDate(date: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ObserveCreateDB', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('offline-queue')) {
        resolve([]);
        return;
      }

      const transaction = db.transaction(['offline-queue'], 'readonly');
      const store = transaction.objectStore('offline-queue');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const items = (getAllRequest.result || []) as any[];
        
        // Filter events for the target date
        const targetDateStart = new Date(date + 'T00:00:00').getTime();
        const targetDateEnd = new Date(date + 'T23:59:59').getTime();
        
        const filteredEvents = items
          .map(item => item.event)
          .filter(event => {
            const timestamp = event.client_timestamp || Date.parse(event.local_timestamp);
            return timestamp >= targetDateStart && timestamp <= targetDateEnd;
          });
        
        resolve(filteredEvents);
      };
      
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

/**
 * Get journal configuration
 */
async function getJournalConfig(): Promise<{
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'custom';
  useLLM: boolean;
  lastRun?: string;
}> {
  const result = await chrome.storage.local.get(['journalConfig']);
  return result.journalConfig || {
    enabled: true,
    frequency: 'daily',
    useLLM: true,
  };
}

/**
 * Update journal configuration
 */
async function updateJournalConfig(config: Partial<{
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'custom';
  useLLM: boolean;
}>): Promise<void> {
  const currentConfig = await getJournalConfig();
  const newConfig = { ...currentConfig, ...config };
  await chrome.storage.local.set({ journalConfig: newConfig });
  
  // Recreate alarm with new schedule
  if (chrome.alarms) {
    await chrome.alarms.clear('generateJournal');
    setupJournalAlarm(newConfig.frequency);
  }
}

/**
 * Setup journal generation alarm
 */
function setupJournalAlarm(frequency: 'hourly' | 'daily' | 'weekly' | 'custom') {
  if (!chrome.alarms) return;

  let periodInMinutes: number;
  
  switch (frequency) {
    case 'hourly':
      periodInMinutes = 60;
      break;
    case 'daily':
      periodInMinutes = 24 * 60;
      break;
    case 'weekly':
      periodInMinutes = 7 * 24 * 60;
      break;
    default:
      periodInMinutes = 24 * 60; // Default to daily
  }

  chrome.alarms.create('generateJournal', { periodInMinutes });
  console.log(`[Background] Journal alarm set: ${frequency} (every ${periodInMinutes} minutes)`);
}

// Keep service worker alive
// Note: Service workers in MV3 can be terminated at any time
// Use chrome.alarms for periodic tasks
if (chrome.alarms) {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.create('saveEvents', { periodInMinutes: 0.5 }); // Every 30 seconds
  
  // Setup journal generation alarm
  getJournalConfig().then(config => {
    if (config.enabled) {
      setupJournalAlarm(config.frequency);
    }
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'keepAlive') {
      console.log('[Background] Keep-alive ping');
    } else if (alarm.name === 'saveEvents') {
      await uploadEventBatch(); // Actually saves to local DB now
      await retryQueuedEvents(); // Retry any failed saves from IndexedDB queue
    } else if (alarm.name === 'generateJournal') {
      console.log('[Background] 📔 Daily journal alarm triggered');
      const config = await getJournalConfig();
      await generateJournal(undefined, { useLLM: config.useLLM });
    }
  });
} else {
  console.warn('[Background] chrome.alarms not available');
}

export {};
