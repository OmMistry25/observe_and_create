# Development Guides & Technical Documentation

This document contains technical guides, bug fixes, improvements, and development notes.

## Pattern Mining Fix

### The Root Cause

The previous pattern mining SQL had a fundamental logic error in how it created and grouped sequences.

**What Was Wrong:**
```sql
--  BROKEN LOGIC
GROUP BY user_id, (ts::DATE), id, type, url  -- Groups by individual event IDs
HAVING COUNT(*) >= 3  -- Always 1, never >= 3
```

**The Fix:**
1. Create sliding windows of 3 consecutive events
2. Extract pattern keys from those sequences (type:domain)
3. Group by pattern_key to count how many times the same pattern occurs
4. Filter by support to keep only recurring patterns

See migration `20240101000015_proper_pattern_grouping.sql` for implementation details.

## Insight Improvements

### What Was Changed

Insights were too vague. Now they include:
-  **Specific domains** where friction occurred
-  **Friction type breakdown** with counts
-  **Exact workflow steps** with page titles
-  **Goal-specific context** and recommendations

### Before vs After

**Before:** "This workflow has high friction"
**After:** "This workflow on chatgpt.com, canvas.illinois.edu has an average friction score of 60%. You scrolled rapidly 8 time(s), suggesting difficulty finding information. Your goal was 'research_topic'. Consider alternative tools or approaches for this task."

## Test Results Summary

### Phase 1 Test Status (85% Complete)

**Database Tests**:  11/15 passing
- URL path tests:  4/4
- Page profiles:  3/5 (test isolation)
- Frequent subpaths:  4/6 (materialized view refresh)

**Extension Tests**:  13/29 passing
- Core functionality working
- Some CSS selector issues identified

**Next Steps:**
- Fix CSS selector typo (`itempr op` → `itemprop`)
- Run API and E2E test suites
- Deploy to staging for real-world testing

## Pattern Grouping Fix

Fixed issue where patterns weren't being properly grouped due to incorrect SQL grouping logic. The fix ensures:
- Sequences are correctly identified
- Pattern keys are normalized for matching
- Support counts reflect actual pattern occurrences

## Smart Pattern Weighting

Improved pattern scoring by:
- Weighting patterns by recency
- Considering pattern confidence scores
- Adjusting for user account age
- Prioritizing high-friction patterns for automation suggestions

## Semantic Enrichment

Enhanced event context with:
- Intent classification (research, transaction, comparison, creation, communication)
- Entity extraction from page content
- Temporal context (time of day, day of week)
- Journey state (session progress, return visits)

## Semantic Intelligence

Advanced pattern analysis including:
- Semantic clustering of similar workflows
- Cross-domain pattern matching
- Intent-based pattern grouping
- Context-aware automation suggestions

---

For more detailed information on any specific topic, see:
- [Pattern Mining Fix Explained](PATTERN_MINING_FIX_EXPLAINED.md) - Detailed SQL fix explanation
- [Pattern Grouping Fix](PATTERN_GROUPING_FIX.md) - Grouping logic corrections
- [Insight Improvements](INSIGHT_IMPROVEMENTS.md) - Enhanced insight specificity
- [Test Results Summary](TEST_RESULTS_SUMMARY.md) - Complete test execution details

