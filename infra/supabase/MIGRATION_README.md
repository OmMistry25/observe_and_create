# Database Migration Instructions

## Apply Migrations to Your Supabase Project

You have two options:

### Option 1: Via Supabase Dashboard (Recommended for T02)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/20240101000000_initial_schema.sql`
5. Paste into the SQL editor
6. Click **Run** (or Ctrl/Cmd + Enter)
7. Verify success - should see "Success. No rows returned"

### Option 2: Via Supabase CLI

```bash
# From project root
cd /Users/ommistry/observe_and_create/infra/supabase/supabase

# Link to your remote project (one-time setup)
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations to remote
npx supabase db push

# Or reset (drops and recreates - use with caution)
npx supabase db reset --db-url "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

**To find your PROJECT_REF**: 
- Go to Project Settings → General
- Your Project Reference ID is in the "Reference ID" field
- Or extract from your Project URL: `https://[THIS-IS-YOUR-REF].supabase.co`

## Verify Migration

After applying, test with:

```bash
cd /Users/ommistry/observe_and_create
pnpm dev
```

Visit: http://localhost:3000/api/health

Should return: `{"status": "ok", "message": "Supabase connection successful"}`

## What Was Created

✅ **13 tables**:
- profiles (user settings)
- domains (privacy controls)  
- sessions (browser sessions)
- events (activity data)
- event_embeddings (semantic search)
- interaction_quality (friction detection)
- patterns (mined workflows)
- pattern_templates (cold start templates)
- automations (approved workflows)
- automation_versions (change history)
- triggers (execution triggers)
- runs (execution logs)
- automation_feedback (learning data)

✅ **Indexes** for performance
✅ **RLS ready** (policies coming in T03)
✅ **Timestamps** with auto-update triggers

