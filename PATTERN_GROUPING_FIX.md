# Pattern Grouping Fix

## The Problem

The smart pattern weighting migration (`20240101000013`) had a critical bug in how it grouped sequences to detect patterns.

### What Was Happening:

```sql
-- Creating sequences with unique IDs and timestamps
jsonb_build_object(
  'id', id,           -- ❌ Unique for every event
  'ts', ts,           -- ❌ Unique timestamp
  'type', type,
  'url', url,
  ...
)

-- Then grouping by the full sequence JSON
GROUP BY user_id, sequence  -- ❌ Will never match!
```

**Result:** No two sequences were ever identical because they contained unique event IDs and timestamps. So `COUNT(*)` was always 1, failing the `HAVING COUNT(*) >= 2` requirement.

### Symptoms:
- `mine_patterns_sql()` returned 0 patterns even with 4,000+ events
- With `min_support=1`, only found 1 pattern across all data
- Pattern detection essentially broken

## The Solution

**Dual-sequence approach:**

1. **`pattern_key`** - Normalized sequence for matching
   - Format: `["click:chatgpt.com", "click:canvas.illinois.edu", "nav:google.com"]`
   - Just type + domain, no IDs or timestamps
   - Used for `GROUP BY` to find identical patterns

2. **`sequence`** - Full rich sequence for storage
   - Includes all context: IDs, timestamps, semantic_context, weights
   - Stored in patterns table for insight generation
   - Uses the most recent occurrence as canonical

### Fixed Logic:

```sql
sequences AS (
  SELECT 
    -- FULL sequence (for storage)
    jsonb_agg(jsonb_build_object(
      'id', id,
      'ts', ts,
      'semantic_context', semantic_context,
      ...
    )) AS sequence,
    
    -- NORMALIZED key (for matching)
    array_agg(type || ':' || domain ORDER BY ts) AS pattern_key,
    ...
  FROM ...
),
pattern_groups AS (
  SELECT 
    -- Use first occurrence's full sequence
    (array_agg(sequence ORDER BY last_ts DESC))[1] AS sequence,
    pattern_key,
    COUNT(*) AS raw_support,  -- ✅ Now correctly counts identical patterns!
    ...
  FROM sequences
  GROUP BY user_id, pattern_key  -- ✅ Group by normalized pattern!
  HAVING COUNT(*) >= p_min_support
)
```

## Key Changes

### Before (Broken):
- Grouped by full JSON including unique fields
- No patterns detected with support >= 2
- Essentially unusable

### After (Fixed):
- Groups by `type:domain` pattern key
- Stores full sequence with semantic context
- Correctly detects repeating patterns

## Example

### Same pattern occurring 3 times:

**Occurrence 1** (Oct 14, 9am):
```
click:chatgpt.com → click:canvas.illinois.edu → nav:google.com
```

**Occurrence 2** (Oct 14, 2pm):
```
click:chatgpt.com → click:canvas.illinois.edu → nav:google.com
```

**Occurrence 3** (Oct 14, 5pm):
```
click:chatgpt.com → click:canvas.illinois.edu → nav:google.com
```

**Before fix:** Detected as 3 different patterns (because IDs/timestamps differ)
**After fix:** Detected as 1 pattern with support=3 ✅

## Testing

Run the migration, then:

```sql
-- Should now find patterns
SELECT * FROM mine_patterns_sql(NULL, 2, 7);

-- Check pattern structure
SELECT 
  support,
  confidence,
  sequence->0->>'type' as first_event_type,
  sequence->0->>'domain' as first_event_domain,
  sequence->0->'semantic_context'->>'purpose' as first_event_purpose
FROM patterns
WHERE user_id = 'your-user-id'
LIMIT 5;
```

With 4,318 events across multiple domains, you should now see dozens of patterns detected!

## Impact

This fix enables:
- ✅ Proper pattern detection (finally works!)
- ✅ Accurate support counts (how many times pattern occurs)
- ✅ Semantic-aware insights (context data now accessible)
- ✅ Smart weighting actually being used
- ✅ The entire intelligence system functioning as designed

**This was a critical bug blocking the entire pattern detection pipeline.**

