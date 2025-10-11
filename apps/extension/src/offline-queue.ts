/**
 * Offline Queue using IndexedDB
 * 
 * Persistent storage for events when offline or upload fails
 * Implements retry with exponential backoff
 */

const DB_NAME = 'observe_create_offline';
const DB_VERSION = 1;
const STORE_NAME = 'event_queue';
const RETRY_STORE_NAME = 'retry_metadata';

interface QueuedEvent {
  id: string;
  event: any;
  timestamp: number;
  retryCount: number;
  nextRetryAt: number;
}

interface RetryMetadata {
  totalRetries: number;
  lastRetryAt: number;
}

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create event queue store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('nextRetryAt', 'nextRetryAt', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Create retry metadata store
      if (!db.objectStoreNames.contains(RETRY_STORE_NAME)) {
        db.createObjectStore(RETRY_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Add events to the queue
 */
export async function enqueueEvents(events: any[]): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const now = Date.now();

  for (const event of events) {
    const queuedEvent: QueuedEvent = {
      id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
      event,
      timestamp: now,
      retryCount: 0,
      nextRetryAt: now, // Retry immediately on first attempt
    };

    store.add(queuedEvent);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/**
 * Get events ready for retry (nextRetryAt <= now)
 */
export async function getEventsToRetry(limit: number = 50): Promise<QueuedEvent[]> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('nextRetryAt');

  const now = Date.now();
  const range = IDBKeyRange.upperBound(now);
  const request = index.openCursor(range);

  const events: QueuedEvent[] = [];

  return new Promise((resolve, reject) => {
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor && events.length < limit) {
        events.push(cursor.value);
        cursor.continue();
      } else {
        db.close();
        resolve(events);
      }
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Mark events as successfully uploaded and remove from queue
 */
export async function dequeueEvents(eventIds: string[]): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  for (const id of eventIds) {
    store.delete(id);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/**
 * Update retry metadata for failed events (exponential backoff)
 */
export async function scheduleRetry(eventIds: string[]): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const now = Date.now();

  for (const id of eventIds) {
    const request = store.get(id);

    request.onsuccess = () => {
      const queuedEvent = request.result as QueuedEvent;
      if (queuedEvent) {
        queuedEvent.retryCount += 1;

        // Exponential backoff: 2^retryCount seconds (max 1 hour)
        const backoffSeconds = Math.min(Math.pow(2, queuedEvent.retryCount), 3600);
        queuedEvent.nextRetryAt = now + backoffSeconds * 1000;

        store.put(queuedEvent);
        console.log(`[OfflineQueue] Scheduled retry for event ${id} in ${backoffSeconds}s (attempt ${queuedEvent.retryCount})`);
      }
    };
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{ total: number; pending: number }> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  const countRequest = store.count();
  const now = Date.now();
  const index = store.index('nextRetryAt');
  const range = IDBKeyRange.upperBound(now);
  const pendingRequest = index.count(range);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      resolve({
        total: countRequest.result,
        pending: pendingRequest.result,
      });
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/**
 * Clear all events from the queue (for testing or reset)
 */
export async function clearQueue(): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME, RETRY_STORE_NAME], 'readwrite');
  
  transaction.objectStore(STORE_NAME).clear();
  transaction.objectStore(RETRY_STORE_NAME).clear();

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      console.log('[OfflineQueue] Queue cleared');
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

