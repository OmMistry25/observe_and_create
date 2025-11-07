# Testing MVP Local-First Architecture

**Branch:** `feature/mvp-local-first`  
**Build Status:** ✅ Successful  
**Date:** November 7, 2025

---

## 📋 Pre-Testing Checklist

### Build Verification ✅
- ✅ Storage package compiles successfully
- ✅ Extension builds without errors
- ✅ Output files generated:
  - `dist/background.js` (17.04 KB)
  - `dist/content.js` (48.94 KB)
  - `dist/popup.js` (2.77 KB)
  - `dist/assets/local-db-*.js` (91.34 KB - SQL.js)

### Known Build Warnings
```
[plugin:vite:resolve] Module "fs/path/crypto" externalized for browser compatibility
```
**Status:** ⚠️ Expected - sql.js tries to import Node.js modules but has browser fallbacks

---

## 🧪 Testing Instructions

### 1. Load Extension in Chrome

```bash
# Navigate to extension directory
cd /Users/ommistry/observe_and_create/apps/extension

# Build extension (if not already done)
pnpm build
```

**Steps:**
1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `/Users/ommistry/observe_and_create/apps/extension/dist`
6. Verify extension loads without errors

**Expected Result:**
- ✅ Extension icon appears in toolbar
- ✅ No errors in `chrome://extensions/` 
- ✅ Console shows: `[Background] Service worker started`

---

### 2. Test Local Database Initialization

**Steps:**
1. Click extension icon → Open popup
2. Open browser DevTools (F12)
3. Go to Console tab
4. Look for initialization logs

**Expected Console Output:**
```
[Background] Service worker started
[Background] ✅ Local database initialized
[LocalDB] Initialization complete
[LocalDB] Schema created successfully
```

**Verify Storage:**
1. Open DevTools → Application tab
2. Check "IndexedDB" → should see `observe-create-db`
3. Check "Storage" → "Local Storage" → should see database backup

**Test Commands:**
```javascript
// In console
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Database stats:', response.stats);
});
```

**Expected Response:**
```javascript
{
  success: true,
  stats: {
    eventCount: 0,
    profileCount: 0,
    patternCount: 0,
    sessionCount: 0
  }
}
```

---

### 3. Test Event Capture

**Steps:**
1. Navigate to any website (e.g., `https://github.com`)
2. Perform actions:
   - Click on elements
   - Scroll the page
   - Switch tabs
   - Come back to the tab
3. Open DevTools Console
4. Look for event capture logs

**Expected Console Output:**
```
[Content] Event captured: click on BUTTON (context: 0 events)
[Content] Event captured: scroll on element (context: 1 events)
[Content] Window blurred, focus duration: 5234 ms
[Content] Window focused, blur duration: 3456 ms
[Background] Saving 5 events to local database...
[Background] ✅ Saved 5 events successfully to local database
```

**Verify Events Stored:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Events captured:', response.stats.eventCount);
});
```

---

### 4. Test Pattern Detection

**Steps:**
1. Perform a repetitive action 3+ times:
   - Click same button 3 times
   - Or navigate: Home → About → Home → About → Home → About
2. Watch console for pattern detection

**Expected Console Output:**
```
[PatternDetector] 🎯 New pattern detected! {
  windowSize: 2,
  sequence: 'click → click',
  occurrences: 3,
  confidence: '45%',
  avgTimeGap: '2s'
}
[PatternDetector] Saved pattern pattern-xxx to database
```

**Verify Patterns:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Patterns detected:', response.stats.patternCount);
});
```

---

### 5. Test Glue Events

**Steps:**
1. Focus on browser window
2. Switch to another application
3. Come back to browser
4. Minimize browser
5. Restore browser
6. Leave browser idle for 60+ seconds
7. Move mouse

**Expected Console Output:**
```
[Content] Window blurred, focus duration: 12345 ms
[Content] Window focused, blur duration: 5678 ms
[Content] Page hidden, dwell time: 8765 ms
[Content] Page visible, away time: 4321 ms
[Content] User went idle
[Content] User returned from idle, idle duration: 62000 ms
```

---

### 6. Test Timestamp Accuracy

**Steps:**
1. Capture an event
2. Check database

**Verify:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_EXPORT_SUMMARY' }, (response) => {
  console.log('Export summary:', response.summary);
});
```

**Check Event Format:**
Events should have:
- ✅ `client_timestamp` (number, Unix ms)
- ✅ `local_timestamp` (string, ISO 8601)
- ✅ `timezone_offset` (number, minutes from UTC)

---

### 7. Test Data Export

**Steps:**
1. Capture some events (at least 10)
2. Test export functions:

```javascript
// Export all data as JSON
chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, (response) => {
  console.log('Export result:', response);
});

// Export events as CSV
chrome.runtime.sendMessage({ type: 'EXPORT_EVENTS_CSV' }, (response) => {
  console.log('CSV export result:', response);
});

// Export patterns
chrome.runtime.sendMessage({ type: 'EXPORT_PATTERNS' }, (response) => {
  console.log('Patterns export result:', response);
});
```

**Expected Result:**
- ✅ Download dialog appears
- ✅ Files saved: `observe-create-export-YYYY-MM-DD.json`
- ✅ JSON contains events, patterns, profiles, sessions
- ✅ CSV contains event data in proper format

---

### 8. Test Page Profiler

**Steps:**
1. Visit a page 3+ times (same URL)
2. Check console

**First 2 Visits:**
```
[PageProfiler] ⏭️ Skipping DOM extraction for infrequent page
```

**3rd Visit:**
```
[PageProfiler] Analyzing new page: https://example.com/page
[PageProfiler] ✅ Extracted DOM context for frequent page (3 visits)
[PageProfiler] ✅ Saved profile for example.com/page to local database
```

**Verify Profiles:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Page profiles:', response.stats.profileCount);
});
```

---

### 9. Test Context Completeness

**Steps:**
1. Capture events
2. Export data
3. Check semantic_context field

**Verify Each Event Has:**
```javascript
{
  semantic_context: {
    temporalContext: {
      localTime: "2025-11-07T...",
      timeOfDay: "morning/afternoon/evening",
      dayOfWeek: "Monday",
      isWorkHours: true/false
    },
    journeyState: {
      sessionIndex: 5,
      interactionCount: 12
    },
    pageMetadata: {
      title: "Page Title",
      type: "...",
      category: "..."
    }
  }
}
```

**Success Criteria:** ✅ 80%+ of events have complete semantic context

---

### 10. Test Extension Persistence

**Steps:**
1. Capture 20+ events
2. Close browser completely
3. Reopen browser
4. Check database stats

**Expected:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Events persisted:', response.stats.eventCount); // Should be 20+
});
```

**Verify:**
- ✅ Events persist across browser restarts
- ✅ Patterns persist
- ✅ Page profiles persist

---

## 🔍 Manual Testing Scenarios

### Scenario 1: Daily Workflow Simulation
1. Open browser
2. Visit GitHub (5 times)
3. Visit LinkedIn (3 times)
4. Perform clicks, scrolls
5. Switch tabs
6. Close and reopen
7. Check database has:
   - ✅ Events from all visits
   - ✅ Page profiles for GitHub, LinkedIn
   - ✅ Patterns detected

### Scenario 2: Pattern Detection Validation
1. Perform action sequence: `A → B → C`
2. Repeat 3 times within 5 minutes
3. Verify pattern detected with:
   - ✅ Window size: 3
   - ✅ Occurrences: ≥3
   - ✅ Confidence: >0.3

### Scenario 3: Storage Limits
1. Capture 1000+ events
2. Check storage usage
3. Verify performance remains good
4. Export data successfully

---

## 🐛 Known Issues & Limitations

### Current Limitations
1. **No cloud sync** - Data only local (by design)
2. **No temporal patterns yet** - Only frequency-based (Phase 2)
3. **No local LLM yet** - Semantic context is rule-based (Phase 3)
4. **No dashboard UI yet** - Only console/export (Phase 4)

### Expected Warnings
- SQL.js Node module externalization (browser compatible)
- Extension context invalidation during development (normal)

---

## ✅ Success Criteria Checklist

### Critical Features
- [ ] Extension loads without errors
- [ ] Local database initializes
- [ ] Events save to SQLite
- [ ] Timestamps are accurate (no +12h bug)
- [ ] Pattern detection works (2-7 event windows)
- [ ] Glue events fire correctly
- [ ] Data persists across restarts
- [ ] Export functionality works
- [ ] 80%+ semantic context completeness
- [ ] Page profiling works (3+ visit threshold)

### Performance
- [ ] Event capture < 5ms overhead
- [ ] Database save < 100ms
- [ ] Pattern detection < 50ms
- [ ] Storage usage reasonable (<50MB for 1000 events)

### Privacy
- [ ] No network requests (except SQL.js CDN for initialization)
- [ ] All data in IndexedDB/chrome.storage
- [ ] User can export all data
- [ ] No telemetry or tracking

---

## 📊 Testing Results Template

```markdown
## Test Results - [Date]

**Tester:** [Name]
**Browser:** Chrome [Version]
**OS:** [OS Version]

### Build Status
- [ ] Extension builds successfully
- [ ] No compilation errors
- [ ] Load unpacked works

### Database
- [ ] SQLite initializes
- [ ] Schema creates correctly
- [ ] Events save successfully
- [ ] Stats API works

### Event Capture
- [ ] Click events captured
- [ ] Navigation events captured
- [ ] Scroll events captured
- [ ] Glue events (focus/blur/idle) work

### Pattern Detection
- [ ] Patterns detected at various window sizes
- [ ] Confidence scoring works
- [ ] Patterns save to database

### Data Export
- [ ] JSON export works
- [ ] CSV export works
- [ ] Export summary accurate

### Issues Found
1. [List any issues]

### Performance Notes
- Event count after 30 min: [X]
- Storage usage: [X MB]
- Pattern count: [X]
```

---

## 🚀 Next Steps After Testing

1. **If tests pass:**
   - Mark todos as complete
   - Document any edge cases
   - Proceed with Phase 2 (Temporal Patterns)

2. **If tests fail:**
   - Document failures
   - Create GitHub issues
   - Fix critical bugs before proceeding

3. **Performance issues:**
   - Profile slow operations
   - Optimize database queries
   - Adjust buffer sizes

---

## 📞 Support

**Issues:** Create in GitHub with `testing` label  
**Questions:** Review `docs/MVP_LOCAL_FIRST.md` and `docs/MVP_IMPLEMENTATION_STATUS.md`


