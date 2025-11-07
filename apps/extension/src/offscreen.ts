/**
 * Offscreen Document for Local LLM Processing
 * 
 * This runs in a hidden page context with full DOM/WASM access,
 * allowing Transformers.js to work properly.
 * 
 * Handles:
 * - Loading and initializing Transformers.js models
 * - Batch intent classification
 * - Generating productivity insights from patterns
 * - Communicating results back to background script
 */

import { pipeline, Pipeline, env } from '@xenova/transformers';

console.log('[Offscreen] Document initialized');

// Configure Transformers.js for offscreen document
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// In offscreen documents, we CAN use Web Workers (unlike service workers)
env.backends.onnx.wasm.proxy = true;

// Model instances
let embeddingPipeline: Pipeline | null = null;
let isInitializing = false;

/**
 * Initialize the embedding model (Xenova/all-MiniLM-L6-v2)
 */
async function initializeModel(): Promise<void> {
  if (embeddingPipeline) {
    console.log('[Offscreen] Model already initialized');
    return;
  }

  if (isInitializing) {
    console.log('[Offscreen] Model initialization in progress');
    return;
  }

  isInitializing = true;
  console.log('[Offscreen] 🤖 Initializing Xenova/all-MiniLM-L6-v2 model...');

  try {
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      {
        progress_callback: (progress: any) => {
          if (progress.status === 'downloading') {
            console.log(`[Offscreen] Downloading model: ${Math.round(progress.progress || 0)}%`);
          } else if (progress.status === 'loading') {
            console.log('[Offscreen] Loading model into memory...');
          }
        },
      }
    );

    console.log('[Offscreen] ✅ Model initialized successfully');
    isInitializing = false;
  } catch (error) {
    console.error('[Offscreen] ❌ Failed to initialize model:', error);
    isInitializing = false;
    throw error;
  }
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    await initializeModel();
  }

  const truncatedText = text.substring(0, 1000);
  const output = await embeddingPipeline!(truncatedText, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(output.data as Float32Array);
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  let dotProduct = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
  }
  return Math.max(0, Math.min(1, dotProduct));
}

/**
 * Intent categories and templates
 */
const INTENT_TEMPLATES = [
  {
    category: 'research',
    description: 'Researching and learning about a topic, gathering information, reading documentation, searching for answers',
  },
  {
    category: 'work',
    description: 'Work-related tasks, professional activities, business operations, project management',
  },
  {
    category: 'shopping',
    description: 'Shopping online, browsing products, comparing prices, making purchases',
  },
  {
    category: 'social',
    description: 'Social media, communication with others, messaging, networking',
  },
  {
    category: 'entertainment',
    description: 'Entertainment, leisure activities, watching videos, gaming, relaxation',
  },
  {
    category: 'productivity',
    description: 'Productivity tools, task management, organization, planning',
  },
  {
    category: 'development',
    description: 'Software development, coding, debugging, version control, programming',
  },
  {
    category: 'reading',
    description: 'Reading articles, blogs, news, long-form content, documentation',
  },
  {
    category: 'writing',
    description: 'Writing, content creation, drafting documents, composing messages',
  },
  {
    category: 'navigation',
    description: 'Just browsing, exploring, navigating websites, no specific goal',
  },
];

// Cache for template embeddings
let templateEmbeddings: Array<{ category: string; embedding: number[] }> | null = null;

/**
 * Initialize intent classification templates
 */
async function initializeIntentTemplates(): Promise<void> {
  if (templateEmbeddings) {
    return;
  }

  console.log('[Offscreen] Initializing intent templates...');

  templateEmbeddings = await Promise.all(
    INTENT_TEMPLATES.map(async (template) => {
      const embedding = await generateEmbedding(template.description);
      return {
        category: template.category,
        embedding,
      };
    })
  );

  console.log('[Offscreen] ✅ Intent templates initialized');
}

/**
 * Classify a single event's intent
 */
async function classifyEventIntent(event: {
  type: string;
  url: string;
  title?: string;
  domain?: string;
}): Promise<{ category: string; confidence: number }> {
  if (!templateEmbeddings) {
    await initializeIntentTemplates();
  }

  // Build semantic description of the event
  const parts: string[] = [];
  parts.push(`Action: ${event.type}`);
  if (event.title) parts.push(`Page: ${event.title}`);
  if (event.domain) parts.push(`Site: ${event.domain}`);

  const eventText = parts.join('. ');
  const eventEmbedding = await generateEmbedding(eventText);

  // Find most similar template
  let bestMatch = { category: 'navigation', confidence: 0 };
  for (const template of templateEmbeddings!) {
    const similarity = cosineSimilarity(eventEmbedding, template.embedding);
    if (similarity > bestMatch.confidence) {
      bestMatch = { category: template.category, confidence: similarity };
    }
  }

  return bestMatch;
}

/**
 * Classify multiple events in batch
 */
async function classifyEventsBatch(events: Array<{
  id: string;
  type: string;
  url: string;
  title?: string;
  domain?: string;
}>): Promise<Array<{ id: string; category: string; confidence: number }>> {
  console.log(`[Offscreen] Classifying ${events.length} events...`);

  const results = await Promise.all(
    events.map(async (event) => {
      const classification = await classifyEventIntent(event);
      return {
        id: event.id,
        category: classification.category,
        confidence: classification.confidence,
      };
    })
  );

  console.log(`[Offscreen] ✅ Classified ${results.length} events`);
  return results;
}

/**
 * Generate productivity insights from patterns and activity
 */
async function generateProductivityInsights(data: {
  topDomains: Array<{ domain: string; visits: number; timeSpent: number }>;
  intentBreakdown: Record<string, { count: number; timeSpent: number }>;
  patterns: Array<{ description: string; confidence: number }>;
  totalEvents: number;
  activeTime: number;
}): Promise<string[]> {
  console.log('[Offscreen] Generating productivity insights...');

  const insights: string[] = [];

  // Insight 1: Top activity
  if (data.topDomains.length > 0) {
    const topDomain = data.topDomains[0];
    const timeMinutes = Math.round(topDomain.timeSpent / 60000);
    insights.push(`You spent ${timeMinutes} minutes on ${topDomain.domain} today - your most visited site.`);
  }

  // Insight 2: Intent focus
  const sortedIntents = Object.entries(data.intentBreakdown)
    .sort(([, a], [, b]) => b.timeSpent - a.timeSpent);
  
  if (sortedIntents.length > 0) {
    const topIntent = sortedIntents[0];
    const timeMinutes = Math.round(topIntent[1].timeSpent / 60000);
    const percentage = Math.round((topIntent[1].timeSpent / data.activeTime) * 100);
    insights.push(`${percentage}% of your time (${timeMinutes} min) was spent on ${topIntent[0]} activities.`);
  }

  // Insight 3: Pattern detection
  if (data.patterns.length > 0) {
    insights.push(`Detected ${data.patterns.length} behavioral patterns with average ${Math.round(data.patterns.reduce((sum, p) => sum + p.confidence, 0) / data.patterns.length * 100)}% confidence.`);
  }

  // Insight 4: Activity level
  const activeHours = (data.activeTime / 3600000).toFixed(1);
  insights.push(`You were actively browsing for ${activeHours} hours with ${data.totalEvents} interactions.`);

  // Insight 5: Focus recommendation
  if (sortedIntents.length >= 2) {
    const secondIntent = sortedIntents[1];
    insights.push(`Consider dedicating focused blocks for ${secondIntent[0]} work to improve efficiency.`);
  }

  console.log(`[Offscreen] ✅ Generated ${insights.length} insights`);
  return insights;
}

/**
 * Message handler from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message.type);

  (async () => {
    try {
      switch (message.type) {
        case 'INIT_MODEL':
          await initializeModel();
          await initializeIntentTemplates();
          sendResponse({ success: true, ready: true });
          break;

        case 'CLASSIFY_EVENTS_BATCH':
          const classifications = await classifyEventsBatch(message.events);
          sendResponse({ success: true, classifications });
          break;

        case 'GENERATE_INSIGHTS':
          const insights = await generateProductivityInsights(message.data);
          sendResponse({ success: true, insights });
          break;

        case 'GET_LLM_STATUS':
          sendResponse({
            success: true,
            modelReady: embeddingPipeline !== null,
            templatesReady: templateEmbeddings !== null,
          });
          break;

        case 'EXPORT_ALL_DATA':
          // Export all data from IndexedDB
          const allData = await exportAllDataFromIndexedDB();
          sendResponse({ success: true, data: allData });
          break;

        case 'EXPORT_EVENTS_DATA':
          // Export just events
          const events = await getAllEventsFromIndexedDB();
          sendResponse({ success: true, events });
          break;

        case 'EXPORT_JOURNALS_DATA':
          // Export just journals
          const journals = await getAllJournalsFromIndexedDB();
          sendResponse({ success: true, journals });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[Offscreen] Error handling message:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })();

  return true; // Keep channel open for async response
});

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
 * Export all data as structured object
 */
async function exportAllDataFromIndexedDB(): Promise<any> {
  const events = await getAllEventsFromIndexedDB();
  const journals = await getAllJournalsFromIndexedDB();
  
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
}

// Auto-initialize on startup
console.log('[Offscreen] Starting auto-initialization...');
initializeModel()
  .then(() => initializeIntentTemplates())
  .then(() => {
    console.log('[Offscreen] ✅ Ready for LLM processing');
  })
  .catch((error) => {
    console.error('[Offscreen] ⚠️ Auto-initialization failed:', error);
  });

