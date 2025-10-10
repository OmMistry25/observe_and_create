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

### Next Steps

Ready to proceed to **T11: Sensors v1**

