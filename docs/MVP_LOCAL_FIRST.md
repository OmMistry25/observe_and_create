# MVP Local-First Architecture

## Overview
Transform Observe & Create into a privacy-first, local-only MVP by replacing cloud Supabase with local storage, improving pattern detection algorithms, integrating local LLM for inference, and enabling dashboard to read from local storage.

## Problems Being Solved

1. **Supabase sync instability** - Data collected locally but not uploading, causing data loss
2. **Brute-forced pattern detection** - Only looks at last 3 events, missing complex patterns
3. **Privacy/security concerns** - Data sent to cloud and OpenAI models
4. **Data quality issues** - Timestamp skew, context gaps, missing fields

## Architecture Changes

### Current Architecture
```
Extension → Supabase (cloud) → Web Dashboard
              ↓
          OpenAI API (embeddings, intent)
```

### New Architecture
```
Extension → SQLite (local) → Extension Dashboard
              ↓
          Transformers.js (local embeddings, intent)
```

---

## Phase 1: Local Storage Foundation

### 1.1 Replace Supabase with SQLite WASM
**Goal:** Eliminate cloud dependency and sync issues

**Implementation:**
- Install `wa-sqlite` or `sql.js` in extension
- Create database schema matching current structure:
  - `events` table (id, timestamp, type, url, domain, url_path, semantic_context, document_context, device_id)
  - `page_profiles` table (url_path, visit_count, dom_profile, last_updated)
  - `patterns` table (id, sequence, occurrences, confidence, first_seen, last_seen, pattern_type)
  - `sessions` table (session_id, start_time, end_time, event_count)
- Implement CRUD operations in new `packages/storage/src/local-db.ts`
- Add automatic backup to `chrome.storage.local` (compressed JSON)

**Files to modify:**
- `apps/extension/src/background.ts` - Replace Supabase upload with local SQLite inserts
- `apps/extension/src/content.ts` - Remove Supabase init, use local storage
- `apps/extension/src/pageProfiler.ts` - Replace Supabase page_profiles with SQLite

**Rationale:** SQLite provides SQL querying power locally, eliminating all network issues and providing 100% reliability.

### 1.2 Add IndexedDB as Backup Queue
**Goal:** Ensure zero data loss even during extension context invalidation

**Implementation:**
- Keep existing `offline-queue.ts` for temporary buffering
- Events flow: Content → Background → SQLite (primary) → IndexedDB (backup if SQLite fails)
- Periodic sync from IndexedDB to SQLite when context restores

**Files to modify:**
- `apps/extension/src/offline-queue.ts` - Enhance to work with SQLite fallback
- `apps/extension/src/background.ts` - Add dual-write logic

---

## Phase 2: Intelligent Pattern Detection

### 2.1 Dynamic Sliding Window Analysis
**Goal:** Detect patterns of varying lengths (2-7 events), not just last 3

**Implementation:**
- Replace fixed `SEQUENCE_LENGTH = 3` with dynamic window (2-7 events)
- For each window size, maintain frequency map: `Map<sequenceKey, count>`
- Pattern confidence based on:
  - Frequency (occurrences / total sequences)
  - Recency (recent occurrences weighted higher)
  - Consistency (standard deviation of time gaps)

**Algorithm:**
```typescript
// For each window size L ∈ [2,3,4,5,6,7]
for (let L = 2; L <= 7; L++) {
  // Extract all L-length sequences from buffer
  for (let i = 0; i <= buffer.length - L; i++) {
    const seq = buffer.slice(i, i + L);
    const key = createSequenceKey(seq);
    frequencyMap[L].set(key, (frequencyMap[L].get(key) || 0) + 1);
  }
}

// Detect patterns with >= 3 occurrences and > 0.1 confidence
```

**Files to modify:**
- `apps/extension/src/patternDetector.ts` - Complete rewrite with multi-window analysis

### 2.2 Temporal Pattern Detection
**Goal:** Detect time-based patterns (daily routines, weekly patterns)

**Implementation:**
- Track sequences with timestamps
- Group by: hour-of-day, day-of-week, time-since-last-event
- Detect patterns like:
  - "Every Monday 9am: Open Canvas → Check assignments"
  - "After email: Open LinkedIn within 5 minutes"
  - "Every evening: GitHub → localhost → Supabase"

**Algorithm:**
```typescript
// Group sequences by temporal features
temporalPatterns = {
  hourOfDay: Map<hour, Sequence[]>,
  dayOfWeek: Map<day, Sequence[]>,
  triggered: Map<eventType, Sequence[]> // "After X happens"
}

// Detect if sequence happens at specific times with >60% consistency
```

**Files to create:**
- `apps/extension/src/temporalPatternDetector.ts` - New temporal analysis module

### 2.3 Semantic Clustering
**Goal:** Group functionally similar but structurally different sequences

**Implementation:**
- Generate embeddings for sequences (using local model from Phase 3)
- Cluster similar sequences using cosine similarity (threshold 0.85)
- Example: "GitHub → PR review → approve" and "GitHub → Issues → close" both map to "github_workflow"

**Files to create:**
- `apps/extension/src/semanticClustering.ts` - Embedding-based pattern clustering

---

## Phase 3: Local LLM Integration

### 3.1 Local Embeddings with Transformers.js
**Goal:** Replace any external embedding calls with browser-based model

**Implementation:**
- Install `@xenova/transformers` (Transformers.js)
- Use `Xenova/all-MiniLM-L6-v2` (23MB quantized model)
- Cache model in `chrome.storage.local` or IndexedDB
- Generate embeddings in background worker

**Code example:**
```typescript
import { pipeline } from '@xenova/transformers';

let embedder = null;

async function initEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await initEmbedder();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
```

**Files to create:**
- `apps/extension/src/localEmbeddings.ts` - Transformers.js integration
- Replace `packages/ingest/src/embeddings.ts` usage in extension

### 3.2 Local Intent Classification
**Goal:** Replace OpenAI goal inference with local classification

**Implementation:**
- **Option A:** Use Chrome Built-in AI (Gemini Nano) - experimental but perfect for this
  - Check if available: `window.ai.canCreateTextSession()`
  - Use for intent classification: "shopping", "learning", "productivity", etc.
  
- **Option B:** Fine-tuned TinyBERT for classification
  - Use `Xenova/distilbert-base-uncased-finetuned-sst-2-english`
  - Map sentiment/features to intent categories
  
- **Option C:** Rule-based classification with embedding similarity
  - Pre-compute embeddings for intent templates
  - Classify by finding closest template

**Implementation choice:** Start with Option C (most reliable), add Option A when Chrome AI stable

**Algorithm (Option C):**
```typescript
const intentTemplates = {
  shopping: "user browsing products, comparing prices, adding to cart",
  learning: "user reading articles, watching tutorials, taking notes",
  productivity: "user checking email, managing tasks, scheduling",
  // ... more templates
};

async function classifyIntent(sequence: Event[]): Promise<string> {
  const seqEmbedding = await generateEmbedding(summarizeSequence(sequence));
  
  let bestMatch = null;
  let highestSimilarity = 0;
  
  for (const [intent, template] of Object.entries(intentTemplates)) {
    const templateEmbedding = await generateEmbedding(template);
    const similarity = cosineSimilarity(seqEmbedding, templateEmbedding);
    
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = intent;
    }
  }
  
  return bestMatch;
}
```

**Files to create:**
- `apps/extension/src/localInference.ts` - Local intent classification
- Replace `packages/automation/src/goal-inference.ts` OpenAI calls

---

## Phase 4: Dashboard Integration

### 4.1 Local HTTP Server (Optional)
**Goal:** Dashboard connects to extension via localhost API

**Implementation:**
- Extension spawns local HTTP server on `localhost:9876` using Service Worker fetch events
- Dashboard connects via `fetch('http://localhost:9876/api/events')`
- CORS handled automatically (same machine)

**Alternative:** Export/Import via JSON files
- Extension provides "Export Data" button → downloads JSON
- Dashboard has "Import Data" button → loads from file
- Simpler but less real-time

**Recommendation:** Start with export/import, add HTTP server later if needed

### 4.2 Extension Message Bridge (RECOMMENDED)
**Goal:** Dashboard (as extension page) reads directly from extension storage

**Implementation:**
- Dashboard page runs as `chrome-extension://[id]/dashboard.html`
- Direct access to `chrome.storage.local` and SQLite database
- No network calls, 100% local

**This is the recommended approach:** Fastest and most reliable

**Files to modify:**
- `apps/web/app/dashboard/page.tsx` - Create extension-compatible version
- Create `apps/extension/dashboard/` folder with standalone dashboard

### 4.3 Data Export API
**Goal:** Users can export all data for external analysis

**Implementation:**
- Add "Export All Data" button in extension popup
- Generates comprehensive JSON export:
  - All events
  - All patterns
  - All page profiles
  - Metadata (date range, event count, etc.)
- Zip and download via `chrome.downloads.download()`

**Files to create:**
- `apps/extension/src/export.ts` - Data export utilities

---

## Phase 5: Fix Data Quality Issues

### 5.1 Fix Timestamp Issues
**Goal:** Eliminate +12h correction, ensure accurate timestamps

**Implementation:**
- Store both `client_timestamp` (Date.now()) and `local_timestamp` (new Date().toISOString())
- Add timezone offset field: `timezone_offset: new Date().getTimezoneOffset()`
- Server-side (if ever re-added): Use `client_timestamp` for ordering, display with timezone

**Files to modify:**
- `apps/extension/src/content.ts` - Update timestamp generation in `captureEvent()`

### 5.2 Ensure Context Completeness
**Goal:** Achieve 80%+ semantic context, 60%+ document context

**Implementation:**
- Make semantic context non-optional with default fallback:
  ```typescript
  const semanticContext = extractSemanticContext() || {
    temporalContext: { localTime: new Date().toISOString() },
    journeyState: { sessionIndex: contextEvents.length },
    pageMetadata: { title: document.title, type: 'unknown' }
  };
  ```
- Document context extracted via PageProfiler - already working
- Add validation before storage: reject events missing critical fields

**Files to modify:**
- `apps/extension/src/content.ts` - Add fallback semantic context
- Add validation function `validateEventCompleteness()`

### 5.3 Add Glue Events
**Goal:** Increase session quality with focus/blur/visibility events

**Implementation:**
- Add event listeners:
  - `window.addEventListener('focus')` → capture "window_focus"
  - `window.addEventListener('blur')` → capture "window_blur" with dwell time
  - `document.addEventListener('visibilitychange')` → capture visibility state
- These provide critical context for pattern boundaries

**Files to modify:**
- `apps/extension/src/content.ts` - Add glue event listeners

---

## Phase 6: Testing & Validation

### 6.1 Data Migration Script
**Goal:** Migrate existing Supabase data to local SQLite

**Implementation:**
- Script to export from Supabase
- Import into local SQLite
- Validate data integrity
- Run as one-time migration for existing users

**Files to create:**
- `apps/extension/src/migrate-from-supabase.ts`

### 6.2 Validation Dashboard
**Goal:** Real-time health metrics for data collection quality

**Implementation:**
- Show in extension popup:
  - Events captured today
  - Upload success rate (100% for local storage)
  - Active patterns count
  - Storage usage
  - Data quality score (% with complete context)

**Files to modify:**
- `apps/extension/src/popup.ts` - Add health metrics section

### 6.3 E2E Testing
**Goal:** Verify all functionality works without cloud

**Test cases:**
1. Fresh install → capture events → verify in SQLite
2. Pattern detection → verify patterns stored
3. Context invalidation → verify IndexedDB backup works
4. Data export → verify complete export
5. Dashboard → verify reads from local storage

**Files to create:**
- `tests/e2e/local-storage.test.ts`

---

## Success Criteria

After implementation:
- ✅ Zero Supabase/cloud dependencies in extension
- ✅ 100% upload success rate (local storage)
- ✅ Patterns detected at multiple window sizes (2-7 events)
- ✅ Temporal patterns identified (daily, weekly)
- ✅ Semantic clustering working with local embeddings
- ✅ Intent classification without OpenAI
- ✅ Dashboard reads from local storage
- ✅ Timestamps accurate (no correction needed)
- ✅ 80%+ events with semantic context
- ✅ 60%+ events with document context
- ✅ Data export working
- ✅ No extension context invalidation errors
- ✅ Storage usage < 100MB for typical user (1 month data)

---

## Implementation Timeline

1. **Week 1:** Phase 1 (Local Storage) - Critical foundation
2. **Week 2:** Phase 2 (Pattern Detection) - Core intelligence
3. **Week 3:** Phase 3 (Local LLM) - Privacy/security
4. **Week 4:** Phase 4 (Dashboard) - User experience
5. **Week 5:** Phase 5 (Data Quality) - Polish
6. **Week 6:** Phase 6 (Testing) - Validation & deployment

---

## Key Technical Decisions

1. **Storage:** SQLite WASM (primary) + IndexedDB (backup queue)
2. **Embeddings:** Transformers.js with Xenova/all-MiniLM-L6-v2
3. **Intent:** Rule-based with embedding similarity (initially), Chrome AI (when stable)
4. **Dashboard:** Extension page accessing chrome.storage directly
5. **Pattern Detection:** Multi-window sliding analysis (2-7 events)

---

## Files to Create/Modify Summary

### New packages:
- `packages/storage/` - Local database abstraction

### Extension modifications:
- `src/background.ts` - SQLite integration, remove Supabase
- `src/content.ts` - Fix timestamps, add glue events, remove Supabase
- `src/patternDetector.ts` - Complete rewrite with multi-window
- `src/pageProfiler.ts` - Use SQLite instead of Supabase

### Extension additions:
- `src/localEmbeddings.ts` - Transformers.js integration
- `src/localInference.ts` - Local intent classification
- `src/temporalPatternDetector.ts` - Time-based patterns
- `src/semanticClustering.ts` - Embedding-based clustering
- `src/export.ts` - Data export utilities
- `src/migrate-from-supabase.ts` - One-time migration
- `dashboard/` - Standalone dashboard as extension page

---

## Total Estimated Effort

**6 weeks** (can be parallelized with 2 developers to 3-4 weeks)

---

**Created:** November 7, 2025  
**Branch:** `feature/mvp-local-first`  
**Status:** Ready for implementation

