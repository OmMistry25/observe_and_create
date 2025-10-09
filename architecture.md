# Architecture: Passive Browser Activity Intelligence -> Automation
Target stack: Next.js (App Router) for frontend + API. Supabase for DB, auth, vector search, storage, and scheduled jobs. Browser Extension (MV3) for passive sensing. TypeScript mono-repo.

---

## 1) High-Level System
Inputs -> Activity events from the browser (clicks, DOM context, dwell time, searches, form submits, tab focus/blur, network intent metadata, friction signals).
Processing -> Local redaction -> Upload -> Normalization -> Semantic understanding -> Embedding -> Vector store -> Multi-modal pattern mining -> Automation suggestions.
Outputs -> User-approved automations that execute via the extension (client RPA) or via server integrations (APIs).

### Data minimization and consent
- First-run permission screen with explicit scopes and an on/off toggle per domain.
- Local PII redaction and domain allow/deny list before any upload.
- Per-event transparency panel and data export/delete.
- All automations require explicit user approval and granular scopes.
- Granular capture controls: separate toggles for clicks, forms, searches, content.
- Configurable data retention with auto-deletion options.

---

## 2) Monorepo Layout
```
/apps
  /web                     # Next.js 14 app (frontend + API routes)
  /extension               # Chrome/Edge MV3 extension (background, content, UI)
/packages
  /sdk                     # Typed client SDK used by extension + web
  /schemas                 # Zod/TypeBox schemas, OpenAPI, type sharing
  /ingest                  # Normalizers, redactors, embeddings, semantic understanding
  /automation              # Pattern miners + rule engine + runners + repair
  /ui                      # Shared UI components (shadcn/ui, charts)
/infra
  supabase/                # SQL migrations, RLS, policies, edge functions
  deploy/                  # Vercel config, extension build scripts
/test
  /fixtures                # Synthetic activity generators
  /e2e                     # Playwright tests
```

---

## 3) File + Folder Structure (Key files)
### apps/web (Next.js + Supabase)
```
apps/web/
  app/
    (marketing)/
      page.tsx
    dashboard/
      layout.tsx
      page.tsx                 # Activity feed + analytics + intelligence insights
      automations/
        page.tsx               # Suggested + active automations
        [id]/
          page.tsx             # Automation detail, history, health
      settings/
        page.tsx               # Privacy, domains, export/delete, retention
        privacy/
          page.tsx             # Privacy dashboard with live capture preview
    api/
      ingest/route.ts          # Signed server endpoint for batched events
      suggest/route.ts         # Run miner on demand, return suggestions
      approve/route.ts         # Approve automation, create triggers
      run/route.ts             # Server-side runners (webhooks/integrations)
      feedback/route.ts        # Collect automation feedback
      health/route.ts          # Check automation health, validate selectors
  lib/
    supabase.ts                # Server/client Supabase helpers
    auth.ts                    # RLS session utilities
    embeddings.ts              # Embeddings client (sentence-transformers or OpenAI)
    redact.ts                  # Deterministic redaction funcs
  components/
    ActivityTable.tsx
    TimelineChart.tsx
    AutomationCard.tsx
    AutomationHealth.tsx       # Health status indicators
    ConsentModal.tsx
    PrivacyDashboard.tsx       # Live capture preview
    InsightCards.tsx           # Struggle points, time saved, patterns
  env.d.ts
  next.config.mjs
```

### apps/extension (MV3)
```
apps/extension/
  src/
    background.ts             # Service worker: storage, batching, messaging
    content.ts                # DOM sensors: clicks, dwell, inputs (opt-in)
    intent.ts                 # Query/search/url + heuristics
    realtime.ts               # In-session pattern detection
    nudge.ts                  # Contextual suggestion UI
    ui/popup.tsx              # Minimal control: pause, scopes, status
    ui/sidebar.tsx            # Live suggestions / quick actions
    permissions.ts            # Domain allow/deny, consent flows
    transport.ts              # Signed uploads -> apps/web/api/ingest
    actions.ts                # Client RPA runners for approved automations
    quality.ts                # Friction detection, success signals
  manifest.json
  vite.config.ts
```

### packages/sdk
```
packages/sdk/
  src/index.ts                # init(clientKey), track(event), flush(), getSuggestions()
  src/offline.ts              # IndexedDB queue + backoff
  src/types.ts                # Shared Event, Session, Automation types
  src/feedback.ts             # Feedback submission helpers
```

### packages/schemas
```
packages/schemas/
  event.ts                    # z.EventClick, z.EventSearch, z.EventForm
  session.ts                  # z.SessionStart/End, tab/window ids
  automation.ts               # z.Automation, z.Trigger, z.Action, z.Feedback
  privacy.ts                  # redaction rules, domain policies
  intent.ts                   # Intent classification types
  quality.ts                  # Friction scores, success signals
```

### packages/ingest
```
packages/ingest/
  normalize.ts                # Shape events into canonical form
  redact.ts                   # PII/secret scrubbing (regex + DOM context)
  embed.ts                    # Text + DOM -> embeddings
  semantic.ts                 # Intent classification, entity extraction
  context.ts                  # Session context builder (what led to this?)
  similarity.ts               # Semantic clustering of events
  index.ts                    # Pipeline(entry): normalize->redact->semantic->embed
```

### packages/automation
```
packages/automation/
  mine.ts                     # Sequence mining, frequent episode discovery
  mine-temporal.ts            # Time-based pattern detection (daily, weekly)
  mine-semantic.ts            # Semantic workflow clustering via embeddings
  selectors.ts                # Multi-strategy selector generation (CSS, XPath, ARIA, text)
  repair.ts                   # Auto-fix broken automations, suggest updates
  validation.ts               # Pre-run selector checks, element existence
  rules.ts                    # If-this-sequence-then-that templates
  suggest.ts                  # Create candidate automations with confidence
  templates.ts                # Pre-built workflow templates for cold start
  run-client.ts               # Extension runners (clicks, fill, submit)
  run-server.ts               # Server runners (HTTP, Supabase, Slack, Gmail)
  learning.ts                 # Learn from user corrections and feedback
```

### infra/supabase (Postgres + pgvector)
- Tables:
  - profiles: user profile, preferences, retention settings
  - domains: user-scoped allow/deny with timestamps
  - events: JSONB canonical events. Partitioned by day. RLS by user_id
  - event_embeddings: event_id, embedding vector, modality tags
  - interaction_quality: friction_score, success signals, inferred_intent
  - sessions: tab/window sessions, dwell summaries, context
  - patterns: mined sequences with support, confidence, lift, pattern_type
  - pattern_templates: pre-built common workflow patterns
  - automations: approved automations with versioning
  - automation_versions: version history, changes, performance deltas
  - triggers: schedule or event-driven triggers
  - runs: execution logs, status, latency, errors
  - automation_feedback: thumbs up/down, reasons, corrections
- Functions:
  - match_events(query_embedding, k)
  - mine_patterns(user_id, horizon_days, pattern_type)
  - mine_temporal_patterns(user_id, time_window)
  - mine_semantic_workflows(user_id, similarity_threshold)
  - create_automation(user_id, payload)
  - enqueue_run(automation_id, payload)
  - check_automation_health(automation_id)
  - apply_learning_corrections(pattern_id, corrections)
- RLS: all tables scoped by auth.uid()

---

## 4) Data Model (Types)
```ts
// Event (canonical)
type Event = {
  id: string
  user_id: string
  device_id: string           // For multi-device sync
  ts: string                  // ISO timestamp
  type: 'click'|'search'|'form'|'nav'|'focus'|'blur'|'idle'|'error'
  url: string
  title?: string
  dom_path?: string           // CSS/XPath fingerprint
  text?: string               // redacted snippet around action
  meta?: Record<string, any>  // e.g., input length, network intent, tool used
  dwell_ms?: number
  session_id: string
  context_events?: string[]   // IDs of preceding events for context
}

// Interaction Quality (semantic layer)
type InteractionQuality = {
  event_id: string
  friction_score: number      // 0-1 based on hesitation, errors, backtracking
  success: boolean            // Did user complete apparent goal?
  inferred_intent: 'research'|'transaction'|'comparison'|'creation'|'communication'
  struggle_signals: string[]  // ['rage_click', 'form_abandon', 'back_cycle']
}

// Pattern (mined workflow)
type Pattern = {
  id: string
  user_id: string
  pattern_type: 'frequency'|'temporal'|'semantic'
  sequence: Event[]
  support: number             // How often it occurs
  confidence: number          // Reliability score
  temporal_pattern?: {
    day_of_week?: number[]
    hour_of_day?: number[]
    trigger_event?: string
  }
  semantic_cluster_id?: string
  first_seen: string
  last_seen: string
}

// Automation (enhanced)
type Automation = {
  id: string
  user_id: string
  name: string
  description: string
  trigger: { 
    kind: 'schedule'|'url'|'pattern'|'realtime'
    spec: any 
  }
  actions: Array<{
    kind: 'click'|'fill'|'submit'|'http'|'script'
    spec: any
    selectors: SelectorBundle  // Multi-strategy selectors
  }>
  scope: { 
    domains: string[]
    permissions: string[] 
  }
  status: 'suggested'|'approved'|'active'|'paused'|'needs_repair'
  version: number
  health: {
    success_rate: number
    last_run: string
    failures: number
    needs_attention: boolean
  }
  created_from_pattern?: string
  template_id?: string
}

// Selector Bundle (resilient)
type SelectorBundle = {
  primary: { strategy: 'css'|'xpath'|'aria'|'text', value: string }
  fallbacks: Array<{ strategy: string, value: string, weight: number }>
  semantic_anchor?: string    // For embedding-based repair
  last_validated: string
}

// Automation Feedback
type AutomationFeedback = {
  automation_id: string
  run_id: string
  user_id: string
  feedback: 'helpful'|'not_helpful'|'needs_editing'
  reason?: string
  correction?: Partial<Automation>
  ts: string
}
```

---

## 5) State and Data Flow

### Extension Local State
- Consent flags and domain scopes
- Offline queue (IndexedDB)
- Recent pattern cache for real-time detection
- Active automation cache
- Device ID for multi-device tracking

### Server State
- Events, embeddings, interaction quality
- Mined patterns (frequency, temporal, semantic)
- Automations, versions, health status
- Run logs and feedback

### Flow (Enhanced)
1. **Capture**: Content script observes -> quality detection -> local redaction -> queue in IndexedDB
2. **Upload**: Background batches -> signed POST to /api/ingest
3. **Process**: API calls ingest pipeline -> normalize -> redact -> semantic analysis -> embed -> store events + embeddings + quality
4. **Real-time**: Extension detects in-session repetition -> shows gentle nudge
5. **Mining**: 
   - Nightly: Frequency miner runs via cron
   - Weekly: Temporal and semantic miners run
   - On-demand: User requests suggestions
6. **Suggest**: Template matching + mined patterns -> candidate automations with confidence
7. **Approve**: User reviews, edits scope, approves -> automation created
8. **Trigger**: Schedule, URL pattern, or real-time detection triggers run
9. **Execute**: 
   - Client: Extension actions with resilient selectors
   - Server: API-based runners for integrations
10. **Validate**: Pre-run health check -> execute -> log to runs
11. **Learn**: User feedback -> corrections applied -> future patterns improved
12. **Repair**: Failed automation -> repair.ts suggests fixes -> user approves update

---

## 6) Services and Connections
- Extension <-> Web: HTTPS with user JWT from Supabase. Signed uploads
- Web <-> Supabase: PostgREST, SQL functions, pgvector search, RLS enforced
- Embeddings: Server-side via sentence-transformers (local, privacy-first) or OpenAI (if accuracy needed)
  - Batch processing with aggressive caching
  - Consider local model for MVP, optionally upgrade
- Schedules: Supabase cron (edge functions) for nightly/weekly mining
- Webhooks: Optional connectors (Slack, Notion, Gmail) via server runners
- Multi-device: Sync patterns and automations via user_id, track device_id

---

## 7) Semantic Understanding Layer

### Intent Classification
- Classify each event sequence into intent categories:
  - **Research**: Reading, comparing, learning
  - **Transaction**: Purchasing, booking, submitting
  - **Comparison**: Opening multiple tabs, side-by-side viewing
  - **Creation**: Writing, designing, building
  - **Communication**: Email, messaging, collaboration
- Use combination of URL patterns, DOM context, and behavior signals

### Entity Extraction
- Extract structured data from page context:
  - Products, prices, dates
  - People, companies, locations
  - Tasks, projects, topics
- Store entities with events for semantic search

### Action Semantics
- Understand the *meaning* of actions:
  - Click-to-buy vs click-to-read vs click-to-navigate
  - Form submission: creation vs update vs search
  - Search: exploratory vs targeted
- Use DOM context (button text, form labels, page type)

### Contextual Embeddings
- Embed not just the event, but the context:
  - 3-5 preceding events
  - Page content summary
  - Inferred goal/intent
- Enables semantic similarity: "These different action sequences accomplish the same task"

---

## 8) Pattern Mining Strategy

### Hybrid Approach
- **Real-time** (extension): Simple sequence detection within session
- **Batch** (server): Deep mining nightly/weekly

### Mining Algorithms

**Frequency-based (T15)**
- Find sequences that repeat with min support threshold
- Group by domain for site-specific patterns
- Output: patterns with support count and confidence

**Temporal (T15.1)**
- Detect time-based patterns:
  - Daily routines (hour of day)
  - Weekly cycles (day of week)
  - Triggered patterns (within N minutes of event X)
- Use time-series clustering
- Output: patterns with temporal_pattern spec

**Semantic (T15.1)**
- Cluster event sequences by embedding similarity
- Find workflows that *look different* but are *semantically identical*
- Example: Different click paths to accomplish "export data to spreadsheet"
- Output: patterns with semantic_cluster_id

**Friction Detection**
- Identify where users struggle repeatedly:
  - High friction_score locations
  - Repeated failures at same step
  - Abandonment points
- Output: patterns marked as "struggle_point" for priority automation

### Progressive Disclosure
- **Week 1**: Activity feed, simple metrics
- **Week 2**: Frequency patterns, template matches
- **Week 3+**: Temporal predictions, semantic workflows, friction insights

---

## 9) Automation Resilience

### Multi-Strategy Selectors
Generate selector bundles with fallbacks:
1. **Primary**: Best available (CSS ID, unique class, ARIA)
2. **Fallbacks**: Ordered by reliability
   - CSS with data attributes
   - XPath with text content
   - ARIA labels
   - Semantic position (3rd button in header)
   - Text content matching
3. **Semantic Anchor**: Embedding of element + context for repair

### Health Monitoring
- Pre-run validation: Check if selectors still exist
- Post-run analysis: Success/failure tracking
- Health score: success_rate over last N runs
- Status updates:
  - `active`: healthy
  - `needs_repair`: failing, repair available
  - `paused`: too many failures

### Auto-Repair
When automation fails:
1. Attempt selector fallbacks in order
2. If all fail, use semantic anchor to find similar element via embeddings
3. Generate updated selector bundle
4. Suggest to user: "Site changed, found new path"
5. User approves -> new version created

### Validation Pipeline
```typescript
// Before execution
validateAutomation(automation) {
  - Check selectors exist on target page
  - Verify permissions still granted
  - Ensure page structure similar to when created
  - Return confidence score
}

// After failure
repairAutomation(automation, error) {
  - Analyze failure reason
  - Try selector fallbacks
  - Use embeddings to find similar elements
  - Generate repair suggestions
  - Return updated automation or null
}
```

---

## 10) Bootstrapping Intelligence

### Template Library
Ship with pre-built common workflows:
- "Copy from email to spreadsheet"
- "Daily dashboard checks"
- "Form auto-fill for repeated sites"
- "Weekly report generation"
- "Research workflow: search → compare → save"

### Template Matching
- Use fuzzy matching to detect user activity that fits templates
- Even with sparse data (days 1-7), can suggest relevant automations
- Templates include selector patterns, not exact selectors

### Progressive Learning
```
Day 1-3: Show activity feed, privacy controls
Day 4-7: Match against templates, show first suggestions
Week 2: Frequency patterns emerge
Week 3+: Temporal and semantic patterns, friction insights
Month 2: Highly personalized, predictive suggestions
```

---

## 11) Privacy + Safety Guardrails

### Redaction (Enhanced)
- **Default deny list**: Banking, health, password managers, adult content
- **Secret detection**:
  - Password inputs (type=password)
  - Credit card regex (Luhn algorithm)
  - SSN patterns
  - API keys and JWT tokens (regex + entropy check)
  - Email addresses -> hashed
  - Dollar amounts > $1000 -> redacted
- **On-device**: All redaction happens before network
- **Differential privacy**: Optional noise injection for dwell times

### Granular Controls
- **Per-category toggles**:
  - Capture clicks
  - Capture form interactions
  - Capture searches
  - Capture page content
  - Capture clipboard
- **Domain-level controls**: Allow/deny list with wildcards
- **Data retention**: 
  - Auto-delete after N days (configurable)
  - Immediate delete option
  - Export before delete

### Transparency
- **Privacy dashboard**: Live preview of what's captured
- **Event inspector**: Click any event to see exactly what was stored
- **Automation scopes**: Show exactly what permissions each automation has
- **Dry-run mode**: Test automation without executing

### Kill Switch
- **Instant pause**: Extension icon shows status, one-click pause
- **Panic delete**: Emergency delete all data button
- **Audit log**: User can see all data access (who/when/what)

---

## 12) Feedback & Learning Loop

### Feedback Collection
After each automation run:
- Thumbs up/down in notification
- Optional reason selection
- Edit automation button

### Learning Pipeline
```typescript
processFeedback(feedback) {
  if (feedback.feedback === 'not_helpful') {
    - Decrease confidence for similar patterns
    - Mark automation for review
    - Auto-pause after 3 negative feedbacks
  }
  
  if (feedback.correction) {
    - Store correction in automation_versions
    - Apply learning to similar pending suggestions
    - Update pattern scoring weights
  }
  
  if (feedback.feedback === 'helpful') {
    - Increase confidence for similar patterns
    - Look for other opportunities to apply this pattern
  }
}
```

### Continuous Improvement
- Track which suggestions get approved/rejected
- A/B test different confidence thresholds
- Learn optimal suggestion timing
- Personalize suggestion style per user

---

## 13) Observability

### Client (Extension)
- Lightweight metrics in background worker
- Performance: capture overhead, upload latency
- Health: offline queue size, failed uploads

### Server
- **runs** table: full execution logs
- **OpenTelemetry**: traces for ingest and mining pipelines
- **Dashboards**:
  - Time saved per automation
  - Success rate per automation
  - Top repetitive flows
  - Friction points
  - User engagement (suggestions shown/approved)

### User-Facing Insights
- "You saved X hours this week"
- "Top 3 repetitive tasks"
- "Automation Y has 95% success rate"
- "You tend to struggle with Z - want help?"

---

## 14) Build + Deploy

### Web
- **Host**: Vercel
- **Database**: Supabase managed (Postgres + pgvector)
- **Embeddings**: Server-side, cached
- **Env keys**: 
  - Public: Supabase anon key
  - Private: Service role key, OpenAI (optional)

### Extension
- **Build**: Vite with MV3 target
- **Store**: Chrome Web Store (+ Edge Add-ons)
- **Keys**: Only public anon key, all auth server-side
- **Updates**: Auto-update for fixes, manual approval for major versions

### CI/CD
```
.github/workflows/
  test.yml           # Type-check, lint, unit tests
  e2e.yml            # Playwright tests with synthetic activity
  deploy-web.yml     # Deploy to Vercel on main push
  build-ext.yml      # Build extension ZIP for releases
```

### Testing Strategy
- **Unit**: Pattern miners, redactors, selectors
- **Integration**: Ingest pipeline, embedding generation
- **E2E**: Full flows with Playwright
  - Synthetic activity generator creates test data
  - Verify mining produces expected patterns
  - Test automation execution on known sites
- **Fixtures**: Reproducible test scenarios for each pattern type

---

## 15) Scalability Strategy

### Data Volume
- **Event ingestion**: 
  - Consider separate queue (BullMQ/Inngest) if >10K events/sec
  - Start with Supabase Realtime, monitor performance
- **Partitioning**: Events table partitioned by day
- **Retention**: Auto-archive/delete old events per user settings

### Embeddings
- **Batch processing**: Group by user, dedupe similar events
- **Caching**: Cache embeddings for identical text
- **Local model**: sentence-transformers for cost + privacy
  - `all-MiniLM-L6-v2` (384d, fast)
  - Upgrade to `all-mpnet-base-v2` (768d) if accuracy needed
- **Fallback to OpenAI**: If local insufficient

### Pattern Mining
- **Partition**: By user and time window
- **Incremental**: Only re-mine changed data
- **Sampling**: For users with massive history, sample recent + representative

### Vector Search
- **pgvector** with HNSW index for <100K users
- **Migrate to Qdrant** if vector search becomes bottleneck
- **Sharding**: By user_id if needed

---

## 16) Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| **Privacy breach** | Strict redaction, local processing, RLS, transparency UI, audit logs |
| **Automation drift** (sites change) | Multi-strategy selectors, health monitoring, auto-repair, user feedback |
| **Over-automation** | Explicit approval, dry-run mode, easy rollback, pause after failures |
| **Storage costs** | Aggressive retention policies, auto-deletion, efficient partitioning |
| **False positives** (bad suggestions) | Confidence thresholds, feedback learning, template validation |
| **Extension performance** | Throttled capture, efficient batching, lazy processing |
| **User trust** | Privacy-first design, transparent data handling, full user control |
| **Cold start** (no patterns yet) | Template library, progressive disclosure, pre-trained templates |
| **Multi-device conflicts** | Device ID tracking, server-side merge, conflict resolution UI |

---

## 17) Success Metrics

### User Engagement
- Daily/weekly active users
- Average automations per user
- Suggestion approval rate

### Automation Quality
- Success rate per automation
- Time saved (measured by eliminated repetition)
- User satisfaction (feedback scores)

### Intelligence Accuracy
- Pattern mining precision/recall
- Semantic clustering quality
- Intent classification accuracy

### Business
- User retention (do they keep using it?)
- Expansion (do they add more automations over time?)
- Referrals (do they tell others?)

---

## 18) Future Enhancements (Post-MVP)

### Advanced Mining
- Hierarchical patterns (sub-workflows)
- Cross-user pattern sharing (privacy-preserving)
- Anomaly detection for security

### Extended Automation
- Server runners for non-browser tasks (Zapier-like)
- API integrations (Slack, Notion, Gmail, Calendar)
- Natural language automation creation: "Every Monday, email me a summary of my top visited sites"

### Intelligence
- LLM-based intent understanding
- Predictive suggestions: "You usually do X now, want to run it?"
- Collaborative filtering: "Users like you also automated Y"

### Platform
- Mobile app (observe mobile browser behavior)
- Desktop app (observe system-wide, not just browser)
- Team plans (shared automation library)
