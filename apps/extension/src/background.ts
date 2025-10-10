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
      // TODO: Queue for upload to server
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

// Keep service worker alive
// Note: Service workers in MV3 can be terminated at any time
// Use chrome.alarms for periodic tasks
if (chrome.alarms) {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
      console.log('[Background] Keep-alive ping');
    }
  });
} else {
  console.warn('[Background] chrome.alarms not available');
}

export {};
