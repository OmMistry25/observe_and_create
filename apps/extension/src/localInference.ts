/**
 * Local Intent Classification
 * 
 * Uses local embeddings to classify user intent without sending data to cloud
 * - Privacy: All inference happens locally
 * - Fast: Uses pre-computed template embeddings
 * - Accurate: Semantic similarity matching
 */

import {
  generateEmbedding,
  embedEvent,
  cosineSimilarity,
  findMostSimilar,
  preloadModel,
} from './localEmbeddings';

/**
 * Intent categories we can classify
 */
export type IntentCategory =
  | 'research' // Researching / learning about a topic
  | 'work' // Work-related tasks
  | 'shopping' // Shopping / browsing products
  | 'social' // Social media / communication
  | 'entertainment' // Entertainment / leisure
  | 'productivity' // Productivity tools / task management
  | 'development' // Software development
  | 'reading' // Reading articles / documentation
  | 'writing' // Writing / content creation
  | 'navigation' // Just navigating / exploring
  | 'troubleshooting' // Debugging / fixing issues
  | 'learning' // Educational content
  | 'unknown'; // Cannot determine

/**
 * Intent template with description and example phrases
 */
interface IntentTemplate {
  category: IntentCategory;
  description: string;
  examples: string[];
  keywords: string[];
  embedding?: number[]; // Will be computed lazily
}

/**
 * Pre-defined intent templates
 * These describe each intent category with examples
 */
const INTENT_TEMPLATES: IntentTemplate[] = [
  {
    category: 'research',
    description: 'Researching and learning about a topic, gathering information',
    examples: [
      'Searching for information about machine learning',
      'Reading documentation about React hooks',
      'Looking up how to solve a problem',
      'Browsing Wikipedia articles',
      'Researching best practices',
    ],
    keywords: ['search', 'documentation', 'wiki', 'learn', 'how to', 'tutorial', 'guide'],
  },
  {
    category: 'work',
    description: 'Work-related tasks, professional activities, business',
    examples: [
      'Checking work email',
      'Reviewing pull requests',
      'Writing business reports',
      'Attending virtual meetings',
      'Managing project tasks',
    ],
    keywords: ['work', 'email', 'meeting', 'project', 'task', 'business', 'professional'],
  },
  {
    category: 'shopping',
    description: 'Shopping online, browsing products, comparing prices',
    examples: [
      'Browsing Amazon products',
      'Comparing laptop prices',
      'Adding items to cart',
      'Reading product reviews',
      'Checking out purchase',
    ],
    keywords: ['shop', 'buy', 'cart', 'price', 'product', 'review', 'checkout'],
  },
  {
    category: 'social',
    description: 'Social media, communication with others, messaging',
    examples: [
      'Scrolling through Twitter feed',
      'Chatting on Discord',
      'Reading LinkedIn posts',
      'Commenting on Facebook',
      'Sending messages',
    ],
    keywords: ['social', 'chat', 'message', 'post', 'comment', 'share', 'like'],
  },
  {
    category: 'entertainment',
    description: 'Entertainment, leisure activities, watching videos, gaming',
    examples: [
      'Watching YouTube videos',
      'Streaming Netflix shows',
      'Playing online games',
      'Browsing Reddit for fun',
      'Listening to music',
    ],
    keywords: ['watch', 'play', 'game', 'video', 'music', 'entertainment', 'fun'],
  },
  {
    category: 'productivity',
    description: 'Productivity tools, task management, organization',
    examples: [
      'Creating TODO lists',
      'Managing calendar events',
      'Taking notes in Notion',
      'Organizing files',
      'Setting up reminders',
    ],
    keywords: ['todo', 'calendar', 'notes', 'organize', 'task', 'reminder', 'productivity'],
  },
  {
    category: 'development',
    description: 'Software development, coding, debugging, version control',
    examples: [
      'Writing code in VS Code',
      'Reviewing GitHub pull requests',
      'Debugging application errors',
      'Running tests',
      'Deploying to production',
    ],
    keywords: ['code', 'github', 'programming', 'debug', 'deploy', 'test', 'development'],
  },
  {
    category: 'reading',
    description: 'Reading articles, blogs, news, long-form content',
    examples: [
      'Reading news articles',
      'Going through blog posts',
      'Reading technical documentation',
      'Browsing Medium articles',
      'Reading research papers',
    ],
    keywords: ['read', 'article', 'blog', 'news', 'documentation', 'paper', 'content'],
  },
  {
    category: 'writing',
    description: 'Writing, content creation, drafting documents',
    examples: [
      'Writing blog posts',
      'Drafting emails',
      'Creating documentation',
      'Composing messages',
      'Editing documents',
    ],
    keywords: ['write', 'edit', 'compose', 'draft', 'create', 'document', 'content'],
  },
  {
    category: 'navigation',
    description: 'Just browsing, exploring, no specific goal',
    examples: [
      'Clicking through links',
      'Exploring a website',
      'Browsing tabs',
      'Opening bookmarks',
      'Navigating menus',
    ],
    keywords: ['browse', 'navigate', 'explore', 'click', 'open', 'visit'],
  },
  {
    category: 'troubleshooting',
    description: 'Troubleshooting issues, debugging problems, fixing errors',
    examples: [
      'Searching for error messages',
      'Reading Stack Overflow answers',
      'Debugging application issues',
      'Troubleshooting network problems',
      'Fixing configuration errors',
    ],
    keywords: ['error', 'bug', 'fix', 'troubleshoot', 'debug', 'issue', 'problem'],
  },
  {
    category: 'learning',
    description: 'Educational content, courses, tutorials, skill development',
    examples: [
      'Taking online courses',
      'Following tutorials',
      'Watching educational videos',
      'Practicing coding challenges',
      'Learning new skills',
    ],
    keywords: ['learn', 'course', 'tutorial', 'education', 'skill', 'practice', 'training'],
  },
];

// Cache for template embeddings
let templateEmbeddings: Array<{ template: IntentTemplate; embedding: number[] }> | null = null;
let isInitialized = false;

/**
 * Initialize intent classification by computing template embeddings
 * This should be called once during extension initialization
 */
export async function initializeIntentClassifier(): Promise<void> {
  if (isInitialized) {
    console.log('[LocalInference] Intent classifier already initialized');
    return;
  }

  console.log('[LocalInference] Initializing intent classifier...');

  try {
    // Preload the embeddings model
    preloadModel();

    // Compute embeddings for each template
    // Combine description, examples, and keywords for richer representation
    templateEmbeddings = await Promise.all(
      INTENT_TEMPLATES.map(async template => {
        const text = [
          template.description,
          ...template.examples,
          ...template.keywords.map(k => `keyword: ${k}`),
        ].join('. ');

        const embedding = await generateEmbedding(text);

        return {
          template,
          embedding,
        };
      })
    );

    isInitialized = true;
    console.log('[LocalInference] ✅ Intent classifier initialized with', templateEmbeddings.length, 'templates');
  } catch (error) {
    console.error('[LocalInference] ❌ Failed to initialize intent classifier:', error);
    throw error;
  }
}

/**
 * Classify intent from event data
 * @param event - Event object with url, title, semantic_context, etc.
 * @returns Intent classification with confidence score
 */
export async function classifyIntent(event: {
  type: string;
  url: string;
  title?: string;
  semantic_context?: any;
  document_context?: any;
}): Promise<{
  category: IntentCategory;
  confidence: number;
  topCandidates: Array<{ category: IntentCategory; confidence: number }>;
}> {
  // Ensure classifier is initialized
  if (!isInitialized || !templateEmbeddings) {
    await initializeIntentClassifier();
    if (!templateEmbeddings) {
      throw new Error('Failed to initialize intent classifier');
    }
  }

  try {
    // Generate embedding for the event
    const eventEmbedding = await embedEvent(event);

    // Find most similar templates
    const results = findMostSimilar(
      eventEmbedding,
      templateEmbeddings.map(t => ({ embedding: t.embedding, data: t.template })),
      5 // Top 5 candidates
    );

    // Get top result
    const topResult = results[0];

    return {
      category: topResult.data.category,
      confidence: topResult.similarity,
      topCandidates: results.map(r => ({
        category: r.data.category,
        confidence: r.similarity,
      })),
    };
  } catch (error) {
    console.error('[LocalInference] Failed to classify intent:', error);
    return {
      category: 'unknown',
      confidence: 0,
      topCandidates: [],
    };
  }
}

/**
 * Classify intent from text description
 * Simpler version that takes raw text instead of event object
 * @param text - Text description of the activity
 * @returns Intent classification
 */
export async function classifyIntentFromText(text: string): Promise<{
  category: IntentCategory;
  confidence: number;
}> {
  if (!isInitialized || !templateEmbeddings) {
    await initializeIntentClassifier();
    if (!templateEmbeddings) {
      throw new Error('Failed to initialize intent classifier');
    }
  }

  try {
    const textEmbedding = await generateEmbedding(text);

    const results = findMostSimilar(
      textEmbedding,
      templateEmbeddings.map(t => ({ embedding: t.embedding, data: t.template })),
      1
    );

    return {
      category: results[0].data.category,
      confidence: results[0].similarity,
    };
  } catch (error) {
    console.error('[LocalInference] Failed to classify intent from text:', error);
    return {
      category: 'unknown',
      confidence: 0,
    };
  }
}

/**
 * Classify multiple events in batch
 * More efficient than calling classifyIntent multiple times
 * @param events - Array of events to classify
 * @returns Array of classifications
 */
export async function classifyIntentBatch(
  events: Array<{
    type: string;
    url: string;
    title?: string;
    semantic_context?: any;
    document_context?: any;
  }>
): Promise<
  Array<{
    category: IntentCategory;
    confidence: number;
  }>
> {
  if (!isInitialized || !templateEmbeddings) {
    await initializeIntentClassifier();
    if (!templateEmbeddings) {
      throw new Error('Failed to initialize intent classifier');
    }
  }

  try {
    // Generate embeddings for all events in parallel
    const eventEmbeddings = await Promise.all(events.map(e => embedEvent(e)));

    // Classify each event
    const classifications = eventEmbeddings.map(embedding => {
      const results = findMostSimilar(
        embedding,
        templateEmbeddings!.map(t => ({ embedding: t.embedding, data: t.template })),
        1
      );

      return {
        category: results[0].data.category,
        confidence: results[0].similarity,
      };
    });

    return classifications;
  } catch (error) {
    console.error('[LocalInference] Failed to classify batch:', error);
    return events.map(() => ({ category: 'unknown' as IntentCategory, confidence: 0 }));
  }
}

/**
 * Get template information for a specific category
 * Useful for explaining why a classification was made
 */
export function getTemplateInfo(category: IntentCategory): IntentTemplate | null {
  const template = INTENT_TEMPLATES.find(t => t.category === category);
  return template || null;
}

/**
 * Get all available intent categories
 */
export function getIntentCategories(): IntentCategory[] {
  return INTENT_TEMPLATES.map(t => t.category);
}

/**
 * Check if classifier is ready
 */
export function isClassifierReady(): boolean {
  return isInitialized && templateEmbeddings !== null;
}

/**
 * Get classifier statistics
 */
export function getClassifierStats(): {
  initialized: boolean;
  templates: number;
  categories: IntentCategory[];
} {
  return {
    initialized: isInitialized,
    templates: INTENT_TEMPLATES.length,
    categories: INTENT_TEMPLATES.map(t => t.category),
  };
}

