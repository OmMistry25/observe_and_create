# Semantic Intelligence: Level 1 + Level 3

## Overview

This system captures **rich semantic context** (Level 1) from user browsing and uses **LLM-based goal inference** (Level 3) to understand the "why" behind user actions.

---

## Level 1: Enhanced Context Capture

### What We Capture

Every event now includes `semantic_context` with:

#### **Element-Level Semantics**
- `purpose`: Why user interacted (e.g., `purchase_intent`, `navigation`, `information_seeking`)
- `semanticRole`: ARIA labels, roles
- `elementContext`:
  - `text`: Element text
  - `nearbyText`: Surrounding context
  - `visualWeight`: Importance/prominence (0-1)
  - `pageSection`: header, nav, main, sidebar, footer

#### **Page-Level Semantics**
- `pageMetadata`:
  - `type`: product, article, search_results, checkout, dashboard, form, video, documentation, social_media, general
  - `mainHeading`: h1 content
  - `category`: development, community, entertainment, email, shopping, professional, reference, documentation
  - `description`: Meta description or first paragraph
  - `keyEntities`: Extracted brands/topics

#### **Journey-Level Signals**
- `journeyState`:
  - `sessionDuration`: Seconds since session start
  - `scrollDepth`: 0-100%
  - `interactionDepth`: Number of interactions
  - `previousPages`: Last 3 page titles

#### **Temporal Context**
- `temporal`:
  - `timeOfDay`: 0-23
  - `dayOfWeek`: 0-6
  - `isWorkHours`: 9am-5pm Mon-Fri
  - `isWeekend`: Sat/Sun

#### **Content Signals**
- `contentSignals`:
  - `hasVideo`, `hasImages`, `hasForms`
  - `hasPricing`, `hasReviews`, `hasComparison`

### Implementation

**Location**: `apps/extension/src/content.ts`

**Functions**:
- `captureSemanticContext(element?)`: Main function to capture all context
- `inferElementPurpose(el)`: Determine why user clicked
- `inferPageType()`: Classify page type
- `inferPageCategory()`: Categorize domain
- `getScrollDepth()`, `getVisualWeight()`, etc.

**Database**: `events.semantic_context` (JSONB column)

---

## Level 3: Goal Inference with OpenAI

### What We Infer

For each pattern sequence, we determine:

1. **Primary Goal**: What user is trying to accomplish
   - Examples: `price_comparison`, `research_topic`, `status_monitoring`, `online_purchase`

2. **Goal Category**: High-level category
   - `shopping`, `learning`, `productivity`, `entertainment`, `maintenance`

3. **Confidence**: How certain we are (0-1)

4. **Reasoning**: Why we think this is the goal

5. **Automation Potential**: How automatable (0-1)

### Implementation

#### **OpenAI Integration**

**Location**: `packages/automation/src/goal-inference.ts`

**Model**: `gpt-4o-mini` (cost-efficient)

**Function**: `inferGoalFromSequence(sequence, apiKey)`

**Fallback**: Heuristic-based inference if API unavailable

#### **API Endpoint**

**POST** `/api/patterns/infer-goals`
- Triggers goal inference for patterns without goals
- Processes 10 patterns per request
- Updates `patterns` table with inferred goals

**GET** `/api/patterns/infer-goals`
- Returns statistics on goal inference status
- Shows breakdown by goal category
- Average automation potential

#### **Scheduled Job**

**SQL Function**: `infer_pattern_goals()`
- Runs heuristic-based inference in database
- Processes patterns with `support >= 3` and `confidence >= 0.3`
- Scheduled weekly (Sundays at 5 AM)

**Location**: `infra/supabase/supabase/migrations/20240101000010_semantic_intelligence.sql`

---

## Database Schema

### New Columns

**`events.semantic_context`** (JSONB)
```json
{
  "purpose": "purchase_intent",
  "pageMetadata": {
    "type": "product",
    "category": "shopping",
    "mainHeading": "iPhone 15 Pro",
    "keyEntities": ["Apple", "iPhone"]
  },
  "journeyState": {
    "sessionDuration": 120,
    "scrollDepth": 75,
    "interactionDepth": 5
  },
  "temporal": {
    "timeOfDay": 14,
    "isWorkHours": true
  }
}
```

**`patterns` table additions**:
- `inferred_goal` (TEXT): e.g., "price_comparison"
- `goal_confidence` (NUMERIC): 0-1
- `goal_category` (TEXT): shopping, learning, productivity, entertainment, maintenance
- `automation_potential` (NUMERIC): 0-1
- `goal_reasoning` (TEXT): Why we inferred this goal

### Indexes

- `idx_events_semantic_page_type`: Query by page type
- `idx_events_semantic_category`: Query by category
- `idx_events_semantic_purpose`: Query by element purpose
- `idx_patterns_goal`: Query by inferred goal
- `idx_patterns_goal_category`: Query by goal category

---

## Usage

### 1. Automatic Capture (Level 1)

**Extension already captures enhanced context!**

Just browse normally. Every event includes semantic context.

Check console for logs:
```
[Content] Event captured: click on BUTTON (purpose: purchase_intent, pageType: product)
```

### 2. Trigger Goal Inference (Level 3)

**Option A: API Endpoint** (Manual)

```bash
# Get statistics
curl http://localhost:3000/api/patterns/infer-goals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Trigger inference
curl -X POST http://localhost:3000/api/patterns/infer-goals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Option B: Scheduled Job** (Automatic)

Runs every Sunday at 5 AM automatically via pg_cron.

**Option C: SQL Function** (Manual)

```sql
-- Run heuristic inference in database
SELECT infer_pattern_goals();
```

### 3. Query Patterns by Goal

```sql
-- Find shopping patterns
SELECT * FROM patterns 
WHERE goal_category = 'shopping' 
ORDER BY automation_potential DESC;

-- Find highly automatable patterns
SELECT * FROM automatable_patterns 
LIMIT 10;

-- Goal summary
SELECT * FROM goal_pattern_summary;
```

---

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
# OpenAI API Key (optional, uses heuristics if not provided)
OPENAI_API_KEY=sk-...
```

### Cost Optimization

**Model**: Using `gpt-4o-mini` for cost efficiency
- ~$0.15 per 1M input tokens
- ~$0.60 per 1M output tokens
- Average cost: ~$0.0001 per pattern inference

**Rate Limits**:
- API endpoint: 10 patterns per request
- Scheduled job: 100 patterns per week
- Manual SQL: 50 patterns per execution

---

## Examples

### Example 1: Shopping Pattern

**Events**:
1. Search: "best wireless headphones"
2. Click product (pageType: product, purpose: information_seeking)
3. Click product (pageType: product, purpose: comparison_research)
4. Click "Add to Cart" (purpose: purchase_intent)

**Inferred Goal**:
```json
{
  "goal": "online_purchase",
  "goal_category": "shopping",
  "confidence": 0.85,
  "reasoning": "User searched, compared products, and added to cart",
  "automation_potential": 0.7
}
```

### Example 2: Research Pattern

**Events**:
1. Search: "kubernetes best practices"
2. Click article (pageType: article)
3. Click article (pageType: article)
4. Click documentation (pageType: documentation)

**Inferred Goal**:
```json
{
  "goal": "research_topic",
  "goal_category": "learning",
  "confidence": 0.8,
  "reasoning": "Search followed by multiple educational resources",
  "automation_potential": 0.5
}
```

### Example 3: Monitoring Pattern

**Events**:
1. Navigate to dashboard
2. Check status page
3. Return to dashboard
4. Check another status page

**Inferred Goal**:
```json
{
  "goal": "status_monitoring",
  "goal_category": "maintenance",
  "confidence": 0.75,
  "reasoning": "Repeated dashboard and status checks",
  "automation_potential": 0.9
}
```

---

## Benefits

### For Users

1. **Better Automation Suggestions**
   - Suggestions based on goals, not just actions
   - Higher quality, more relevant recommendations

2. **Goal-Oriented Workflows**
   - Automations that survive UI changes
   - Focus on accomplishing goals, not clicking buttons

3. **Smarter Pattern Detection**
   - Detects similar workflows even with different steps
   - Understands intent behind actions

### For System

1. **Richer Data**
   - More context for decision-making
   - Better ML training data

2. **Resilient Automations**
   - Goal-based execution can adapt to changes
   - Fallback strategies when selectors break

3. **Improved Confidence Scores**
   - More signals for pattern validation
   - Better filtering of noise

---

## Testing

### 1. Verify Enhanced Context Capture

1. Reload extension in Chrome
2. Visit a product page (e.g., Amazon)
3. Open console (F12)
4. Click "Add to Cart" button
5. Check logs:

```
[Content] Event captured: click on BUTTON (purpose: purchase_intent, pageType: product)
```

6. Check Supabase:

```sql
SELECT 
  url, 
  type,
  semantic_context->'pageMetadata'->>'type' as page_type,
  semantic_context->>'purpose' as purpose
FROM events 
ORDER BY ts DESC 
LIMIT 10;
```

### 2. Test Goal Inference

1. Browse normally for a few days (accumulate patterns)
2. Trigger goal inference:

```bash
curl -X POST http://localhost:3000/api/patterns/infer-goals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

3. Check results:

```sql
SELECT 
  inferred_goal,
  goal_category,
  goal_confidence,
  automation_potential,
  goal_reasoning
FROM patterns 
WHERE inferred_goal IS NOT NULL 
ORDER BY automation_potential DESC;
```

### 3. Verify Scheduled Job

```sql
-- Check cron schedule
SELECT * FROM cron.job WHERE jobname = 'weekly-goal-inference';

-- Manually trigger
SELECT infer_pattern_goals();
```

---

## Troubleshooting

### Issue: No semantic context in events

**Cause**: Extension not rebuilt or not reloaded

**Fix**:
```bash
pnpm build --filter @observe-create/extension
# Reload extension in Chrome
```

### Issue: Goal inference returns 0 processed

**Cause**: No patterns meet criteria (support >= 3, confidence >= 0.3, no existing goal)

**Fix**: Browse more to accumulate patterns, or lower thresholds in SQL function

### Issue: OpenAI API errors

**Cause**: Invalid API key or rate limit

**Fix**: Check `OPENAI_API_KEY` in `.env.local`. System will fall back to heuristics.

### Issue: Heuristic goals seem inaccurate

**Cause**: Limited signal detection in heuristic rules

**Fix**: Add OpenAI API key for better inference, or tune heuristic rules in `infer_goal_heuristic()`

---

## Next Steps

1. **Collect Data** (1-2 weeks)
   - Browse normally with enhanced context
   - Let patterns accumulate

2. **Test Goal Inference**
   - Trigger manual inference
   - Review accuracy of inferred goals
   - Compare OpenAI vs. heuristic results

3. **Refine Rules** (if needed)
   - Tune heuristic fallback rules
   - Add more purpose/page type detections
   - Improve OpenAI prompt for better results

4. **Use Goals in Automations** (T21+)
   - Generate goal-oriented automations
   - Selector strategies based on element purpose
   - Adaptive execution using inferred goals

---

## Files Changed

### Extension
- `apps/extension/src/content.ts`: Added 400+ lines of semantic capture logic

### Backend
- `packages/automation/src/goal-inference.ts`: OpenAI integration + heuristics (370 lines)
- `apps/web/app/api/patterns/infer-goals/route.ts`: API endpoint (240 lines)

### Database
- `infra/supabase/supabase/migrations/20240101000010_semantic_intelligence.sql`: Schema + functions (273 lines)

### Dependencies
- Added `openai` package to `@observe-create/automation`

---

## Performance Notes

- **Extension**: Semantic capture adds ~5-10ms per event (negligible)
- **Storage**: `semantic_context` adds ~500-1000 bytes per event (JSONB)
- **OpenAI API**: ~1-2 seconds per pattern inference
- **Heuristic fallback**: <10ms per pattern inference
- **Database**: Indexed queries remain fast (<50ms)

---

## Privacy Notes

- All semantic context captured **locally in browser**
- No data sent to OpenAI without explicit API key
- OpenAI receives **anonymized** event sequences (no PII)
- Heuristic fallback works **entirely offline**
- User controls via existing consent/scope UI

