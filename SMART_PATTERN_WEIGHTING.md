# Smart Pattern Weighting System

## Overview
The pattern mining system now uses **intelligent temporal and semantic weighting** instead of simple frequency counting. This ensures that recent, high-quality patterns are prioritized while not completely discarding valuable older patterns.

## Key Changes

### 1. Reduced Support Threshold
- **Before**: Minimum 3 occurrences
- **After**: Minimum 2 occurrences
- **Why**: Catch emerging patterns earlier, more responsive to user behavior changes

### 2. Event Quality Score (0.3 - 1.0)

Each event is scored based on semantic richness:

| Component | Points | Criteria |
|-----------|--------|----------|
| **Base** | 0.2 | All events |
| **Purpose** | +0.2 | Has `semantic_context.purpose` |
| **Session** | +0.2 | Has session duration tracked |
| **Scroll** | +0.2 | Scrolled > 50% of page |
| **Interaction** | +0.2 | 5+ interactions (clicks, etc.) |
| **No Semantic Data** | 0.3 | Old events (floor value) |

**Examples:**
- Rich semantic event (all fields): **1.0** (100%)
- Moderate engagement: **0.6** (60%)
- Old event without semantic data: **0.3** (30%)

### 3. Time Decay (Exponential, 0.3 - 1.0)

Recent events are weighted more heavily using exponential decay:

| Age | Weight | Relative Importance |
|-----|--------|---------------------|
| Today (0 days) | 1.00 | 100% |
| 1 day ago | 0.74 | 74% |
| 2 days ago | 0.55 | 55% |
| 3 days ago | 0.41 | 41% |
| 4+ days ago | 0.30 | 30% (floor) |

**Formula**: `max(0.3, e^(-0.3 * days))`

**Why exponential?**
- Recent activity changes matter most
- Old patterns don't disappear abruptly (floor at 30%)
- Natural decay curve matches human memory/importance perception

### 4. Hybrid Event Weight

Each event's final weight combines time and quality:

```
event_weight = (time_decay^0.6) × (event_quality^0.4)
```

**Weights:**
- **60% on recency** - Recent patterns matter more
- **40% on quality** - Rich semantic data adds lasting value

**Examples:**

| Scenario | Time Decay | Quality | Final Weight | Notes |
|----------|-----------|---------|--------------|-------|
| Today, rich data | 1.0 | 1.0 | 1.0 | ⭐ Best case |
| Today, no semantic | 1.0 | 0.3 | 0.64 | Recent but shallow |
| 4 days, rich data | 0.3 | 1.0 | 0.55 | Quality preserves importance! |
| 4 days, no semantic | 0.3 | 0.3 | 0.30 | Minimum weight |

**Key Insight:** A 4-day-old event with rich semantic data (0.55) is **more valuable** than today's event with no semantic data (0.64)!

### 5. Pattern Confidence

Pattern confidence is no longer just frequency. It's:

```sql
confidence = (total_weighted_support / max(10, raw_support)) × pattern_quality
```

Where:
- `total_weighted_support` = sum of all event weights in pattern occurrences
- `raw_support` = number of times pattern occurred
- `pattern_quality` = average quality of events in pattern

**Examples:**
- 3 recent, high-quality occurrences → **High confidence**
- 5 old, low-quality occurrences → **Lower confidence**
- 2 very recent, rich semantic occurrences → **High confidence** (due to weighting)

## What This Achieves

### ✅ **Adaptive to User Behavior**
- New patterns emerge faster (support = 2)
- Recent changes in workflow are quickly recognized
- Old patterns naturally fade unless reinforced

### ✅ **Quality Over Quantity**
- Rich semantic data (purpose, engagement, context) adds lasting value
- Shallow clicks are de-prioritized
- Deep, meaningful interactions are remembered longer

### ✅ **Smart Temporal Awareness**
- Yesterday's 10-minute research session > last week's quick click
- But last week's deep work > today's accidental click
- Exponential decay feels natural, not abrupt

### ✅ **Fixes Semantic Data Loss**
- **CRITICAL**: Pattern sequences now include `semantic_context`!
- Insight generator can finally access purpose, page type, session metrics
- Enables truly semantic-aware recommendations

## Migration Impact

### Before
```json
{
  "id": "...",
  "type": "click",
  "url": "https://canvas.illinois.edu/...",
  "title": "Course Page"
  // ❌ No semantic_context
}
```

### After
```json
{
  "id": "...",
  "type": "click",
  "url": "https://canvas.illinois.edu/...",
  "title": "Course Page",
  "semantic_context": {  // ✅ Now included!
    "purpose": "learning",
    "pageMetadata": { "type": "course_material" },
    "journeyState": {
      "sessionDuration": 45000,
      "scrollDepth": 75,
      "interactionDepth": 12
    }
  },
  "weight": 0.85  // ✅ Weighted score
}
```

## Testing

### Run Pattern Mining
```sql
-- Mine patterns for all users
SELECT * FROM mine_patterns_sql();

-- Mine patterns for specific user
SELECT * FROM mine_patterns_sql('your-user-id-here');

-- Mine with custom parameters
SELECT * FROM mine_patterns_sql(
  'your-user-id',
  2,  -- min_support
  7   -- time_window_days
);
```

### Verify Semantic Data
```sql
-- Check if patterns include semantic_context
SELECT 
  id,
  support,
  confidence,
  sequence->0->>'semantic_context' as first_event_semantic
FROM patterns
WHERE user_id = 'your-user-id'
LIMIT 5;
```

### Check Weighting Impact
```sql
-- Compare old vs new patterns
SELECT 
  support,
  ROUND(confidence::NUMERIC, 3) as confidence,
  sequence->0->>'weight' as first_event_weight,
  last_seen
FROM patterns
WHERE user_id = 'your-user-id'
ORDER BY confidence DESC
LIMIT 10;
```

## Next Steps

1. **Apply the migration** in Supabase SQL Editor
2. **Reload your extension** (to capture events with domain field)
3. **Browse for 10-15 minutes** (generate fresh events with semantic data)
4. **Run pattern mining**: `SELECT * FROM mine_patterns_sql();`
5. **Generate insights** - should now see semantic-aware recommendations!

## Expected Results

With this system, you should see:
- More patterns detected (support = 2)
- Recent patterns ranked higher
- High-quality old patterns still present
- **Semantic insights finally working** (context data now available)
- Confidence scores that actually reflect pattern importance

## Philosophy

This weighting system embodies a key insight:

> **Not all browsing is equal.** A deliberate, engaged session from 3 days ago is more meaningful than an accidental click from this morning. The system should recognize this.

By combining temporal decay with semantic quality, we create a pattern detection system that understands **both recency and importance**.

