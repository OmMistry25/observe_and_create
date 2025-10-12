# Setup Instructions

## T01: Supabase Init

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose an organization (or create one)
4. Fill in:
   - **Project Name**: `observe-and-create` (or your preference)
   - **Database Password**: (save this securely)
   - **Region**: Choose closest to you
5. Click "Create new project" and wait ~2 minutes for provisioning

### Step 2: Get Your API Keys

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")
   - **service_role** secret key (under "Project API keys")

### Step 3: Configure Your Environment

1. In the `apps/web` directory, copy `.env.local.example` to `.env.local`:
   ```bash
   cd apps/web
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and replace the placeholder values:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key-here
   ```

### Step 4: Verify Connection

1. Start the development server:
   ```bash
   cd /Users/ommistry/observe_and_create
   pnpm dev
   ```

2. Open your browser to: http://localhost:3000/test-connection

3. Click "Test Connection" button

4. You should see a success message (note: it will error until we create the `profiles` table in T02, but the connection itself should work)

### Notes

- **RLS (Row Level Security)** is enabled by default in Supabase
- Keep your `service_role` key secret - never commit it or expose it client-side
- The `.env.local` file is already in `.gitignore`

---

## T02: Database Migrations

### Apply the Schema

**Option A: Via Supabase Dashboard (Easiest)**

1. Open your Supabase project dashboard
2. Go to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open the file: `/Users/ommistry/observe_and_create/infra/supabase/supabase/migrations/20240101000000_initial_schema.sql`
5. Copy all contents and paste into the SQL editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. You should see: "Success. No rows returned"

**Option B: Via CLI**

```bash
# From project root
cd /Users/ommistry/observe_and_create

# Link to your remote project (you'll be prompted for project ref)
pnpm db:link

# Push migrations
pnpm db:push
```

### Verify the Migration

1. In Supabase dashboard, go to **Table Editor**
2. You should see 13 new tables:
   - profiles
   - domains
   - sessions
   - events
   - event_embeddings
   - interaction_quality
   - patterns
   - pattern_templates
   - automations
   - automation_versions
   - triggers
   - runs
   - automation_feedback

3. Test via your app:
```bash
cd /Users/ommistry/observe_and_create
pnpm dev
# Visit http://localhost:3000/api/health
```

Should return: `{"status": "ok", "message": "Supabase connection successful"}`

---

## T03: RLS Policies

### Apply RLS Policies

**Via Supabase Dashboard:**

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Open the file: `/Users/ommistry/observe_and_create/infra/supabase/supabase/migrations/20240101000001_rls_policies.sql`
5. Copy all contents and paste into the SQL editor
6. Click **Run**
7. You should see: "Success. No rows returned"

**Via CLI:**

```bash
cd /Users/ommistry/observe_and_create
pnpm db:push
```

### Verify RLS Policies

1. Visit: http://localhost:3002/test-rls
2. Click "Test RLS Policies"
3. You should see:
   - Status: `unauthenticated` (before signing up)
   - RLS is blocking queries (this is correct behavior!)

**What RLS does:**
- ✅ Users can only access their own data
- ✅ Anonymous clients are blocked from reading any data
- ✅ All tables enforce `auth.uid()` checks
- ✅ Pattern templates are public (read-only) for all authenticated users

---

---

## T04: Next.js App Scaffold

### What's Included

✅ **Authentication Pages**
- `/auth/signup` - Email/password registration
- `/auth/signin` - Email/password login

✅ **Protected Routes**
- `/dashboard` - Main dashboard with Activity Feed, Patterns, and Automations sections
- Client-side authentication guards

✅ **UI Components**
- shadcn/ui components (Button, Card, Input)
- Tailwind CSS styling
- Responsive layout

✅ **Supabase Configuration**
- Email confirmation disabled for development
- Profile creation on signup
- Session management with cookies

### Usage

1. Start the dev server:
```bash
cd /Users/ommistry/observe_and_create
pnpm dev
```

2. Visit: http://localhost:3001 (or whatever port Next.js assigns)

3. Click "Get Started" → Sign up with email/password

4. After signup, you'll be redirected to the dashboard

5. Sign out from the dashboard header

---

## T05: Ingest API Route

### What's Included

✅ **Event Validation Schemas**
- Zod schemas in `packages/schemas` for event validation
- Support for 8 event types: click, search, form, nav, focus, blur, idle, error
- Batch validation (1-100 events per request)

✅ **API Route**
- POST `/api/ingest` endpoint with authentication
- Validates events against schema
- Inserts events into database
- Returns success/error responses with details

✅ **Test UI**
- `/test-ingest` page to test valid and invalid payloads
- Shows request/response for debugging

### Testing

1. Make sure you're signed in (visit `/auth/signin` if needed)

2. Visit: http://localhost:3001/test-ingest

3. Click "Test Valid Payload" → Should get:
   - Status 200
   - `success: true`
   - `inserted: 2`
   - `queued_embeddings: 2`

4. Click "Test Invalid Payload" → Should get:
   - Status 400
   - Validation errors listed

5. Verify in Supabase:
   - Go to Table Editor → `events`
   - You should see 2 new events with your user_id

### API Documentation

See `apps/web/API.md` for full API documentation.

---

## T06: Embedding Worker

### What's Included

✅ **Local Embedding Model**
- Uses `@xenova/transformers` (Transformers.js) for privacy-first local processing
- `all-MiniLM-L6-v2` model (384-dimensional vectors)
- No external API calls - runs entirely in Node.js

✅ **Embedding Utilities** (`packages/ingest/src/embeddings.ts`)
- Generate embeddings for single or batch texts
- Extract searchable text from events (title + text + URL)
- Cosine similarity calculation for vector comparison

✅ **Database Integration** (`packages/ingest/src/db.ts`)
- Store embeddings in `event_embeddings` table (as JSONB)
- Batch embedding generation
- kNN similarity search

✅ **API Integration**
- `/api/ingest` automatically generates embeddings after inserting events
- `/api/embeddings/search` - semantic search endpoint
- Embeddings generated asynchronously (non-blocking)

✅ **Test UI** (`/test-embeddings`)
- Search for similar events using semantic similarity
- Visual display of similarity scores
- Test semantic understanding

### Testing

1. **Insert test events** (if you haven't already):
   - Visit: http://localhost:3002/test-ingest
   - Click "Test Valid Payload" to insert 2 events

2. **Wait for embeddings** (about 10-20 seconds):
   - First time will download the model (~23MB)
   - Subsequent runs will be faster (model cached)
   - Check terminal logs for: `[Embeddings] Generated X embeddings`

3. **Test semantic search**:
   - Visit: http://localhost:3002/test-embeddings
   - Try searching for: "example page", "test", "search"
   - You should see events ranked by semantic similarity

4. **Verify in Supabase**:
   - Go to Table Editor → `event_embeddings`
   - You should see embedding records (stored as JSONB arrays)
   - Each embedding is 384 numbers

### How It Works

1. When events are ingested via `/api/ingest`:
   - Events are stored in the `events` table
   - Embeddings are generated asynchronously in the background
   - Combined text is created from title + text + URL
   - Vector embedding is generated using the local model
   - Stored in `event_embeddings` as JSONB

2. For semantic search:
   - Query text is converted to an embedding
   - Cosine similarity is calculated against all stored embeddings
   - Top k most similar events are returned with similarity scores

### Notes

- First run downloads the model (~23MB) - this may take a minute
- Model is cached locally in `.cache/transformers`
- Embeddings are generated asynchronously to not block API responses
- Currently uses JSONB storage; pgvector will be added later for better performance

---

## T07: Dashboard Activity Feed

### What's Included

✅ **Events API** (`/api/events`)
- GET endpoint with pagination
- Filter by domain, type, and intent
- RLS automatically enforced
- Returns events with interaction_quality data

✅ **Activity Feed UI** (`/dashboard`)
- Table view of recent events
- Event type and intent badges
- Friction score indicators
- Formatted timestamps and dwell times
- Domain extraction from URLs

✅ **Filtering**
- Domain filter (partial match)
- Type filter (8 event types)
- Intent filter (6 intent categories)
- Real-time filter application

✅ **Pagination**
- Page-based navigation
- 20 events per page
- Previous/Next buttons
- Total count display

### Testing

1. **Add events** (if you haven't):
   - Visit: http://localhost:3000/test-ingest
   - Click "Test Valid Payload" multiple times to create more events

2. **View Activity Feed**:
   - Visit: http://localhost:3000/dashboard
   - You should see all your events listed

3. **Test Filters**:
   - Filter by domain: Enter "example.com"
   - Filter by type: Select "click" or "search"
   - Filter by intent: Select any (note: intent requires T06.1 to populate)
   - Click "Apply Filters"

4. **Test Pagination**:
   - If you have >20 events, you'll see pagination
   - Click "Next" and "Previous" to navigate

5. **Verify RLS**:
   - Events shown are only yours (filtered by user_id)
   - Sign in as different users to see different events

### Features

- **Visual Indicators**:
  - Blue badge: Event type
  - Green badge: Inferred intent
  - Red badge: High friction score
  
- **Event Details**:
  - Title or domain name
  - Full domain
  - Text snippet (if available)
  - Timestamp
  - Dwell time (if available)

- **Empty States**:
  - Helpful message when no events
  - Link to test-ingest page

---

## T08: Timeline Chart

### What's Included

✅ **Timeline API** (`/api/analytics/timeline`)
- Aggregates dwell time by hour
- Groups by domain with intent breakdown
- Configurable time window (default 24h, max 7 days)
- Returns top 5 domains by dwell time

✅ **Interactive Chart** (`TimelineChart` component)
- Stacked area chart using Recharts
- Shows dwell time per domain over time
- Color-coded domains (top 5)
- Formatted time labels and durations
- Responsive design

✅ **Dashboard Integration**
- Timeline chart at top of dashboard
- 24-hour aggregation by default
- Empty state with helpful message
- Smooth gradients for visual appeal

### Features

- **Hourly Buckets**: Data aggregated into 1-hour time slots
- **Domain Stacking**: See which domains you spent time on
- **Top Domains**: Shows top 5 domains by total dwell time
- **Intent Breakdown**: Data includes intent classification per domain
- **Duration Formatting**: Smart formatting (seconds, minutes, hours)

### Testing

1. **Add events with dwell time**:
   - The test events in `/test-ingest` include `dwell_ms: 1500`
   - Visit: http://localhost:3000/test-ingest
   - Click "Test Valid Payload" 10-15 times to create activity

2. **View timeline chart**:
   - Visit: http://localhost:3000/dashboard
   - See the stacked area chart at the top
   - Domains are color-coded and stacked

3. **Check aggregation**:
   - Mouse over the chart to see tooltips with exact durations
   - Each bar represents a 1-hour time window
   - Colors represent different domains

4. **Empty state**:
   - If no events with dwell time exist, you'll see a helpful message

### Notes

- Dwell time must be present in events (`dwell_ms` field)
- Test events include 1.5 seconds of dwell time
- Real events from the extension will have actual dwell times
- Chart shows last 24 hours by default
- Can be extended to 7 days (168 hours)

---

## T09: Extension Scaffold

### What's Included

✅ **MV3 Manifest** (`manifest.json`)
- Manifest Version 3 configuration
- Permissions: storage, tabs, activeTab, scripting
- Host permissions for all URLs
- Content scripts and background service worker
- Popup configuration

✅ **Background Service Worker** (`src/background.ts`)
- Extension lifecycle management
- Message passing between components
- Tab tracking for dwell time
- Settings management
- Keep-alive mechanism

✅ **Content Script** (`src/content.ts`)
- Injected into all pages
- Captures clicks, forms, navigation
- Tracks page visibility for dwell time
- Extracts DOM paths
- Detects search queries

✅ **Popup UI** (`src/popup.html` + `src/popup.ts`)
- Enable/disable toggle
- Activity stats display
- Quick dashboard access
- Settings link
- Modern, clean design

✅ **Build System** (Vite)
- Multi-entry point build
- Automatic file copying
- ES modules output
- No minification for debugging

### Loading in Chrome

1. **Build the extension**:
   ```bash
   cd apps/extension
   pnpm build
   ```

2. **Load in Chrome**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `/Users/ommistry/observe_and_create/apps/extension/dist`

3. **Verify**:
   - Extension appears in toolbar
   - Click icon to see popup
   - Check console for `[Background]` and `[Content]` messages

See `apps/extension/LOADING.md` for detailed instructions.

### Features

- **Event Capture**:
  - Clicks with DOM path
  - Form submissions
  - Navigation with dwell time
  - Search query detection
  - Page focus/blur

- **Privacy**:
  - Enable/disable toggle
  - Runs only when enabled
  - Local storage for settings

- **UI**:
  - Clean, modern popup
  - Activity stats
  - Quick dashboard access

### Testing

1. Load extension in Chrome
2. Browse any website
3. Open DevTools Console (F12)
4. See `[Content] Script loaded` messages
5. Click the extension icon to see popup
6. Check Background service worker: `chrome://extensions/` → "service worker"

---

## T10: Consent + Scopes UI

### What's Included

✅ **Onboarding Flow** (`/onboarding`)
- 3-step consent process
- Data collection category selection
- Privacy settings configuration
- Clear explanations of what's collected

✅ **Settings Page** (`/settings`)
- Manage consent preferences
- Update data collection categories
- Configure privacy settings
- Delete all data option

✅ **Consent Storage** (Database)
- `consent_data` JSONB column in profiles
- `consent_given_at` timestamp
- Structured consent preferences

✅ **Dashboard Integration**
- Consent check on dashboard load
- Redirect to onboarding if no consent
- Settings button in dashboard header

### Database Migration Required

Run this SQL in your Supabase SQL editor:

```sql
-- Add consent support to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS consent_data JSONB,
ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

-- Add index for consent queries
CREATE INDEX IF NOT EXISTS idx_profiles_consent_given_at ON profiles(consent_given_at);
```

### Features

- **Data Collection Categories**:
  - Click tracking
  - Search queries
  - Form interactions
  - Page navigation
  - Dwell time measurement

- **Privacy Settings**:
  - Data retention period (7 days to 1 year)
  - Analytics opt-in/out
  - Data sharing preferences

- **User Control**:
  - Granular category toggles
  - Settings page for updates
  - Delete all data option
  - Clear consent explanations

### Testing

1. **First-time user flow**:
   - Sign up → Redirected to `/onboarding`
   - Complete 3-step consent process
   - Redirected to dashboard

2. **Existing user**:
   - Dashboard checks for consent
   - Redirects to onboarding if missing
   - Settings page accessible from dashboard

3. **Settings management**:
   - Update consent preferences
   - Save changes to database
   - Delete all data functionality

---

## T11: Sensors v1

### What's Included

✅ **Extension → Server Integration**
- Event upload to `/api/ingest` endpoint
- Authentication using user session tokens
- Event batching (10 events per batch)
- Automatic retry for failed uploads
- Offline storage for events when disconnected

✅ **Enhanced Event Capture**
- Detailed click tracking with DOM paths
- Form field information extraction
- Element attributes (href, src, alt, title, etc.)
- Click position coordinates
- Enhanced search query detection

✅ **Authentication System**
- Session retrieval from web app
- Token validation and refresh
- Extension popup shows auth status
- Automatic session management

✅ **Event Queuing & Batching**
- Local event queue (10 events per batch)
- Periodic upload every 30 seconds
- Offline storage for failed uploads
- Retry mechanism for stored events

✅ **Test Page** (`/test-extension`)
- Interactive elements for testing
- Real-time event display
- Debug information and console logs
- Step-by-step testing instructions

### Features

- **Real-time Event Upload**:
  - Events captured by extension
  - Batched and uploaded to server
  - Automatic retry on failure
  - Offline storage when disconnected

- **Enhanced Data Capture**:
  - DOM context and element paths
  - Text snippets and attributes
  - Form field details
  - Click positions and timestamps

- **Authentication**:
  - Extension gets session from web app
  - Automatic token validation
  - Session refresh when needed
  - Auth status in popup

### Testing

1. **Load Extension**:
   - Build: `cd apps/extension && pnpm build`
   - Load in Chrome: `chrome://extensions/` → Load unpacked
   - Select: `/Users/ommistry/observe_and_create/apps/extension/dist`

2. **Test Event Capture**:
   - Go to: `http://localhost:3000/test-extension`
   - Click buttons, fill forms, interact with page
   - Check console for `[Content]` and `[Background]` messages

3. **Verify Upload**:
   - Check dashboard: `http://localhost:3000/dashboard`
   - Events should appear in activity feed
   - Timeline chart should update

4. **Check Console Logs**:
   - `[Content] Script loaded on: <url>`
   - `[Content] Event captured: ...`
   - `[Background] Queued event, queue size: X`
   - `[Background] Uploaded X events successfully`

### Next Steps

Ready to proceed to **T11.1: Friction Detection Sensors**


---

## T11.1: Friction Detection Sensors

The extension now includes advanced friction detection to identify user frustration:

### Friction Sensors Implemented

1. **Rapid Scrolling Detection**
   - Tracks scroll velocity (pixels per millisecond)
   - Flags frustration after 3 rapid scrolls (> 2px/ms)
   - Event type: `friction` with `frictionType: 'rapid_scroll'`

2. **Back Button Usage**
   - Detects browser back button clicks
   - Indicates navigation friction or user confusion
   - Event type: `friction` with `frictionType: 'back_button'`

3. **Form Abandonment**
   - Tracks when users start filling forms but leave without submitting
   - Records time spent and number of fields
   - Event type: `friction` with `frictionType: 'form_abandon'`

4. **Error Page Detection**
   - Automatically detects 404 and error pages from page title
   - Event type: `error` with `errorType: 'page_error'`

5. **Slow Page Load Detection**
   - Measures page load performance
   - Flags loads > 3 seconds
   - Includes DNS, TCP, request, and render timing
   - Event type: `friction` with `frictionType: 'slow_load'`

6. **Rage Click Detection**
   - Detects 3+ clicks on same element within 1 second
   - Strong indicator of UI frustration
   - Event type: `friction` with `frictionType: 'rage_click'`

### Testing Friction Sensors

1. **Reload the extension**:
   ```bash
   cd /Users/ommistry/observe_and_create/apps/extension
   pnpm build
   ```
   Then reload in Chrome at `chrome://extensions/`

2. **Test rapid scrolling**:
   - Go to any long page
   - Scroll rapidly up and down multiple times
   - Check console for friction events

3. **Test rage clicking**:
   - Click the same button/element 3+ times quickly
   - Should trigger a rage_click event

4. **Test form abandonment**:
   - Start filling out a form
   - Navigate away without submitting
   - Should trigger form_abandon on page unload

5. **Test back button**:
   - Navigate between pages
   - Use browser back button
   - Should trigger back_button friction event

6. **Verify in dashboard**:
   - Go to `http://localhost:3000/dashboard`
   - Filter by type: `friction` or `error`
   - View captured friction events with details

### Friction Event Metadata

All friction events include rich metadata:
- `frictionType`: Type of friction detected
- `velocity`, `scrollDelta`: For rapid scrolling
- `previousUrl`: For back button
- `formId`, `timeSpent`, `fieldCount`: For form abandonment
- `loadTime`, `dns`, `tcp`, `request`, `render`: For slow loads
- `clickCount`, `element`: For rage clicks

Friction detection helps identify pain points in user workflows! 🎯

### Applying the Migration

Run the following SQL in your Supabase SQL Editor:

```sql
-- Add 'friction' event type to the events table
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;

ALTER TABLE events ADD CONSTRAINT events_type_check 
  CHECK (type IN ('click', 'search', 'form', 'nav', 'focus', 'blur', 'idle', 'error', 'friction'));

COMMENT ON CONSTRAINT events_type_check ON events IS 
  'Valid event types including friction detection (T11.1)';
```

This adds the `friction` event type to the database schema, allowing friction detection events to be stored.


---

## T12: Pattern Detection (MVP)

The system now includes frequency-based pattern mining to detect recurring workflows.

### Pattern Detection Algorithm

The pattern miner:
1. Fetches events from the last 7 days
2. Groups events by domain
3. Extracts sequences of 3-5 consecutive events
4. Identifies sequences that repeat 3+ times
5. Calculates support (frequency) and confidence metrics
6. Stores patterns in the database

### Pattern Types

- **Frequency Patterns**: Sequences that repeat frequently (e.g., "open dashboard → check reports → export data")
- Support: Number of times the pattern occurs
- Confidence: Reliability score (0-1)

### Testing Pattern Detection

1. **Generate activity**:
   - Browse normally for a few days
   - Repeat the same workflows multiple times
   - Example: Visit the same 3-4 pages in sequence several times

2. **Mine patterns**:
   - Go to `http://localhost:3000/patterns`
   - Click "Mine Patterns" button
   - Wait for mining to complete

3. **View patterns**:
   - See detected patterns with support counts
   - Each pattern shows the event sequence
   - Patterns are sorted by frequency (most common first)

### API Endpoints

**POST /api/patterns/mine**
- Triggers pattern mining for authenticated user
- Returns: `{ success, patterns_found, patterns_stored }`

**GET /api/patterns**
- Retrieves patterns for authenticated user
- Query params:
  - `type`: Filter by pattern_type (frequency, temporal, semantic)
  - `min_support`: Minimum support count (default: 3)
  - `limit`: Number of results (default: 20)
- Returns: `{ success, patterns, count }`

### Files Created

- `packages/automation/src/pattern-detection.ts` - Pattern mining algorithm
- `apps/web/app/api/patterns/mine/route.ts` - Mining endpoint
- `apps/web/app/api/patterns/route.ts` - Retrieval endpoint
- `apps/web/app/patterns/page.tsx` - Patterns visualization page

### Algorithm Details

**Sequence Extraction:**
- Extracts sequences of 3-5 events
- Events must be temporally contiguous (< 5 minutes apart)
- Groups by domain for site-specific patterns

**Pattern Matching:**
- Hashes sequences by: event type + URL path + DOM path
- Counts occurrences of each unique hash
- Filters for MIN_SUPPORT (3+ occurrences)

**Metrics:**
- **Support**: Number of times pattern occurs
- **Confidence**: Pattern occurrences / first event occurrences

Pattern detection unlocks workflow insights and automation suggestions! 🎯

---

## T16: Template Library

The system now includes 15 pre-built workflow templates for common automation patterns.

### What Changed

✅ **Workflow Templates** (`infra/supabase/supabase/migrations/20240101000004_workflow_templates.sql`)
- 15 common workflow templates inserted into `pattern_templates` table
- Templates cover data transfer, monitoring, content creation, and more
- Each template includes event sequence, category, and tags

✅ **Template API** (`apps/web/app/api/templates/route.ts`)
- GET endpoint to retrieve templates
- Filter by category or tags
- Public read-only access for authenticated users

### Template Categories

1. **Data Transfer**: Email→Spreadsheet, Download→Upload, Multi-source Aggregation
2. **Monitoring**: Dashboard Check
3. **Data Entry**: Form Auto-fill, Invoice Processing
4. **Reporting**: Weekly Reports
5. **Content Creation**: Research→Document, Content Publishing
6. **Social Media**: Cross-platform Posting
7. **Development**: Bug Reports, Code Review
8. **Shopping**: Price Comparison
9. **Scheduling**: Meeting Coordination
10. **Support**: Customer Support Responses
11. **Accounting**: Invoice Processing

### Template Structure

Each template includes:
- **Name**: Human-readable template name
- **Description**: What the workflow does
- **Template Pattern**: JSONB object with event sequence
- **Match Criteria**: JSONB object with fuzzy matching rules (min_support, min_confidence)
- **Category**: Workflow category
- **Confidence Threshold**: Minimum confidence for matching (default 0.7)

### Example Templates

**Email to Spreadsheet:**
```json
{
  "name": "Email to Spreadsheet",
  "template_pattern": {
    "sequence": [
      {"type": "click", "domain_contains": "mail.google.com"},
      {"type": "click", "text_contains": "copy"},
      {"type": "nav", "domain_contains": "sheets.google.com"},
      {"type": "click", "text_contains": "paste"}
    ]
  },
  "match_criteria": {
    "min_support": 3,
    "min_confidence": 0.7,
    "fuzzy_match": true
  },
  "category": "data_transfer"
}
```

**Daily Dashboard Check:**
```json
{
  "name": "Daily Dashboard Check",
  "template_pattern": {
    "sequence": [
      {"type": "nav", "url_contains": "dashboard"},
      {"type": "click", "text_contains": "refresh"},
      {"type": "idle", "min_dwell_ms": 5000}
    ]
  },
  "match_criteria": {
    "min_support": 5,
    "min_confidence": 0.8,
    "fuzzy_match": true
  },
  "category": "monitoring"
}
```

### Applying the Migration

1. **Run the migration**:
   ```bash
   # In Supabase Dashboard
   # Go to SQL Editor
   # Paste contents of 20240101000004_workflow_templates.sql
   # Click "Run"
   ```

2. **Verify templates**:
   ```sql
   SELECT name, category, confidence_threshold, is_active
   FROM pattern_templates
   ORDER BY created_at;
   ```

3. **Expected result**: 15 templates inserted with categories like `data_transfer`, `monitoring`, `data_entry`, etc.

### Using the Templates API

1. **Get all templates**:
   ```bash
   GET /api/templates
   ```

2. **Filter by category**:
   ```bash
   GET /api/templates?category=data_transfer
   ```

3. **Limit results**:
   ```bash
   GET /api/templates?limit=5
   ```

### Testing Templates

1. **Apply the migration**:
   - Copy SQL from migration file
   - Paste into Supabase SQL Editor
   - Run the query

2. **Test API endpoint**:
   - Go to dashboard (ensures you're authenticated)
   - Open browser console
   - Run:
   ```javascript
   fetch('/api/templates', {
     headers: {
       'Authorization': `Bearer ${SESSION_TOKEN}`
     }
   }).then(r => r.json()).then(console.log)
   ```

3. **Verify RLS**:
   - Templates should be publicly readable
   - All authenticated users can access
   - No modification allowed (read-only)

### Benefits

- **Cold Start**: New users get template suggestions immediately
- **Fuzzy Matching**: Templates help identify patterns even with sparse data
- **Automation Ideas**: Templates suggest what automations are possible
- **Standardization**: Common workflows have consistent structure
- **Extensible**: Easy to add more templates via SQL

### Next Steps

- **T17**: Nightly pattern mining with pg_cron
- **T18**: Semantic clustering of similar events
- **T19**: Automation creation UI

---

## T17: Miner v0 (Frequency)

The system now includes a nightly job to automatically mine frequent patterns from user activity.

### What Changed

✅ **Pattern Miner Edge Function** (`infra/supabase/supabase/functions/pattern-miner/index.ts`)
- Supabase Edge Function for pattern mining
- Groups events by contiguous domain sequences
- Mines 3-5 step patterns with support threshold (3+ occurrences)
- Stores patterns in `patterns` table with support and confidence scores

✅ **Cron Job Setup** (`infra/supabase/supabase/migrations/20240101000005_pattern_miner_cron.sql`)
- Enables `pg_cron` extension
- Creates `invoke_pattern_miner()` function
- Creates `mine_patterns_sql()` function (SQL-only alternative)
- Schedules nightly job at 2 AM UTC

### How It Works

1. **Nightly Execution**:
   - Cron job triggers at 2 AM UTC every day
   - Processes all users with events in the last 7 days

2. **Pattern Mining**:
   - Groups events by contiguous sequences on same domain
   - Extracts patterns of length 3-5 steps
   - Counts frequency (support) for each pattern
   - Calculates confidence (frequency / total sequences)

3. **Pattern Storage**:
   - Stores patterns in `patterns` table
   - Upserts on conflict (updates support/confidence if pattern exists)
   - Tracks `last_seen` timestamp for pattern freshness

### Applying the Migration

1. **Run the migration**:
   ```bash
   # In Supabase Dashboard
   # Go to SQL Editor
   # Paste contents of 20240101000005_pattern_miner_cron.sql
   # Click "Run"
   ```

2. **Deploy the Edge Function** (Optional - for HTTP-based mining):
   ```bash
   cd infra/supabase
   supabase functions deploy pattern-miner
   ```

3. **Verify cron job**:
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE '%pattern%';
   ```

   Expected output:
   ```
   jobid | schedule   | command                        | nodename
   ------|------------|--------------------------------|----------
   1     | 0 2 * * *  | SELECT mine_patterns_sql()    | localhost
   ```

### Manual Testing

You can manually trigger pattern mining without waiting for the cron job:

1. **Using SQL function** (recommended):
   ```sql
   -- Mine patterns for all users
   SELECT * FROM mine_patterns_sql();

   -- Mine patterns for a specific user
   SELECT * FROM mine_patterns_sql('YOUR_USER_ID'::UUID);

   -- Custom parameters
   SELECT * FROM mine_patterns_sql(
     NULL,  -- user_id (NULL for all users)
     3,     -- min_support (minimum occurrences)
     7      -- lookback_days (days of history to analyze)
   );
   ```

2. **Using Edge Function**:
   ```bash
   curl -X POST \
     https://YOUR_PROJECT_REF.supabase.co/functions/v1/pattern-miner \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json"
   ```

3. **Via API endpoint** (create in web app):
   ```typescript
   // In apps/web/app/api/patterns/mine-cron/route.ts
   export async function POST() {
     const supabase = createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.SUPABASE_SERVICE_ROLE_KEY!
     );
     
     const { data, error } = await supabase.rpc('mine_patterns_sql');
     
     if (error) {
       return NextResponse.json({ error: error.message }, { status: 500 });
     }
     
     return NextResponse.json({ success: true, result: data });
   }
   ```

### Example Patterns

After mining, you'll see patterns like:

```sql
SELECT 
  pattern_sequence,
  support,
  confidence,
  last_seen
FROM patterns
WHERE user_id = 'YOUR_USER_ID'
ORDER BY support DESC
LIMIT 5;
```

Example output:
```
pattern_sequence                              | support | confidence | last_seen
----------------------------------------------|---------|------------|-------------------
{click:github.com, nav:github.com, click}     | 15      | 0.125      | 2025-10-12 02:00:00
{search:google.com, click, nav}               | 12      | 0.100      | 2025-10-12 02:00:00
{click:chatgpt.com, click, click, click}      | 8       | 0.067      | 2025-10-12 02:00:00
```

### Pattern Format

Each pattern is stored as an array of strings:
- Format: `{type}:{domain}`
- Example: `["click:github.com", "nav:github.com", "click:readme"]`

**Support**: Number of times the pattern appears  
**Confidence**: Probability of the pattern (support / total sequences)  
**Frequency**: Cumulative count across all mining runs

### Monitoring

1. **Check cron job status**:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'nightly-pattern-mining-sql')
   ORDER BY start_time DESC
   LIMIT 5;
   ```

2. **View recent patterns**:
   ```sql
   SELECT user_id, COUNT(*) as pattern_count, MAX(last_seen) as last_mined
   FROM patterns
   GROUP BY user_id
   ORDER BY last_mined DESC;
   ```

3. **Pattern statistics**:
   ```sql
   SELECT 
     COUNT(*) as total_patterns,
     AVG(support) as avg_support,
     MAX(support) as max_support,
     COUNT(DISTINCT user_id) as users_with_patterns
   FROM patterns;
   ```

### Unscheduling the Job

If you need to disable the nightly mining:

```sql
-- Unschedule the SQL-based miner
SELECT cron.unschedule('nightly-pattern-mining-sql');

-- Unschedule the edge function miner (if deployed)
SELECT cron.unschedule('nightly-pattern-mining');
```

### Benefits

- **Automated Discovery**: Patterns are discovered automatically every night
- **Historical Analysis**: Analyzes last 7 days of activity
- **Fresh Data**: Patterns are updated daily with new occurrences
- **Scalable**: Processes multiple users in parallel
- **Two Options**: Choose between Edge Function or SQL-only approach

### Next Steps

- **T18**: Semantic clustering for similar workflows
- **T19**: Automation creation UI based on detected patterns
- **T20**: Pattern visualization dashboard

---

## T16.1: Template Matching

The system now matches user activity against pre-built templates to suggest automations, even for new users with sparse data.

### What Changed

✅ **Template Matching Module** (`packages/automation/src/template-matching.ts`)
- Fuzzy matching algorithm for event sequences
- Confidence scoring based on support and coverage
- Adjusted thresholds for new users (day 1-7)
- Pattern matching with domain, URL, text, and type filters

✅ **Suggestions API** (`apps/web/app/api/templates/suggestions/route.ts`)
- GET endpoint to get personalized template suggestions
- Analyzes user's last 7 days of activity
- Adjusts confidence thresholds for new users
- Returns top 5 suggestions by default

✅ **Template Suggestions Component** (`apps/web/components/TemplateSuggestions.tsx`)
- Displays automation suggestions on dashboard
- Shows match confidence and category
- "New User Mode" badge for day 1-7 users
- Action button to create automations (placeholder)

✅ **Dashboard Integration** (`apps/web/app/dashboard/page.tsx`)
- Template suggestions appear below timeline chart
- Updates automatically when dashboard loads

### How It Works

1. **Event Sequence Matching**:
   - Sliding window approach over user's events
   - Fuzzy matching: 70% of pattern steps must match
   - Checks type, domain, URL, text, tagName, dwell time

2. **Confidence Scoring**:
   - **Support**: How many times pattern appears
   - **Coverage**: How much of user's activity matches
   - **Combined**: `(support * 0.7) + (coverage * 0.3)`

3. **New User Adjustments** (Day 1-7):
   - Day 1-3: 50% lower thresholds
   - Day 4-7: 70% of normal thresholds
   - Day 8+: Normal thresholds

4. **Template Categories**:
   - Color-coded badges (blue, green, yellow, purple, pink, etc.)
   - Organized by workflow type

### Example Match

**Template**: Email to Spreadsheet
```typescript
{
  sequence: [
    {type: "click", domain_contains: "mail.google.com"},
    {type: "click", text_contains: "copy"},
    {type: "nav", domain_contains: "sheets.google.com"},
    {type: "click", text_contains: "paste"}
  ]
}
```

**User Events**:
- 10:00 - click on email (gmail.com)
- 10:01 - click "Copy" button
- 10:02 - navigate to sheets.google.com
- 10:03 - click in cell A1 (paste)

**Result**: 100% match, 4 events, high confidence → **Suggest automation**

### Testing Template Matching

1. **Check templates exist**:
   ```sql
   SELECT COUNT(*) FROM pattern_templates WHERE is_active = true;
   ```
   Expected: 15 templates

2. **Test API** (from browser console on dashboard):
   ```javascript
   const supabase = createBrowserClient();
   const { data: { session } } = await supabase.auth.getSession();
   
   fetch('/api/templates/suggestions?limit=5', {
     headers: { 'Authorization': `Bearer ${session.access_token}` }
   }).then(r => r.json()).then(console.log);
   ```

3. **View on Dashboard**:
   - Go to `http://localhost:3000/dashboard`
   - Look for "💡 Automation Suggestions" card
   - Should appear below timeline chart

4. **Test with sparse data** (new user):
   - Create a fresh account
   - Capture 5-10 events using extension
   - Dashboard should show suggestions with "New User Mode" badge
   - Confidence thresholds will be adjusted

5. **Check match quality**:
   - Look at matched_events count
   - Check confidence percentage
   - Read match_reason for explanation

### API Response Example

```json
{
  "suggestions": [
    {
      "template_id": "uuid",
      "template_name": "Email to Spreadsheet",
      "category": "data_transfer",
      "confidence": 0.85,
      "matched_events": ["event1", "event2", "event3", "event4"],
      "match_reason": "Found 2 matching sequences (85% confidence)"
    }
  ],
  "user_age_in_days": 3,
  "events_analyzed": 47,
  "days_analyzed": 7,
  "is_new_user": true
}
```

### Benefits

- **Cold Start**: New users get suggestions from day 1
- **Fuzzy Matching**: Works even with imperfect matches
- **Adaptive**: Adjusts thresholds based on user experience
- **Personalized**: Based on actual user activity
- **Actionable**: Shows which events matched the pattern
- **Transparent**: Displays confidence and match reason

### Next Steps

- **T17**: Nightly pattern mining with frequency analysis
- **T18**: Semantic clustering for similar workflows
- **T19**: Create automations from template suggestions

---

## T06.1: Semantic Analysis Pipeline

Events are now automatically analyzed for intent classification and friction detection.

### What Changed

✅ **Semantic Module** (`packages/ingest/src/semantic.ts`)
- Intent classification using rule-based patterns
- Friction score calculation (0-1 scale)
- Success/failure detection
- Struggle signal identification

✅ **Intent Categories**
- `research`: Browsing, searching, learning
- `transaction`: Purchasing, checkout, payments
- `comparison`: Comparing products/services
- `creation`: Creating content, filling forms
- `communication`: Email, chat, messaging
- `unknown`: Unclassified activity

✅ **Ingest Pipeline** (`apps/web/app/api/ingest/route.ts`)
- Automatically classifies intent for every event
- Calculates friction score based on event metadata
- Stores results in `interaction_quality` table
- Non-blocking: doesn't fail if classification fails

✅ **API Integration** (`apps/web/app/api/events/route.ts`)
- Events now include `interaction_quality` data
- Intent filters work correctly in dashboard
- Friction scores available for analysis

### How It Works

1. **Intent Classification**:
   - URL patterns: `/cart`, `/checkout` → transaction
   - Event types: `search`, `form` → research/creation
   - Domain signals: `mail.google.com` → communication
   - Content signals: "compare", "vs" → comparison

2. **Friction Detection**:
   - Friction events → score +0.5
   - Error events → score +0.6
   - Rage clicks (>3) → score +0.3
   - Slow load (>5s) → score +0.3
   - Rapid scrolling → score +0.2
   - Maximum score: 1.0

3. **Success Detection**:
   - Success: URLs with `/success`, `/confirmation`, `/thank-you`
   - Failure: URLs with `/error`, `/failed`, or error events
   - Unknown: Everything else

4. **Struggle Signals**:
   - Array of strings describing friction
   - Examples: `rapid_scrolling`, `rage_clicks`, `slow_page_load`

### Testing Intent Classification

1. **Research intent**:
   - Search on Google: `https://google.com/search?q=...`
   - Visit Wikipedia, Stack Overflow, GitHub
   - Expected: `inferred_intent: "research"`

2. **Transaction intent**:
   - Visit any `/cart` or `/checkout` page
   - Click "buy now" or "add to cart" buttons
   - Expected: `inferred_intent: "transaction"`

3. **Communication intent**:
   - Open Gmail, Slack, or Discord
   - Check inbox or messages
   - Expected: `inferred_intent: "communication"`

4. **Comparison intent**:
   - Visit pages with "compare" or "vs" in URL/title
   - Open multiple product pages
   - Expected: `inferred_intent: "comparison"`

5. **Creation intent**:
   - Fill out any form
   - Click submit buttons
   - Visit `/create` or `/new` pages
   - Expected: `inferred_intent: "creation"`

6. **Verify in dashboard**:
   - Go to `http://localhost:3000/dashboard`
   - Use intent filter dropdown
   - Select "Research", "Transaction", etc.
   - Events should filter correctly now!

### Database Schema

```sql
interaction_quality (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  friction_score NUMERIC(3,2),  -- 0.00 to 1.00
  success BOOLEAN,               -- true/false/null
  inferred_intent TEXT,          -- research, transaction, etc.
  struggle_signals TEXT[],       -- array of friction indicators
  created_at TIMESTAMPTZ
)
```

### Benefits

- **Intent Filters Work**: Dashboard filters now return actual results
- **Friction Tracking**: Identify where users struggle
- **Success Metrics**: Track completion rates
- **Pattern Detection**: Better understanding of workflows
- **No Manual Tagging**: Fully automatic classification

---

## T13: Context Builder

Events now include context arrays with IDs of 3-5 preceding events, enabling better pattern detection and workflow understanding.

### What Changed

✅ **Content Script** (`apps/extension/src/content.ts`)
- Tracks last 5 events in memory (FIFO buffer)
- Generates unique IDs for each event (timestamp + type + random)
- Includes `context` array with IDs of preceding events
- Each event knows what came before it

✅ **Background Script** (`apps/extension/src/background.ts`)
- Passes `context` array to API as `context_events`
- Stores event IDs in metadata for reference

✅ **Schema** (`packages/schemas/src/events.ts`)
- Already included `context_events` field (optional array of strings)

### How It Works

1. **Event Capture**:
   ```typescript
   // First event: context = []
   // Second event: context = [id1]
   // Third event: context = [id1, id2]
   // Sixth event: context = [id2, id3, id4, id5]
   ```

2. **Context Window**:
   - Maintains sliding window of last 5 events
   - Oldest events are removed (FIFO)
   - Each new event references 0-5 previous events

3. **Usage**:
   - Pattern detection can use context to understand sequences
   - Workflow mining can trace event chains
   - Enables "what led to this" analysis

### Testing Context Builder

1. **Reload extension**:
   - Go to `chrome://extensions`
   - Click the reload button on your extension

2. **Capture events**:
   - Browse any website
   - Open browser console (F12)
   - Look for messages like: `[Content] Event captured: click on BUTTON (context: 2 events)`
   - Context count increases from 0 to 5

3. **Check uploaded events**:
   - Go to dashboard
   - First event on a page has empty context array
   - Subsequent events have context arrays with 1-5 IDs
   - Maximum 5 context IDs per event

4. **Verify in database**:
   - Open Supabase dashboard
   - Go to Table Editor → `events`
   - Check the `context_events` column (JSONB array)
   - Click on any event to see its context array

### Benefits

- **Better Pattern Detection**: Understand event sequences
- **Workflow Mining**: Trace chains of actions
- **Context-Aware Automations**: Triggers can check "what happened before"
- **Debugging**: See event history for any action
- **Improved Accuracy**: Patterns are more meaningful with context

---

## T14: Offline Queue

The extension now uses IndexedDB for persistent event storage with exponential backoff retry logic.

### What Changed

✅ **Offline Queue Module** (`apps/extension/src/offline-queue.ts`)
- IndexedDB wrapper for persistent event storage
- Two object stores: `event_queue` and `retry_metadata`
- Events survive browser restarts and extension reloads
- Indexes on `nextRetryAt` and `timestamp` for efficient queries

✅ **Background Script** (`apps/extension/src/background.ts`)
- Uses IndexedDB instead of chrome.storage for event queue
- Implements exponential backoff: 2^retryCount seconds (max 1 hour)
- Respects retry timing - only attempts events when `nextRetryAt <= now`
- Dequeues events after successful upload
- Schedules retry for failed events

### How It Works

1. **Event Capture**:
   - Events are queued in memory first (fast)
   - Batch uploaded every 30 seconds or when batch size reaches 10
   - If upload fails → stored in IndexedDB

2. **Offline Behavior**:
   - No network? Events go to IndexedDB immediately
   - No auth token? Events go to IndexedDB
   - API returns error? Events go to IndexedDB

3. **Retry with Exponential Backoff**:
   ```
   Attempt 1: Retry immediately (0s)
   Attempt 2: Retry after 2s
   Attempt 3: Retry after 4s
   Attempt 4: Retry after 8s
   Attempt 5: Retry after 16s
   Attempt 6: Retry after 32s
   Attempt 7+: Retry after 1 hour (max)
   ```

4. **Recovery**:
   - Periodic retry job runs every 30 seconds
   - Checks IndexedDB for events ready to retry
   - Uploads in batches of 50 events
   - Successful uploads → removed from queue
   - Failed uploads → rescheduled with longer backoff

### Testing Offline Queue

1. **Test offline capture**:
   - Open Chrome DevTools (F12) → Network tab
   - Click "Offline" to disable network
   - Browse websites and capture events
   - Check console: `[Background] Upload error (likely offline)`
   - Events are queued in IndexedDB

2. **Verify queue persistence**:
   - Go to DevTools → Application → IndexedDB
   - Find `observe_create_offline` database
   - Check `event_queue` store - should contain your events
   - Close and reopen browser - events still there!

3. **Test reconnection**:
   - Re-enable network in DevTools
   - Wait ~30 seconds for retry job
   - Check console: `[Background] Retry successful: uploaded X events`
   - IndexedDB queue should be empty

4. **Test exponential backoff**:
   - Disable network again
   - Capture some events
   - Re-enable network briefly, then disable (simulate flaky connection)
   - Watch console logs for increasing retry delays
   - Example: `[OfflineQueue] Scheduled retry for event xxx in 8s (attempt 3)`

### Queue Statistics

Check queue stats in the background service worker console:
- `[Background] Retrying X pending events (Y total in queue)`
- Pending = ready to retry now
- Total = all events in queue (including those waiting for backoff)

### Benefits

- **No Data Loss**: Events survive offline periods and browser crashes
- **Smart Retry**: Exponential backoff prevents server hammering
- **Efficient**: IndexedDB handles large queues better than chrome.storage
- **Persistent**: Queue survives browser restarts
- **Battery Friendly**: Respects backoff timing, doesn't spam retries

---

## T15: Upload Transport

Enhanced upload transport with batch size control and 413 error handling.

### What Changed

✅ **Batch Size Validation**
- Checks if batch exceeds 100 events (API limit)
- Automatically splits large batches before upload
- Prevents API rejections proactively

✅ **413 Error Handling** (`apps/extension/src/background.ts`)
- Detects `413 Payload Too Large` responses
- Automatically splits batch and retries
- Recursive splitting: 50 → 25 → 12 → 6 (min 10)
- Each chunk uploaded with small delay (100ms)

✅ **Payload Size Estimation**
- `estimatePayloadSize()` function to approximate request size
- Helps decide if batch should be split preemptively
- Prevents unnecessary API calls

✅ **uploadBatchWithSplit()** Function
- Handles automatic batch splitting
- Recursive retry with smaller batch sizes
- Falls back to offline queue if still failing
- Logs split progress for debugging

### How It Works

1. **Before Upload**:
   ```typescript
   if (events.length > 100) {
     // Split into batches of 50
     uploadBatchWithSplit(events, session);
   }
   ```

2. **On 413 Error**:
   ```typescript
   if (response.status === 413) {
     // Split batch in half and retry
     uploadBatchWithSplit(events, session, maxBatchSize / 2);
   }
   ```

3. **Recursive Splitting**:
   ```
   150 events → Split into 3 batches of 50
   50 events → Upload directly
   If 413 → Split into 2 batches of 25
   If still 413 → Split into 2 batches of 12
   Minimum batch size: 10 events
   ```

4. **Fallback**:
   - If still failing after splitting to 10 events → Queue offline
   - Will retry with exponential backoff (T14)

### Testing Upload Transport

1. **Test normal upload** (< 100 events):
   - Browse normally
   - Check console: `[Background] Uploaded X events successfully`
   - No splitting should occur

2. **Test large batch splitting**:
   - Simulate many events quickly (e.g., rapid clicking)
   - Let queue grow past 100 events
   - Check console: `[Background] Batch too large (X events), splitting...`
   - See: `[Background] Splitting X events into batches of 50`

3. **Test 413 handling** (optional):
   - Would need to temporarily lower API limit to test
   - Extension detects 413 and automatically splits
   - Check console for split logs

4. **Verify JWT authentication**:
   - All uploads include `Authorization: Bearer {token}`
   - Token validated by Supabase RLS
   - Expired tokens trigger offline queueing

### Features

- **Batch Size Control**:
  - Hard limit: 100 events per batch (API constraint)
  - Default: 10 events per batch (configurable)
  - Automatic splitting for larger batches

- **Smart Retry**:
  - 413 errors → Split and retry immediately
  - Other errors → Queue offline with exponential backoff
  - Network errors → Queue offline

- **JWT Authentication**:
  - Uses Supabase session token
  - Sent as `Authorization: Bearer {token}` header
  - Token expiry checked before upload

- **Performance**:
  - Small delay (100ms) between split batch uploads
  - Prevents server overload
  - Maintains upload order

### Benefits

- **Reliable**: Handles oversized payloads gracefully
- **Automatic**: No manual intervention needed
- **Efficient**: Splits only when necessary
- **Observable**: Clear console logs for debugging
- **Safe**: Falls back to offline queue on persistent errors

---

## T17: Miner v0 (Frequency)

The system now includes a nightly job to automatically mine frequent patterns from user activity.

### What Changed

✅ **Pattern Miner Edge Function** (`infra/supabase/supabase/functions/pattern-miner/index.ts`)
- Supabase Edge Function for pattern mining
- Groups events by contiguous domain sequences
- Mines 3-5 step patterns with support threshold (3+ occurrences)
- Stores patterns in `patterns` table with support and confidence scores

✅ **Cron Job Setup** (`infra/supabase/supabase/migrations/20240101000005_pattern_miner_cron.sql`)
- Enables `pg_cron` extension
- Creates `invoke_pattern_miner()` function
- Creates `mine_patterns_sql()` function (SQL-only alternative)
- Schedules nightly job at 2 AM UTC
- Cleans up duplicate patterns before adding unique constraint

### How It Works

1. **Nightly Execution**:
   - Cron job triggers at 2 AM UTC every day
   - Processes all users with events in the last 7 days

2. **Pattern Mining**:
   - Groups events by contiguous sequences on same domain
   - Extracts patterns of length 3-5 steps
   - Counts frequency (support) for each pattern
   - Calculates confidence (frequency / total sequences)

3. **Pattern Storage**:
   - Stores patterns in `patterns` table
   - Upserts on conflict (updates support/confidence if pattern exists)
   - Tracks `last_seen` timestamp for pattern freshness

### Applying the Migration

1. **Run the migration**:
   ```bash
   # In Supabase Dashboard
   # Go to SQL Editor
   # Paste contents of 20240101000005_pattern_miner_cron.sql
   # Click "Run"
   ```

2. **Verify cron job**:
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE '%pattern%';
   ```

   Expected output:
   ```
   jobid | schedule   | command                        | nodename
   ------|------------|--------------------------------|----------
   1     | 0 2 * * *  | SELECT mine_patterns_sql()    | localhost
   ```

### Manual Testing

You can manually trigger pattern mining without waiting for the cron job:

1. **Using SQL function** (recommended):
   ```sql
   -- Mine patterns for all users
   SELECT * FROM mine_patterns_sql();

   -- Mine patterns for a specific user
   SELECT * FROM mine_patterns_sql('YOUR_USER_ID'::UUID);

   -- Custom parameters
   SELECT * FROM mine_patterns_sql(
     NULL,  -- user_id (NULL for all users)
     3,     -- min_support (minimum occurrences)
     7      -- lookback_days (days of history to analyze)
   );
   ```

2. **Using Edge Function**:
   ```bash
   curl -X POST \
     https://YOUR_PROJECT_REF.supabase.co/functions/v1/pattern-miner \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json"
   ```

3. **Via API endpoint** (create in web app):
   ```typescript
   // In apps/web/app/api/patterns/mine-cron/route.ts
   export async function POST() {
     const supabase = createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.SUPABASE_SERVICE_ROLE_KEY!
     );
     
     const { data, error } = await supabase.rpc('mine_patterns_sql');
     
     if (error) {
       return NextResponse.json({ error: error.message }, { status: 500 });
     }
     
     return NextResponse.json({ success: true, result: data });
   }
   ```

### Example Patterns

After mining, you'll see patterns like:

```sql
SELECT 
  sequence,
  support,
  confidence,
  last_seen
FROM patterns
WHERE user_id = 'YOUR_USER_ID'
ORDER BY support DESC
LIMIT 5;
```

Example output:
```
sequence                                      | support | confidence | last_seen
----------------------------------------------|---------|------------|-------------------
[{"type":"click","url":"github.com"}...]      | 15      | 0.125      | 2025-10-12 02:00:00
[{"type":"search","url":"google.com"}...]     | 12      | 0.100      | 2025-10-12 02:00:00
[{"type":"click","url":"chatgpt.com"}...]     | 8       | 0.067      | 2025-10-12 02:00:00
```

### Pattern Format

Each pattern is stored as JSONB array containing event objects:
- Format: Array of event objects with `id`, `ts`, `url`, `type`, `user_id`, etc.
- Example: `[{"id": "...", "type": "click", "url": "https://..."}]`

**Support**: Number of times the pattern appears  
**Confidence**: Probability of the pattern (support / total sequences)  
**Pattern Type**: 'frequency' for T17 miner

### Monitoring

1. **Check cron job status**:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'nightly-pattern-mining-sql')
   ORDER BY start_time DESC
   LIMIT 5;
   ```

2. **View recent patterns**:
   ```sql
   SELECT user_id, COUNT(*) as pattern_count, MAX(last_seen) as last_mined
   FROM patterns
   GROUP BY user_id
   ORDER BY last_mined DESC;
   ```

3. **Pattern statistics**:
   ```sql
   SELECT 
     COUNT(*) as total_patterns,
     AVG(support) as avg_support,
     MAX(support) as max_support,
     COUNT(DISTINCT user_id) as users_with_patterns
   FROM patterns;
   ```

### Unscheduling the Job

If you need to disable the nightly mining:

```sql
-- Unschedule the SQL-based miner
SELECT cron.unschedule('nightly-pattern-mining-sql');

-- Unschedule the edge function miner (if deployed)
SELECT cron.unschedule('nightly-pattern-mining');
```

### Benefits

- **Automated Discovery**: Patterns are discovered automatically every night
- **Historical Analysis**: Analyzes last 7 days of activity
- **Fresh Data**: Patterns are updated daily with new occurrences
- **Scalable**: Processes multiple users in parallel
- **Two Options**: Choose between Edge Function or SQL-only approach

---

## T17.2: Semantic Pattern Clustering

### Overview

**Goal**: Cluster semantically similar patterns using embedding distance. Group different surface actions that achieve the same goal.

This task adds intelligent clustering to find patterns that are semantically similar even if they have different exact sequences. For example, "checkout on Amazon" and "checkout on eBay" would be clustered together even though the exact URLs and elements differ.

### What It Does

1. **Embedding-Based Clustering**: Uses event embeddings to calculate semantic similarity between patterns
2. **Cross-Pattern Similarity**: Compares average embeddings of events in each pattern
3. **Cluster Assignment**: Groups patterns with similarity above threshold (default 0.75)
4. **Automated Scheduling**: Runs weekly (Mondays 4 AM UTC) after temporal pattern mining

### Migration

Apply the migration:

```bash
cd /Users/ommistry/observe_and_create/infra/supabase
supabase db reset  # or push individual migration
```

Or manually via Supabase SQL Editor, run the full contents of:
```
/Users/ommistry/observe_and_create/infra/supabase/supabase/migrations/20240101000007_semantic_pattern_clustering.sql
```

### Functions Created

1. **cluster_patterns_by_event_similarity(user_id, threshold)**
   - Main clustering function
   - Uses average event embeddings for similarity
   - Default threshold: 0.75 (75% similarity)
   - Returns: clusters_created, patterns_updated

2. **cluster_patterns_by_event_similarity()** (no params)
   - Convenience wrapper
   - Clusters all users' patterns

3. **cluster_semantic_patterns(user_id, threshold, min_size)**
   - Advanced clustering with configurable cluster size
   - Minimum cluster size filter (default: 2)

### Testing

Test the clustering function manually:

```sql
-- Cluster patterns for all users
SELECT * FROM cluster_patterns_by_event_similarity();
```

Expected output:
```
clusters_created | patterns_updated
-----------------|------------------
5                | 12
```

**Check cluster results**:

```sql
-- View patterns with their cluster assignments
SELECT 
  semantic_cluster_id,
  COUNT(*) as pattern_count,
  AVG(support) as avg_support,
  jsonb_array_length(sequence) as seq_length
FROM patterns
WHERE semantic_cluster_id IS NOT NULL
GROUP BY semantic_cluster_id, jsonb_array_length(sequence)
ORDER BY pattern_count DESC;
```

**View cluster statistics using the view**:

```sql
SELECT * FROM pattern_cluster_stats ORDER BY pattern_count DESC LIMIT 10;
```

Example output:
```
user_id    | semantic_cluster_id | pattern_count | avg_support | patterns
-----------|---------------------|---------------|-------------|----------
444fb...   | sem_444fb..._0      | 3             | 8.67        | [...]
444fb...   | sem_444fb..._1      | 2             | 5.50        | [...]
```

### Cluster Format

Each cluster is identified by a unique `semantic_cluster_id`:
- Format: `sem_{user_id}_{counter}`
- Example: `sem_444fb749-c6d0-4d35-85b1-0e2cc247dc94_0`

**Patterns in same cluster**:
- Have semantically similar event sequences
- May have different exact URLs or domains
- Represent the same user workflow/intent

### Scheduled Job

**Cron schedule**: `0 4 * * 1` (Every Monday at 4 AM UTC)

Verify the cron job:

```sql
SELECT * FROM cron.job WHERE jobname = 'weekly-semantic-clustering';
```

Check execution history:

```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'weekly-semantic-clustering')
ORDER BY start_time DESC
LIMIT 5;
```

### Monitoring

1. **Total clusters per user**:
   ```sql
   SELECT 
     user_id,
     COUNT(DISTINCT semantic_cluster_id) as cluster_count,
     COUNT(*) as total_patterns
   FROM patterns
   WHERE semantic_cluster_id IS NOT NULL
   GROUP BY user_id;
   ```

2. **Cluster size distribution**:
   ```sql
   SELECT 
     COUNT(*) as patterns_in_cluster,
     COUNT(*) as num_clusters
   FROM (
     SELECT semantic_cluster_id, COUNT(*) as cnt
     FROM patterns
     WHERE semantic_cluster_id IS NOT NULL
     GROUP BY semantic_cluster_id
   ) clusters
   GROUP BY patterns_in_cluster
   ORDER BY patterns_in_cluster;
   ```

3. **Patterns without clusters**:
   ```sql
   SELECT COUNT(*) as unclustered_patterns
   FROM patterns
   WHERE semantic_cluster_id IS NULL
     AND pattern_type IN ('frequency', 'temporal');
   ```

### Manual Clustering

Run clustering for a specific user:

```sql
-- Cluster patterns for one user with custom threshold
SELECT * FROM cluster_patterns_by_event_similarity(
  '444fb749-c6d0-4d35-85b1-0e2cc247dc94'::uuid,
  0.70  -- 70% similarity threshold
);
```

Run clustering with advanced options:

```sql
-- Cluster with minimum cluster size
SELECT * FROM cluster_semantic_patterns(
  '444fb749-c6d0-4d35-85b1-0e2cc247dc94'::uuid,
  0.75,  -- similarity threshold
  2      -- minimum cluster size
);
```

### Unscheduling

Disable the weekly clustering job:

```sql
SELECT cron.unschedule('weekly-semantic-clustering');
```

### Benefits

- **Semantic Understanding**: Groups workflows by meaning, not just exact matches
- **Cross-Domain Patterns**: Identifies similar workflows across different websites
- **Better Automation**: Create automations that work across similar sites
- **Reduced Noise**: Consolidates similar patterns into meaningful clusters
- **Scalable**: Runs weekly to process all new patterns

### Use Cases

1. **E-commerce Checkout**: Group checkout flows from different retailers
2. **Form Filling**: Cluster similar form submission patterns
3. **Search Workflows**: Group search behaviors across platforms
4. **Content Creation**: Identify similar creation workflows (docs, sheets, emails)
5. **Research Patterns**: Cluster information gathering behaviors

---

## T17.3: Friction Point Detection

### Overview

**Goal**: Analyze `interaction_quality` table to find high-friction workflows and suggest automations specifically for struggle points.

This task identifies where users experience the most friction and prioritizes those workflows for automation to reduce struggle.

### What It Does

1. **Friction Detection**: Analyzes events with high friction scores (≥0.6)
2. **Pattern Analysis**: Finds patterns that contain high-friction events
3. **Automation Prioritization**: Flags patterns that should be automated to reduce friction
4. **Dashboard Views**: Provides insights into friction points across workflows

### Migration

Apply the migration:

```bash
cd /Users/ommistry/observe_and_create/infra/supabase
supabase db reset  # or push individual migration
```

Or manually via Supabase SQL Editor, run the full contents of:
```
/Users/ommistry/observe_and_create/infra/supabase/supabase/migrations/20240101000008_friction_point_detection.sql
```

### Functions Created

1. **detect_friction_points(user_id, threshold, lookback_days, limit)**
   - Finds URLs/event types with high friction
   - Groups by URL and event type
   - Returns friction count, avg score, struggle signals
   - Default threshold: 0.6, lookback: 30 days

2. **detect_friction_points()** (no params)
   - Convenience wrapper for all users

3. **find_high_friction_patterns(user_id, threshold, lookback_days)**
   - Finds patterns containing high-friction events
   - Flags patterns that should be automated
   - Returns automation recommendations

### Views Created

1. **friction_dashboard**
   - Shows friction points by URL and event type
   - Includes friction rate percentage
   - Lists common struggle signals
   - Minimum 3 high-friction events required

2. **automation_suggestions_with_friction**
   - Combines patterns with friction analysis
   - Adds `reduce_friction` flag
   - Includes suggestion priority (high/medium/low)
   - Ready-to-use suggestion payload

### Testing

Test friction detection:

```sql
-- Detect friction points for all users
SELECT * FROM detect_friction_points();
```

Expected output:
```
user_id    | url                  | event_type | friction_count | avg_friction_score | struggle_signals
-----------|----------------------|------------|----------------|--------------------|-----------------
444fb...   | https://example.com  | click      | 5              | 0.75               | {back_button, slow_load}
```

**View friction dashboard**:

```sql
SELECT * FROM friction_dashboard LIMIT 10;
```

**Find high-friction patterns**:

```sql
SELECT * FROM find_high_friction_patterns();
```

**View automation suggestions with friction flags**:

```sql
SELECT 
  pattern_id,
  suggestion_priority,
  reduce_friction_flag,
  avg_friction_score,
  support
FROM automation_suggestions_with_friction
WHERE reduce_friction_flag = true
ORDER BY suggestion_priority, support DESC
LIMIT 10;
```

### Friction Score Thresholds

- **0.7+**: High friction - immediate automation candidate
- **0.6-0.7**: Medium friction - automate if support ≥10
- **0.5-0.6**: Low friction - monitor

### Automation Prioritization

Patterns are prioritized for automation based on:

1. **High Priority**: friction ≥0.7 AND support ≥5
2. **Medium Priority**: 
   - friction ≥0.6 AND support ≥10, OR
   - confidence ≥0.8 AND support ≥15
3. **Low Priority**: All others

### Use Cases

1. **Identify Struggle Points**: Find where users repeatedly struggle
2. **Prioritize Automation**: Focus on high-friction workflows first
3. **Measure Impact**: Track friction reduction after automation
4. **User Experience**: Proactively suggest help for difficult tasks

### Dashboard Integration

The views are designed to power dashboard widgets:

**Friction Heatmap**:
```sql
SELECT 
  url,
  event_type,
  high_friction_events,
  friction_rate_pct,
  common_struggles
FROM friction_dashboard
ORDER BY friction_rate_pct DESC
LIMIT 20;
```

**Top Automation Opportunities**:
```sql
SELECT 
  suggestion_payload->>'name' as automation_name,
  suggestion_payload->>'description' as description,
  suggestion_priority,
  avg_friction_score,
  support
FROM automation_suggestions_with_friction
WHERE reduce_friction_flag = true
ORDER BY 
  CASE suggestion_priority
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    ELSE 3
  END,
  support DESC
LIMIT 10;
```

### Benefits

- **Proactive Assistance**: Identify and reduce user struggles automatically
- **Prioritized Automation**: Focus on workflows that cause the most friction
- **Data-Driven**: Uses actual friction metrics from user interactions
- **Reduce Churn**: Help users succeed at difficult tasks
- **Measure Success**: Track friction reduction over time

### Next Steps

After T17.3, you can:
- **T18**: Add real-time pattern detection in the extension
- **T19**: Build friction heatmap UI component
- **T20**: Create automations with "reduce friction" priority
- **T21**: Add friction-reduction analytics dashboard
