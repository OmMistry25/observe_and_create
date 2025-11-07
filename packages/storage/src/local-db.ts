/**
 * Local SQLite Database for Extension
 * 
 * Provides persistent local storage using SQL.js
 * Eliminates cloud dependencies and ensures 100% reliability
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

export interface Event {
  id: string;
  client_timestamp: number;
  local_timestamp: string;
  timezone_offset: number;
  type: string;
  url: string;
  domain: string;
  url_path?: string;
  title?: string;
  semantic_context?: any;
  document_context?: any;
  device_id: string;
  session_id?: string;
}

export interface PageProfile {
  url_path: string;
  visit_count: number;
  dom_profile: any;
  last_updated: string;
  created_at: string;
}

export interface Pattern {
  id: string;
  sequence: any[];
  occurrences: number;
  confidence: number;
  first_seen: string;
  last_seen: string;
  pattern_type: 'frequency' | 'temporal' | 'semantic';
  temporal_metadata?: any;
  semantic_cluster_id?: string;
}

export interface Session {
  session_id: string;
  start_time: string;
  end_time?: string;
  event_count: number;
  device_id: string;
}

/**
 * LocalDB class - manages SQLite database for extension
 */
export class LocalDB {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private isInitialized: boolean = false;
  private storageKey: string = 'observe_create_db';

  constructor() {}

  /**
   * Initialize SQLite database
   */
  async initialize(): Promise<void> {
    // WASM is not reliable in Chrome extensions - disable SQL.js entirely
    // Extension will use IndexedDB fallback instead
    // This prevents WASM compilation errors in the Chrome extension console
    throw new Error('SQLite/WASM disabled - using IndexedDB fallback');
  }

  /**
   * Load database from chrome.storage.local
   */
  private async loadFromStorage(): Promise<Uint8Array | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return null;
    }

    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      if (result[this.storageKey]) {
        return new Uint8Array(result[this.storageKey]);
      }
    } catch (error) {
      console.error('[LocalDB] Error loading from storage:', error);
    }
    return null;
  }

  /**
   * Save database to chrome.storage.local
   */
  async saveToStorage(): Promise<void> {
    if (!this.db || typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      const data = this.db.export();
      const dataArray = Array.from(data);
      
      await chrome.storage.local.set({
        [this.storageKey]: dataArray
      });
      
      console.log('[LocalDB] Database saved to storage');
    } catch (error) {
      console.error('[LocalDB] Error saving to storage:', error);
    }
  }

  /**
   * Setup periodic backup (every 5 minutes)
   */
  private setupPeriodicBackup(): void {
    setInterval(() => {
      this.saveToStorage();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    const statements = [
      // Events table
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        client_timestamp INTEGER NOT NULL,
        local_timestamp TEXT NOT NULL,
        timezone_offset INTEGER NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        url_path TEXT,
        title TEXT,
        semantic_context TEXT,
        document_context TEXT,
        device_id TEXT NOT NULL,
        session_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Page profiles table
      `CREATE TABLE IF NOT EXISTS page_profiles (
        url_path TEXT PRIMARY KEY,
        visit_count INTEGER NOT NULL DEFAULT 0,
        dom_profile TEXT,
        last_updated TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Patterns table
      `CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        sequence TEXT NOT NULL,
        occurrences INTEGER NOT NULL,
        confidence REAL NOT NULL,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        temporal_metadata TEXT,
        semantic_cluster_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Sessions table
      `CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        start_time TEXT NOT NULL,
        end_time TEXT,
        event_count INTEGER NOT NULL DEFAULT 0,
        device_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(client_timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain)`,
      `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type)`,
      `CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence)`
    ];

    for (const stmt of statements) {
      this.db.run(stmt);
    }

    console.log('[LocalDB] Schema created successfully');
  }

  /**
   * Execute query and return results
   */
  private query<T>(sql: string, params: any[] = []): T[] {
    if (!this.db) throw new Error('Database not initialized');

    const results: T[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      
      // Parse JSON columns
      if (row.semantic_context) {
        try {
          row.semantic_context = JSON.parse(row.semantic_context);
        } catch {}
      }
      if (row.document_context) {
        try {
          row.document_context = JSON.parse(row.document_context);
        } catch {}
      }
      if (row.dom_profile) {
        try {
          row.dom_profile = JSON.parse(row.dom_profile);
        } catch {}
      }
      if (row.sequence) {
        try {
          row.sequence = JSON.parse(row.sequence);
        } catch {}
      }
      if (row.temporal_metadata) {
        try {
          row.temporal_metadata = JSON.parse(row.temporal_metadata);
        } catch {}
      }
      
      results.push(row as T);
    }

    stmt.free();
    return results;
  }

  // ==================== EVENTS ====================

  /**
   * Insert single event
   */
  insertEvent(event: Event): void {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `INSERT INTO events (
      id, client_timestamp, local_timestamp, timezone_offset, type, url, domain, url_path, 
      title, semantic_context, document_context, device_id, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    this.db.run(sql, [
      event.id,
      event.client_timestamp,
      event.local_timestamp,
      event.timezone_offset,
      event.type,
      event.url,
      event.domain,
      event.url_path || null,
      event.title || null,
      event.semantic_context ? JSON.stringify(event.semantic_context) : null,
      event.document_context ? JSON.stringify(event.document_context) : null,
      event.device_id,
      event.session_id || null
    ]);
  }

  /**
   * Insert multiple events in batch
   */
  insertEventsBatch(events: Event[]): void {
    if (!this.db) throw new Error('Database not initialized');

    // Begin transaction for better performance
    this.db.run('BEGIN TRANSACTION');
    
    try {
      for (const event of events) {
        this.insertEvent(event);
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get events by time range
   */
  getEventsByTimeRange(startTime: number, endTime: number, limit: number = 1000): Event[] {
    const sql = `SELECT * FROM events 
                 WHERE client_timestamp >= ? AND client_timestamp <= ?
                 ORDER BY client_timestamp DESC 
                 LIMIT ?`;
    return this.query<Event>(sql, [startTime, endTime, limit]);
  }

  /**
   * Get events by domain
   */
  getEventsByDomain(domain: string, limit: number = 1000): Event[] {
    const sql = `SELECT * FROM events 
                 WHERE domain = ?
                 ORDER BY client_timestamp DESC 
                 LIMIT ?`;
    return this.query<Event>(sql, [domain, limit]);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): Event[] {
    const sql = `SELECT * FROM events 
                 ORDER BY client_timestamp DESC 
                 LIMIT ?`;
    return this.query<Event>(sql, [limit]);
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    const result = this.query<{ count: number }>(`SELECT COUNT(*) as count FROM events`);
    return result[0]?.count || 0;
  }

  /**
   * Get events for today
   */
  getEventsToday(): Event[] {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    return this.getEventsByTimeRange(startOfDay.getTime(), endOfDay.getTime());
  }

  // ==================== PAGE PROFILES ====================

  /**
   * Upsert page profile
   */
  upsertPageProfile(profile: PageProfile): void {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `INSERT INTO page_profiles (url_path, visit_count, dom_profile, last_updated)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(url_path) 
                 DO UPDATE SET 
                   visit_count = ?,
                   dom_profile = ?,
                   last_updated = ?`;

    this.db.run(sql, [
      profile.url_path,
      profile.visit_count,
      JSON.stringify(profile.dom_profile),
      profile.last_updated,
      profile.visit_count,
      JSON.stringify(profile.dom_profile),
      profile.last_updated
    ]);
  }

  /**
   * Get page profile
   */
  getPageProfile(urlPath: string): PageProfile | null {
    const sql = `SELECT * FROM page_profiles WHERE url_path = ?`;
    const results = this.query<PageProfile>(sql, [urlPath]);
    return results[0] || null;
  }

  /**
   * Get all page profiles
   */
  getAllPageProfiles(): PageProfile[] {
    return this.query<PageProfile>(`SELECT * FROM page_profiles ORDER BY visit_count DESC`);
  }

  /**
   * Increment visit count
   */
  incrementVisitCount(urlPath: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `UPDATE page_profiles 
                 SET visit_count = visit_count + 1, last_updated = ?
                 WHERE url_path = ?`;
    this.db.run(sql, [new Date().toISOString(), urlPath]);
  }

  // ==================== PATTERNS ====================

  /**
   * Insert or update pattern
   */
  upsertPattern(pattern: Pattern): void {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `INSERT INTO patterns (
      id, sequence, occurrences, confidence, first_seen, last_seen, 
      pattern_type, temporal_metadata, semantic_cluster_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id)
    DO UPDATE SET
      occurrences = ?,
      confidence = ?,
      last_seen = ?,
      temporal_metadata = ?,
      semantic_cluster_id = ?`;

    this.db.run(sql, [
      pattern.id,
      JSON.stringify(pattern.sequence),
      pattern.occurrences,
      pattern.confidence,
      pattern.first_seen,
      pattern.last_seen,
      pattern.pattern_type,
      pattern.temporal_metadata ? JSON.stringify(pattern.temporal_metadata) : null,
      pattern.semantic_cluster_id || null,
      pattern.occurrences,
      pattern.confidence,
      pattern.last_seen,
      pattern.temporal_metadata ? JSON.stringify(pattern.temporal_metadata) : null,
      pattern.semantic_cluster_id || null
    ]);
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): Pattern[] {
    return this.query<Pattern>(`SELECT * FROM patterns ORDER BY confidence DESC, occurrences DESC`);
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: 'frequency' | 'temporal' | 'semantic'): Pattern[] {
    const sql = `SELECT * FROM patterns WHERE pattern_type = ? ORDER BY confidence DESC`;
    return this.query<Pattern>(sql, [type]);
  }

  /**
   * Get high confidence patterns
   */
  getHighConfidencePatterns(minConfidence: number = 0.7): Pattern[] {
    const sql = `SELECT * FROM patterns WHERE confidence >= ? ORDER BY confidence DESC`;
    return this.query<Pattern>(sql, [minConfidence]);
  }

  // ==================== SESSIONS ====================

  /**
   * Insert session
   */
  insertSession(session: Session): void {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `INSERT INTO sessions (session_id, start_time, end_time, event_count, device_id)
                 VALUES (?, ?, ?, ?, ?)`;
    this.db.run(sql, [
      session.session_id,
      session.start_time,
      session.end_time || null,
      session.event_count,
      session.device_id
    ]);
  }

  /**
   * Update session
   */
  updateSession(sessionId: string, endTime: string, eventCount: number): void {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `UPDATE sessions SET end_time = ?, event_count = ? WHERE session_id = ?`;
    this.db.run(sql, [endTime, eventCount, sessionId]);
  }

  /**
   * Get active sessions (no end_time)
   */
  getActiveSessions(): Session[] {
    return this.query<Session>(`SELECT * FROM sessions WHERE end_time IS NULL`);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    return this.query<Session>(`SELECT * FROM sessions ORDER BY start_time DESC`);
  }

  // ==================== UTILITY ====================

  /**
   * Get database statistics
   */
  getStats(): {
    eventCount: number;
    profileCount: number;
    patternCount: number;
    sessionCount: number;
  } {
    const eventCount = this.query<{ count: number }>(`SELECT COUNT(*) as count FROM events`)[0]?.count || 0;
    const profileCount = this.query<{ count: number }>(`SELECT COUNT(*) as count FROM page_profiles`)[0]?.count || 0;
    const patternCount = this.query<{ count: number }>(`SELECT COUNT(*) as count FROM patterns`)[0]?.count || 0;
    const sessionCount = this.query<{ count: number }>(`SELECT COUNT(*) as count FROM sessions`)[0]?.count || 0;

    return {
      eventCount,
      profileCount,
      patternCount,
      sessionCount
    };
  }

  /**
   * Delete old events (data retention)
   */
  deleteOldEvents(olderThanDays: number): void {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const sql = `DELETE FROM events WHERE client_timestamp < ?`;
    this.db.run(sql, [cutoffTime]);
  }

  /**
   * Export all data as JSON
   */
  exportAllData(): {
    events: Event[];
    pageProfiles: PageProfile[];
    patterns: Pattern[];
    sessions: Session[];
    metadata: {
      exportDate: string;
      version: string;
    };
  } {
    return {
      events: this.query<Event>(`SELECT * FROM events`),
      pageProfiles: this.getAllPageProfiles(),
      patterns: this.getAllPatterns(),
      sessions: this.getAllSessions(),
      metadata: {
        exportDate: new Date().toISOString(),
        version: '1.0'
      }
    };
  }

  /**
   * Clear all data (for testing or reset)
   */
  clearAllData(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM events');
    this.db.run('DELETE FROM page_profiles');
    this.db.run('DELETE FROM patterns');
    this.db.run('DELETE FROM sessions');
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.saveToStorage();
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('[LocalDB] Database closed');
    }
  }
}

// Singleton instance
let dbInstance: LocalDB | null = null;

/**
 * Get LocalDB singleton instance
 */
export async function getDB(): Promise<LocalDB> {
  if (!dbInstance) {
    dbInstance = new LocalDB();
    await dbInstance.initialize();
  }
  return dbInstance;
}
