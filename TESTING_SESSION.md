# Live Testing Session - MVP Local-First

**Date:** November 7, 2025  
**Tester:** Om Mistry  
**Status:** In Progress 🔄

---

## Session Checklist

### Pre-Test Setup
- [ ] Extension built successfully
- [ ] Chrome browser ready
- [ ] DevTools knowledge confirmed

### Test 1: Extension Loading
- [ ] Navigated to `chrome://extensions/`
- [ ] Developer mode enabled
- [ ] Extension loaded from dist folder
- [ ] No errors in extension page
- [ ] Extension icon visible in toolbar

**Console Output:**
```
[Record output here]
```

**Issues:** None yet

---

### Test 2: Database Initialization
- [ ] Opened DevTools (F12)
- [ ] Checked Console tab
- [ ] Saw initialization logs
- [ ] Verified IndexedDB created
- [ ] Checked chrome.storage.local backup

**Expected Logs:**
```
[Background] Service worker started
[Background] ✅ Local database initialized
[LocalDB] Initialization complete
[LocalDB] Schema created successfully
```

**Actual Logs:**
```
[Record output here]
```

**Database Stats Test:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Database stats:', response);
});
```

**Result:**
```
[Record output here]
```

---

### Test 3: Event Capture
- [ ] Visited test website
- [ ] Performed clicks
- [ ] Scrolled page
- [ ] Switched tabs
- [ ] Returned to tab
- [ ] Saw event logs in console

**Test Actions:**
1. Navigate to: https://github.com
2. Click on 3-5 elements
3. Scroll up and down
4. Switch to another tab
5. Wait 5 seconds
6. Switch back

**Console Output:**
```
[Record all [Content] and [Background] logs here]
```

**Verify Events Saved:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Events captured:', response.stats.eventCount);
});
```

**Event Count:** [Record here]

---

### Test 4: Pattern Detection
- [ ] Performed repetitive action
- [ ] Saw pattern detection log
- [ ] Pattern saved to database

**Test Pattern:**
Repeat this 3 times: Click GitHub logo → Click About

**Expected:**
```
[PatternDetector] 🎯 New pattern detected!
```

**Actual:**
```
[Record output here]
```

**Pattern Count:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Patterns:', response.stats.patternCount);
});
```

**Result:** [Record here]

---

### Test 5: Glue Events
- [ ] Tested window focus/blur
- [ ] Tested page visibility
- [ ] Tested idle detection

**Actions:**
1. Focus browser window → Switch away → Return
2. Minimize browser → Restore
3. Leave idle for 60+ seconds → Move mouse

**Console Output:**
```
[Record glue event logs here]
```

---

### Test 6: Timestamps
- [ ] Exported data
- [ ] Checked timestamp fields
- [ ] Verified timezone offset

**Export Test:**
```javascript
chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, (response) => {
  console.log('Export result:', response);
});
```

**Timestamp Check:**
- [ ] client_timestamp present (number)
- [ ] local_timestamp present (ISO string)
- [ ] timezone_offset present (number)

**Sample Event:**
```json
[Paste one event object here]
```

---

### Test 7: Data Export
- [ ] JSON export worked
- [ ] CSV export worked
- [ ] Patterns export worked
- [ ] Files downloaded

**Commands Run:**
```javascript
// Export all data
chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, console.log);

// Export CSV
chrome.runtime.sendMessage({ type: 'EXPORT_EVENTS_CSV' }, console.log);

// Export patterns
chrome.runtime.sendMessage({ type: 'EXPORT_PATTERNS' }, console.log);
```

**Files Downloaded:**
- [ ] observe-create-export-*.json
- [ ] observe-create-events-*.csv
- [ ] observe-create-patterns-*.json

**File Sizes:** [Record here]

---

### Test 8: Page Profiler
- [ ] Visited same page 3 times
- [ ] First 2 visits skipped profiling
- [ ] 3rd visit extracted DOM
- [ ] Profile saved to database

**Test Page:** https://github.com/OmMistry25/observe_and_create

**Visit 1:**
```
[Record log]
```

**Visit 2:**
```
[Record log]
```

**Visit 3:**
```
[Record log]
```

**Profile Count:**
```javascript
chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response) => {
  console.log('Profiles:', response.stats.profileCount);
});
```

**Result:** [Record here]

---

### Test 9: Persistence
- [ ] Captured 20+ events
- [ ] Closed browser completely
- [ ] Reopened browser
- [ ] Events still present

**Before Close:**
- Event Count: [Record]
- Pattern Count: [Record]
- Profile Count: [Record]

**After Reopen:**
- Event Count: [Record]
- Pattern Count: [Record]
- Profile Count: [Record]

**Persistence:** ✅ Pass / ❌ Fail

---

### Test 10: Context Completeness
- [ ] Exported data
- [ ] Checked semantic_context fields
- [ ] Verified 80%+ completeness

**Sample Event with Context:**
```json
[Paste full event with semantic_context here]
```

**Context Check:**
- [ ] temporalContext present
- [ ] journeyState present
- [ ] pageMetadata present

**Completeness:** [X]% of events have full context

---

## Performance Testing

### Storage Usage
```javascript
// Check storage
navigator.storage.estimate().then(console.log);
```

**Result:** [Record here]

### Event Capture Performance
- Average capture time: [Measure with console.time()]
- Database save time: [Record]
- Pattern detection time: [Record]

---

## Issues Found

### Critical Issues 🔴
[List any critical issues that prevent basic functionality]

### Minor Issues 🟡
[List any minor issues or unexpected behavior]

### Warnings ⚠️
[List any warnings or informational items]

---

## Overall Assessment

### What Works ✅
[List all working features]

### What Doesn't Work ❌
[List all broken features]

### Performance 📊
- Event capture overhead: [Record]
- Database operations: [Record]
- Extension responsiveness: Good / Fair / Poor

### Privacy Verification 🔒
- [ ] No network calls observed (check Network tab)
- [ ] All data in IndexedDB
- [ ] Export works correctly

---

## Recommendations

### Must Fix Before Beta
[List critical items]

### Should Fix
[List important items]

### Nice to Have
[List enhancement ideas]

---

## Next Steps

Based on testing results:
1. [Action item 1]
2. [Action item 2]
3. [Action item 3]

---

**Session End Time:** [Record when done]  
**Total Testing Time:** [Calculate]  
**Overall Status:** ✅ Pass / ⚠️ Pass with Issues / ❌ Fail


