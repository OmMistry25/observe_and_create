/**
 * Data Export Utilities - IndexedDB Version
 * 
 * Reads directly from IndexedDB since SQLite is disabled
 */

export interface ExportData {
  metadata: {
    exportDate: string;
    version: string;
    totalEvents: number;
    totalJournals: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
  };
  events: any[];
  journals: any[];
}

/**
 * Get all events from IndexedDB
 */
async function getAllEventsFromIndexedDB(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ObserveCreateDB', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('offline-queue')) {
        resolve([]);
        db.close();
        return;
      }

      const transaction = db.transaction(['offline-queue'], 'readonly');
      const store = transaction.objectStore('offline-queue');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        db.close();
        const items = (getAllRequest.result || []) as any[];
        // Extract events from queue items
        const events = items.map(item => item.event).filter(e => e);
        resolve(events);
      };
      
      getAllRequest.onerror = () => {
        db.close();
        reject(getAllRequest.error);
      };
    };
  });
}

/**
 * Get all journals from IndexedDB
 */
async function getAllJournalsFromIndexedDB(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ObserveCreateDB', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('journals')) {
        resolve([]);
        db.close();
        return;
      }

      const transaction = db.transaction(['journals'], 'readonly');
      const store = transaction.objectStore('journals');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        db.close();
        resolve(getAllRequest.result || []);
      };
      
      getAllRequest.onerror = () => {
        db.close();
        reject(getAllRequest.error);
      };
    };
  });
}

/**
 * Export all data as JSON
 */
export async function exportAllData(): Promise<ExportData> {
  try {
    // Get data from IndexedDB
    const events = await getAllEventsFromIndexedDB();
    const journals = await getAllJournalsFromIndexedDB();
    
    // Calculate date range
    let earliestDate = new Date().toISOString();
    let latestDate = new Date().toISOString();
    
    if (events.length > 0) {
      const timestamps = events
        .map(e => e.client_timestamp || Date.parse(e.local_timestamp))
        .filter(Boolean);
      
      if (timestamps.length > 0) {
        earliestDate = new Date(Math.min(...timestamps)).toISOString();
        latestDate = new Date(Math.max(...timestamps)).toISOString();
      }
    }
    
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '1.0',
        totalEvents: events.length,
        totalJournals: journals.length,
        dateRange: {
          earliest: earliestDate,
          latest: latestDate
        }
      },
      events,
      journals
    };
  } catch (error) {
    console.error('[Export] Failed to export data:', error);
    throw error;
  }
}

/**
 * Download data as JSON file
 */
export async function downloadDataAsJSON(): Promise<void> {
  try {
    console.log('[Export] Starting data export...');
    
    const data = await exportAllData();
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `observe-create-export-${timestamp}.json`;
    
    // Convert to JSON string
    const jsonString = JSON.stringify(data, null, 2);
    
    // Create blob
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    if (chrome?.downloads) {
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true
      });
      
      console.log(`[Export] ✅ Data exported successfully: ${filename}`);
    } else {
      // Fallback for environments without chrome.downloads
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('[Export] Failed to download data:', error);
    throw error;
  }
}

/**
 * Export events as CSV format
 */
export async function exportEventsAsCSV(): Promise<string> {
  try {
    const events = await getAllEventsFromIndexedDB();
    
    if (events.length === 0) {
      return 'No events to export';
    }
    
    // CSV headers
    const headers = [
      'id',
      'timestamp',
      'type',
      'url',
      'domain',
      'title',
      'client_timestamp',
      'timezone_offset',
      'device_id',
      'session_id'
    ];
    
    // CSV rows
    const rows = events.map(event => [
      event.id || '',
      event.local_timestamp || '',
      event.type || '',
      event.url || '',
      event.domain || '',
      event.title || '',
      event.client_timestamp || '',
      event.timezone_offset || '',
      event.device_id || '',
      event.session_id || ''
    ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','));
    
    // Combine headers and rows
    return [headers.join(','), ...rows].join('\n');
  } catch (error) {
    console.error('[Export] Failed to export CSV:', error);
    throw error;
  }
}

/**
 * Download events as CSV file
 */
export async function downloadEventsAsCSV(): Promise<void> {
  try {
    console.log('[Export] Starting CSV export...');
    
    const csv = await exportEventsAsCSV();
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `observe-create-events-${timestamp}.csv`;
    
    // Create blob
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    if (chrome?.downloads) {
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true
      });
      
      console.log(`[Export] ✅ CSV exported successfully: ${filename}`);
    } else {
      // Fallback
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('[Export] Failed to download CSV:', error);
    throw error;
  }
}

/**
 * Get export summary (for display before export)
 */
export async function getExportSummary(): Promise<{
  eventCount: number;
  journalCount: number;
  estimatedSize: string;
  dateRange: { earliest: string; latest: string } | null;
}> {
  try {
    const events = await getAllEventsFromIndexedDB();
    const journals = await getAllJournalsFromIndexedDB();
    
    // Estimate size (rough approximation)
    const avgEventSize = 500; // bytes
    const estimatedBytes = events.length * avgEventSize;
    const estimatedSize = estimatedBytes < 1024 * 1024
      ? `${Math.round(estimatedBytes / 1024)} KB`
      : `${Math.round(estimatedBytes / (1024 * 1024))} MB`;
    
    // Get date range
    let dateRange = null;
    if (events.length > 0) {
      const timestamps = events
        .map(e => e.client_timestamp || Date.parse(e.local_timestamp))
        .filter(Boolean);
      
      if (timestamps.length > 0) {
        dateRange = {
          earliest: new Date(Math.min(...timestamps)).toISOString(),
          latest: new Date(Math.max(...timestamps)).toISOString()
        };
      }
    }
    
    return {
      eventCount: events.length,
      journalCount: journals.length,
      estimatedSize,
      dateRange
    };
  } catch (error) {
    console.error('[Export] Failed to get export summary:', error);
    throw error;
  }
}

/**
 * Export patterns as JSON file (from journal entries)
 */
export async function downloadPatternsAsJSON(): Promise<void> {
  try {
    console.log('[Export] Starting patterns export...');
    
    // Get patterns from journal entries
    const journals = await getAllJournalsFromIndexedDB();
    const patterns: any[] = [];
    
    for (const journal of journals) {
      if (journal.pattern_summary?.frequency_patterns) {
        patterns.push(...journal.pattern_summary.frequency_patterns.map((p: any) => ({
          ...p,
          date: journal.date,
          type: 'frequency'
        })));
      }
      if (journal.pattern_summary?.temporal_patterns) {
        patterns.push(...journal.pattern_summary.temporal_patterns.map((p: any) => ({
          ...p,
          date: journal.date,
          type: 'temporal'
        })));
      }
    }
    
    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      totalPatterns: patterns.length,
      patterns
    };
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `observe-create-patterns-${timestamp}.json`;
    
    // Convert to JSON string
    const jsonString = JSON.stringify(data, null, 2);
    
    // Create blob
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    if (chrome?.downloads) {
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true
      });
      
      console.log(`[Export] ✅ Patterns exported successfully: ${filename}`);
    } else {
      // Fallback
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('[Export] Failed to download patterns:', error);
    throw error;
  }
}

/**
 * Create automatic backup (no-op since we're not using SQLite)
 */
export async function createAutoBackup(): Promise<void> {
  console.log('[Export] Auto-backup skipped (using IndexedDB)');
}
