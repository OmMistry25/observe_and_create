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

**Once migrations are applied successfully, we can proceed to T03: RLS Policies**

