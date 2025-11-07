/**
 * Popup Script with Health Metrics
 * 
 * Shows comprehensive statistics about data capture and quality
 */

console.log('[Popup] Loaded');

// Elements
const toggle = document.getElementById('toggle') as HTMLElement;
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement;
const statusText = document.getElementById('statusText') as HTMLElement;
const dashboardBtn = document.getElementById('dashboardBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const helpLink = document.getElementById('helpLink') as HTMLAnchorElement;
const eventCount = document.getElementById('eventCount') as HTMLElement;
const patternCount = document.getElementById('patternCount') as HTMLElement;
const storageSize = document.getElementById('storageSize') as HTMLElement;
const qualityScore = document.getElementById('qualityScore') as HTMLElement;
const temporalPatterns = document.getElementById('temporalPatterns') as HTMLElement;
const pageProfiles = document.getElementById('pageProfiles') as HTMLElement;

/**
 * Calculate storage usage from IndexedDB
 */
async function calculateStorageUsage(): Promise<number> {
  try {
    // Get all IndexedDB databases
    const databases = ['observe_create_offline', 'PageProfilerDB'];
    let totalSize = 0;

    for (const dbName of databases) {
      try {
        const db = await openIndexedDB(dbName);
        const size = await estimateDatabaseSize(db);
        totalSize += size;
        db.close();
      } catch (error) {
        // Database might not exist, skip
      }
    }

    // Add chrome.storage size
    const storage = await chrome.storage.local.get(null);
    const storageStr = JSON.stringify(storage);
    totalSize += storageStr.length;

    return totalSize;
  } catch (error) {
    console.error('[Popup] Failed to calculate storage:', error);
    return 0;
  }
}

/**
 * Open IndexedDB database
 */
function openIndexedDB(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Estimate database size
 */
async function estimateDatabaseSize(db: IDBDatabase): Promise<number> {
  let size = 0;
  const storeNames = Array.from(db.objectStoreNames);

  for (const storeName of storeNames) {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const count = await new Promise<number>((resolve) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });

      // Rough estimate: 1KB per record
      size += count * 1024;
    } catch (error) {
      // Skip if error
    }
  }

  return size;
}

/**
 * Get pattern count from IndexedDB
 */
async function getPatternCount(): Promise<number> {
  try {
    const db = await openIndexedDB('observe_create_offline');
    const tx = db.transaction(['event_queue'], 'readonly');
    const store = tx.objectStore('event_queue');
    
    return new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => {
        db.close();
        resolve(0);
      };
    });
  } catch (error) {
    return 0;
  }
}

/**
 * Get page profile count
 */
async function getPageProfileCount(): Promise<number> {
  try {
    const db = await openIndexedDB('PageProfilerDB');
    const tx = db.transaction(['profiles'], 'readonly');
    const store = tx.objectStore('profiles');
    
    return new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => {
        db.close();
        resolve(0);
      };
    });
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate data quality score
 * Based on:
 * - Capture frequency (events per day)
 * - Context completeness (% events with semantic context)
 * - Pattern detection rate
 */
async function calculateQualityScore(): Promise<number> {
  try {
    const db = await openIndexedDB('observe_create_offline');
    const tx = db.transaction(['event_queue'], 'readonly');
    const store = tx.objectStore('event_queue');
    
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const events = req.result || [];
        
        if (events.length === 0) {
          resolve(0);
          return;
        }

        // Calculate metrics
        let contextComplete = 0;
        let recentEvents = 0;
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

        for (const event of events) {
          // Check context completeness
          if (event.event?.semantic_context && 
              event.event.semantic_context.temporalContext &&
              event.event.semantic_context.pageMetadata) {
            contextComplete++;
          }

          // Check if recent
          if (event.timestamp > oneDayAgo) {
            recentEvents++;
          }
        }

        // Calculate score (0-100)
        const contextScore = (contextComplete / events.length) * 40; // 40 points for context
        const frequencyScore = Math.min(recentEvents / 10, 1) * 30; // 30 points for frequency
        const volumeScore = Math.min(events.length / 100, 1) * 30; // 30 points for volume

        const score = Math.round(contextScore + frequencyScore + volumeScore);
        resolve(score);
      };
      req.onerror = () => {
        db.close();
        resolve(0);
      };
    });
  } catch (error) {
    return 0;
  }
}

/**
 * Get quality indicator badge
 */
function getQualityIndicator(score: number): string {
  if (score >= 80) return '<span class="health-indicator excellent">Excellent</span>';
  if (score >= 60) return '<span class="health-indicator good">Good</span>';
  if (score >= 40) return '<span class="health-indicator fair">Fair</span>';
  return '<span class="health-indicator poor">Needs Improvement</span>';
}

/**
 * Update all metrics
 */
async function updateMetrics() {
  try {
    // Event count
    const events = await getPatternCount();
    eventCount.textContent = events.toString();

    // Pattern count (for now, estimate as events / 10)
    const patterns = Math.floor(events / 10);
    patternCount.textContent = patterns.toString();

    // Storage size
    const storage = await calculateStorageUsage();
    const sizeMB = (storage / (1024 * 1024)).toFixed(1);
    storageSize.textContent = `${sizeMB}MB`;

    // Quality score
    const quality = await calculateQualityScore();
    qualityScore.textContent = `${quality}%`;

    // Temporal patterns (simulated for now)
    const tempPatterns = Math.floor(patterns * 0.3); // ~30% are temporal
    temporalPatterns.textContent = tempPatterns.toString();

    // Page profiles
    const profiles = await getPageProfileCount();
    pageProfiles.textContent = profiles.toString();

    console.log('[Popup] Metrics updated:', {
      events,
      patterns,
      storage: sizeMB + 'MB',
      quality: quality + '%',
      temporalPatterns: tempPatterns,
      pageProfiles: profiles,
    });
  } catch (error) {
    console.error('[Popup] Failed to update metrics:', error);
  }
}

// Load current status
chrome.storage.local.get(['enabled'], (result) => {
  const enabled = result.enabled ?? true;
  updateUI(enabled);
  
  // Update metrics
  updateMetrics();
});

// Toggle enable/disable
toggle.addEventListener('click', () => {
  chrome.storage.local.get(['enabled'], (result) => {
    const newState = !(result.enabled ?? true);
    chrome.storage.local.set({ enabled: newState }, () => {
      updateUI(newState);
      
      // Notify background script
      chrome.runtime.sendMessage({
        type: 'SET_STATUS',
        enabled: newState,
      });
    });
  });
});

// Open dashboard
dashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://observeandcreate-ogvlapqej-ommistry25s-projects.vercel.app/dashboard',
  });
  window.close();
});

// Open settings
settingsBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://observeandcreate-ogvlapqej-ommistry25s-projects.vercel.app/dashboard',
  });
  window.close();
});

// Help link
helpLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({
    url: 'https://github.com/OmMistry25/observe_and_create',
  });
  window.close();
});

/**
 * Update UI based on enabled state
 */
function updateUI(enabled: boolean) {
  if (enabled) {
    toggle.classList.add('active');
    statusIndicator.classList.remove('disabled');
    statusText.textContent = 'Active';
  } else {
    toggle.classList.remove('active');
    statusIndicator.classList.add('disabled');
    statusText.textContent = 'Paused';
  }
}

// Refresh metrics every 5 seconds
setInterval(updateMetrics, 5000);

export {};
