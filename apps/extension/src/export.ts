/**
 * Data Export Utilities
 * 
 * Provides comprehensive data export functionality for users to:
 * - Download all events, patterns, page profiles, and sessions as JSON
 * - Generate CSV exports for analysis
 * - Create timestamped backup files
 */

import { getDB } from '@observe-create/storage';

export interface ExportData {
  metadata: {
    exportDate: string;
    version: string;
    totalEvents: number;
    totalPatterns: number;
    totalProfiles: number;
    totalSessions: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
  };
  events: any[];
  patterns: any[];
  pageProfiles: any[];
  sessions: any[];
}

/**
 * Export all data as JSON
 */
export async function exportAllData(): Promise<ExportData> {
  try {
    const db = await getDB();
    
    // Get all data from database
    const data = await db.exportAllData();
    
    // Calculate date range
    const events = data.events || [];
    let earliestDate = new Date().toISOString();
    let latestDate = new Date().toISOString();
    
    if (events.length > 0) {
      const timestamps = events.map(e => e.client_timestamp).filter(Boolean);
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
        totalPatterns: data.patterns?.length || 0,
        totalProfiles: data.pageProfiles?.length || 0,
        totalSessions: data.sessions?.length || 0,
        dateRange: {
          earliest: earliestDate,
          latest: latestDate
        }
      },
      events: data.events || [],
      patterns: data.patterns || [],
      pageProfiles: data.pageProfiles || [],
      sessions: data.sessions || []
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
    const db = await getDB();
    const events = await db.getRecentEvents(10000); // Export up to 10k most recent
    
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
      event.id,
      event.local_timestamp,
      event.type,
      event.url,
      event.domain,
      event.title || '',
      event.client_timestamp,
      event.timezone_offset,
      event.device_id,
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
  patternCount: number;
  profileCount: number;
  sessionCount: number;
  estimatedSize: string;
  dateRange: { earliest: string; latest: string } | null;
}> {
  try {
    const db = await getDB();
    const stats = db.getStats();
    
    // Estimate size (rough approximation)
    const avgEventSize = 500; // bytes
    const estimatedBytes = stats.eventCount * avgEventSize;
    const estimatedSize = estimatedBytes < 1024 * 1024
      ? `${Math.round(estimatedBytes / 1024)} KB`
      : `${Math.round(estimatedBytes / (1024 * 1024))} MB`;
    
    // Get date range
    let dateRange = null;
    const events = await db.getRecentEvents(1);
    if (events.length > 0) {
      const allEvents = await db.getRecentEvents(10000);
      if (allEvents.length > 0) {
        const timestamps = allEvents.map(e => e.client_timestamp).filter(Boolean);
        if (timestamps.length > 0) {
          dateRange = {
            earliest: new Date(Math.min(...timestamps)).toISOString(),
            latest: new Date(Math.max(...timestamps)).toISOString()
          };
        }
      }
    }
    
    return {
      eventCount: stats.eventCount,
      patternCount: stats.patternCount,
      profileCount: stats.profileCount,
      sessionCount: stats.sessionCount,
      estimatedSize,
      dateRange
    };
  } catch (error) {
    console.error('[Export] Failed to get export summary:', error);
    throw error;
  }
}

/**
 * Export patterns as JSON file
 */
export async function downloadPatternsAsJSON(): Promise<void> {
  try {
    console.log('[Export] Starting patterns export...');
    
    const db = await getDB();
    const patterns = await db.getAllPatterns();
    
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
 * Create automatic backup
 * Called periodically to create timestamped backups
 */
export async function createAutoBackup(): Promise<void> {
  try {
    console.log('[Export] Creating automatic backup...');
    
    const data = await exportAllData();
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `observe-create-backup-${timestamp}.json`;
    
    // Convert to JSON string (minified for backups)
    const jsonString = JSON.stringify(data);
    
    // Store in chrome.storage.local as backup
    const backupKey = `backup_${timestamp}`;
    await chrome.storage.local.set({
      [backupKey]: {
        filename,
        data: jsonString,
        size: jsonString.length,
        created: new Date().toISOString()
      }
    });
    
    // Keep only last 3 backups
    const allKeys = await chrome.storage.local.get(null);
    const backupKeys = Object.keys(allKeys)
      .filter(key => key.startsWith('backup_'))
      .sort()
      .reverse();
    
    if (backupKeys.length > 3) {
      const keysToRemove = backupKeys.slice(3);
      await chrome.storage.local.remove(keysToRemove);
      console.log(`[Export] Removed ${keysToRemove.length} old backups`);
    }
    
    console.log(`[Export] ✅ Automatic backup created: ${filename}`);
  } catch (error) {
    console.error('[Export] Failed to create automatic backup:', error);
  }
}

