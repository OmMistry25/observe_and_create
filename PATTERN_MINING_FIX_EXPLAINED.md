# Pattern Mining Fix - The Real Problem & Solution

## The Root Cause

The previous pattern mining SQL had a fundamental logic error in how it created and grouped sequences.

### What Was Wrong:

```sql
-- ❌ BROKEN LOGIC
sequences AS (
  SELECT 
    jsonb_agg(...) AS sequence,
    array_agg(type || ':' || domain) AS pattern_key,
    ...
  FROM weighted_events
  GROUP BY user_id, (ts::DATE), id, type, url  -- 🔴 PROBLEM HERE!
  HAVING COUNT(*) >= 3
)
```

**The Problem:**
- `GROUP BY ... id, type, url` groups by individual event IDs
- Each event has a **unique ID**
- So `COUNT(*)` is **always 1** (one event per group)
- Therefore `HAVING COUNT(*) >= 3` is **never true**
- Result: **0 patterns found**

## The Correct Approach

We need to:
1. **Create sliding windows** of 3 consecutive events
2. **Extract pattern keys** from those sequences (type:domain)
3. **Group by pattern_key** to count how many times the same pattern occurs
4. **Filter by support** to keep only recurring patterns

### How It Works Now:

```sql
-- ✅ CORRECT LOGIC

-- Step 1: Number all events chronologically
user_events AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts) AS event_num
  FROM events
  ...
),

-- Step 2: Create 3-event windows using self-joins
event_sequences AS (
  SELECT
    user_id,
    event_num,
    jsonb_agg(...) AS sequence,
    array_agg(type || ':' || domain) AS pattern_key,  -- e.g., ["click:chatgpt.com", "nav:canvas.illinois.edu", "click:google.com"]
    ...
  FROM (
    -- Event 1
    SELECT e1.* FROM weighted_events e1
    UNION ALL
    -- Event 2 (next event)
    SELECT e2.* FROM weighted_events e1
    JOIN weighted_events e2 ON e2.event_num = e1.event_num + 1
    WHERE e2.ts - e1.ts < INTERVAL '5 minutes'
    UNION ALL
    -- Event 3 (event after that)
    SELECT e3.* FROM weighted_events e1
    JOIN weighted_events e2 ON e2.event_num = e1.event_num + 1
    JOIN weighted_events e3 ON e3.event_num = e1.event_num + 2
    WHERE e2.ts - e1.ts < INTERVAL '5 minutes'
      AND e3.ts - e2.ts < INTERVAL '5 minutes'
  ) sequences_expanded
  GROUP BY user_id, event_num  -- Group events within each window
  HAVING COUNT(*) = 3  -- Must be exactly 3 events
),

-- Step 3: Group sequences by pattern_key to find recurring patterns
pattern_groups AS (
  SELECT 
    user_id,
    pattern_key,
    COUNT(*) AS raw_support,  -- ✅ Now counts pattern occurrences!
    ...
  FROM event_sequences
  GROUP BY user_id, pattern_key  -- ✅ Group by normalized pattern!
  HAVING COUNT(*) >= p_min_support  -- Filter by minimum occurrences
)
```

## Example

### Your Events:
```
1. click:chatgpt.com (9:00 AM)
2. nav:canvas.illinois.edu (9:01 AM)
3. click:google.com (9:02 AM)
...
10. click:chatgpt.com (2:00 PM)
11. nav:canvas.illinois.edu (2:01 PM)
12. click:google.com (2:02 PM)
...
20. click:chatgpt.com (5:00 PM)
21. nav:canvas.illinois.edu (5:01 PM)
22. click:google.com (5:02 PM)
```

### Old (Broken) Logic:
- Creates groups by individual event IDs
- Each group has 1 event
- `COUNT(*) = 1` always
- **Result: 0 patterns** ❌

### New (Fixed) Logic:
- Creates sliding windows: [1,2,3], [2,3,4], [3,4,5], ..., [20,21,22]
- Extracts pattern_key for each: `["click:chatgpt.com", "nav:canvas.illinois.edu", "click:google.com"]`
- Groups windows by pattern_key
- Finds pattern `["click:chatgpt.com", "nav:canvas.illinois.edu", "click:google.com"]` occurs **3 times**
- **Result: 1 pattern with support=3** ✅

## What You'll See Now

With 4,318 events:
- **Before:** Mined 0 patterns
- **After:** Mined 30-50+ patterns (depending on actual recurring workflows)

Each pattern will show:
- **Support:** How many times it occurred (e.g., 5 times)
- **Confidence:** Weighted quality score (0.0-1.0)
- **Sequence:** Full event details with semantic_context
- **Pattern Key:** Normalized type:domain sequence for matching

## Testing

Apply the new migration `20240101000015_proper_pattern_grouping.sql` and run:

```sql
SELECT * FROM mine_patterns_sql(NULL, 2, 7);
```

You should now see actual patterns! 🎯

