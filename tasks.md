# Tasks: Enhanced Granular MVP Plan
Scope: Passive sensing on a whitelist of domains, semantic understanding, activity feed, embeddings, multi-modal pattern mining (frequency + temporal + semantic), real-time suggestions, suggestions UI, manual approval, feedback loop, resilient client-side execution with health checks.

---

## Phase 0: Foundation

### T00 Repo and Base
- Create Turbo monorepo with apps and packages.
  - Start: run `pnpm dlx create-turbo@latest`.
  - End: folders per architecture exist and build passes.

### T01 Supabase Init
- Create project. Enable RLS. Create service/anon keys.
  - AC: Can connect from local Next.js via `.env.local`.

### T02 DB Migrations (Enhanced)
- Write SQL for: profiles, domains, events, event_embeddings, interaction_quality, sessions, patterns, automation_templates, automations, automation_versions, automation_feedback, triggers, runs.
  - Include temporal_pattern and semantic_cluster_id columns in patterns.
  - AC: `pnpm supabase db reset` applies with no errors.

### T03 RLS Policies
- Add auth.uid() policies for all user tables.
  - AC: Anonymous client cannot read others' rows.

---

## Phase 1: Web Application Core

### T04 Next.js App Scaffold
- App Router, shadcn/ui, Supabase client, protected routes.
  - AC: Auth works. `/dashboard` gated.

### T05 Ingest API Route
- POST /api/ingest validates with zod, queues embedding job, inserts rows.
  - AC: 200 on valid batch. 400 on invalid.

### T06 Embedding Worker
- Server util to embed event text/title/url and write event_embeddings.
  - Use sentence-transformers for local processing (privacy-first).
  - AC: Given seed events, vectors are stored. kNN query returns k items.

### T06.1 Semantic Analysis Pipeline
- Create semantic.ts to classify intent, extract entities from event context.
  - Store results in interaction_quality table.
  - AC: Test events show correct intent classification and entity extraction.

### T07 Dashboard Activity Feed
- Table of recent events with filters by domain, type, and intent.
  - AC: Pagination works. RLS enforced. Can filter by intent.

### T08 Timeline Chart
- Dwell per domain over time with intent breakdown.
  - AC: Displays 24h aggregation from SQL view.

### T08.1 Friction Heatmap
- Visualize where users struggle (high friction_score).
  - AC: Shows top friction points with event counts and avg friction score.

---

## Phase 2: Browser Extension Core

### T09 Extension Scaffold
- MV3 manifest, background, content, popup. Build with Vite.
  - AC: Loads in Chrome dev mode without errors.

### T10 Consent + Scopes UI
- First-run modal. Domain allow/deny. Pause switch. Category toggles.
  - AC: When denied, no events are captured or uploaded.

### T10.1 Privacy Dashboard (Extension)
- Real-time preview of what's being captured.
  - Show redacted events before they're uploaded.
  - AC: User can see exactly what data is collected with examples.

### T11 Sensors v1
- Content script captures: clicks, searches (query params), dwell, focus/blur.
  - Include DOM context, text snippets, element attributes.
  - AC: Console shows normalized events for whitelisted domains.

### T11.1 Friction Detection Sensors
- Detect rage clicks, dead clicks, mouse thrashing, form abandonment, back-button loops.
  - Calculate friction_score locally before upload.
  - AC: Test pages with deliberate errors show high friction scores.

### T12 Local Redaction
- Redact secrets: password inputs, CC regex, SSN patterns, emails (hash), amounts >$1000, API keys.
  - AC: Test page shows redacted payloads before upload.

### T13 Context Builder
- For each event, include IDs of 3-5 preceding events for semantic context.
  - AC: Uploaded events include context array.

### T14 Offline Queue
- IndexedDB queue with retry and exponential backoff.
  - AC: Disable network, capture events, re-enable, uploads flush.

### T15 Upload Transport
- JWT from Supabase, signed POST to /api/ingest with batch size control.
  - AC: 413 safety. Splits batch and retries.

---

## Phase 3: Pattern Mining & Intelligence

### T16 Template Library
- Create 10-15 common workflow templates with fuzzy matching.
  - Templates: email→spreadsheet, dashboard checks, form auto-fill, download→upload, weekly reports.
  - AC: Templates stored in automation_templates table. Can be queried.

### T16.1 Template Matching
- Match user activity against templates even with sparse data (first week).
  - Use embedding similarity for fuzzy matching.
  - AC: Day 1-7 users see relevant template suggestions if activity matches.

### T17 Miner v0 (Frequency)
- Nightly job: group by contiguous sequences on same domain. Mine top N repeating 3-5 step patterns.
  - Use support threshold (appears 3+ times).
  - AC: patterns table contains sequences with support count.

### T17.1 Miner v1 (Temporal)
- Weekly job: detect time-based patterns using hour-of-day and day-of-week.
  - Identify "every Monday 9am" or "after email notification" patterns.
  - AC: patterns table includes temporal_pattern field populated.

### T17.2 Miner v2 (Semantic)
- Cluster semantically similar sequences using embedding distance.
  - Group different surface actions that achieve same goal.
  - AC: patterns table includes semantic_cluster_id. Similar patterns clustered together.

### T17.3 Friction Point Detection
- Analyze interaction_quality to find high-friction workflows.
  - Suggest automations specifically for struggle points.
  - AC: Dashboard shows friction points. Suggestions include "reduce friction" flag.

---

## Phase 4: Real-Time Intelligence

### T18 Real-Time Pattern Detection
- Client-side: detect when user repeats a 3-step sequence within session (3+ times).
  - Buffer recent events in memory.
  - AC: Extension console shows "Pattern detected" when repetition occurs.

### T18.1 Contextual Nudges
- When pattern detected: show non-intrusive notification "I noticed you do this often. Want to automate?"
  - When visiting page with existing automation: show "Run [name]?" popup.
  - When high friction detected: show "I can help with this" suggestion.
  - AC: Nudges appear at appropriate times, dismissible, respect user dismissals (24h cooldown).

### T18.2 Nudge Timing Strategy
- Don't interrupt during active work. Wait for idle >2s.
  - Track dismissals to avoid re-showing.
  - AC: Nudges only show during natural pauses. Dismissed nudges don't re-appear within cooldown.

---

## Phase 5: Automation Suggestions & Approval

### T19 Suggestion Generator
- Create candidate automations from patterns and templates: name, description, confidence.
  - Include evidence: "You did this 5 times this week"
  - AC: GET /api/suggest returns list for the user with confidence scores.

### T20 Suggestions UI
- Cards with Preview Steps, Evidence, Confidence Score, Approve, Edit Scope, Dismiss.
  - Show which pattern or template it's based on.
  - AC: Clicking approve creates automations row with status approved.

### T20.1 Dry-Run Mode
- Before approval: simulate automation and highlight affected elements.
  - Show step-by-step what would happen.
  - AC: User can preview automation on actual page before approving.

---

## Phase 6: Resilient Automation Execution

### T21 Multi-Strategy Selector Generation
- Implement selectors.ts: generate CSS, XPath, ARIA, text content, position, semantic strategies.
  - Store all strategies with weights in automation actions.
  - AC: Test elements have 4+ selector strategies generated with priority weights.

### T21.1 Selector Health Checks
- Before execution: validate that selectors still work on current page.
  - Try strategies in priority order.
  - AC: If primary fails, tries fallbacks. Logs which strategy worked.

### T21.2 Auto-Repair
- When all selectors fail: use semantic description to find similar elements.
  - Use embeddings to match element purpose.
  - Propose updated selectors to user.
  - AC: Broken automation suggests 2-3 updated selector options. User can approve best one.

### T22 Client Runner v1
- Implement actions.ts to click → fill → submit using resilient selectors.
  - Include retry logic and graceful failures.
  - AC: Demo flow on a test site runs end-to-end when triggered manually.

### T22.1 Action Execution with Fallbacks
- Execute actions using multi-strategy selectors with fallback chain.
  - Log which strategy succeeded for learning.
  - AC: If primary selector fails, automatically tries fallbacks before erroring.

---

## Phase 7: Triggers & Execution

### T23 Trigger: URL Pattern
- Trigger when hostname+path matches pattern.
  - AC: Visiting test URL shows "Ready to run" and allows manual run.

### T23.1 Trigger: Temporal
- Schedule-based triggers (daily, weekly, specific times).
  - AC: Automation with "every Monday 9am" trigger shows next run time.

### T23.2 Trigger: Real-Time Pattern
- Trigger when real-time detector identifies pattern completion starting.
  - AC: After 2nd repetition, offer to run automation on 3rd.

### T24 Execution Logging
- Write to runs table with status, timings, selector used, success/failure.
  - AC: Dashboard run history visible per automation with full details.

### T24.1 Automation Health Dashboard
- Show per-automation: success rate (last 10 runs), last run time, selector validity, status.
  - Visual health indicator (green/yellow/red).
  - AC: Dashboard shows health metrics. Broken automations flagged in red.

---

## Phase 8: Feedback & Learning

### T25 Feedback Collection
- After each run: thumbs up/down widget + optional reason text field.
  - Track in automation_feedback table.
  - AC: POST /api/feedback stores rating and reason.

### T25.1 Feedback-Based Actions
- Low-rated automations (3+ negative in last 10 runs): auto-pause and notify user.
  - High-rated: boost confidence score for similar suggestions.
  - AC: Automation with 3 thumbs-down auto-pauses. User gets notification.

### T25.2 Learning from Corrections
- When user edits automation: store diff in automation_versions.
  - Extract patterns: track common corrections (e.g., "users always change timeout from 1s to 3s").
  - AC: automation_versions table contains change deltas. Dashboard shows version history.

### T25.3 Apply Learned Corrections
- For new suggestions similar to corrected ones: pre-apply learned improvements.
  - "Users typically adjust X to Y for this pattern" → automatically suggest Y.
  - AC: Similar automation suggestions show improved defaults based on past corrections.

### T25.4 Selector Strategy Learning
- Track which selector strategies work best per domain/site.
  - Weight successful strategies higher for future automations on same site.
  - AC: runs table shows selector_strategy_used. Next automation on same site prioritizes proven strategies.

---

## Phase 9: Privacy & Safety

### T26 Safety: Default-Deny Domains
- Block sensors on sensitive domains list (banking, health, government, password managers).
  - Hard-coded list + user can add custom.
  - AC: Visits to blocked domains produce zero events. Extension icon shows "blocked" state.

### T26.1 Granular Privacy Controls
- Settings page: toggle categories independently (clicks, forms, searches, dwell).
  - Per-domain granularity: allow/deny/partial.
  - AC: Disabling "form interactions" stops form event capture. Can set per domain.

### T26.2 Data Retention Settings
- User-configurable auto-delete: 7/30/90/365 days or never.
  - Scheduled job to hard-delete old events.
  - AC: Setting to 30 days removes events older than 30d. User sees retention policy in UI.

### T27 Export/Delete
- User data export (JSONL). Hard delete pipeline removes all user data.
  - Export includes events, patterns, automations, runs.
  - AC: Export button triggers download. Delete removes all rows for user_id and confirms completion.

---

## Phase 10: Testing & Quality

### T28 Synthetic Activity Generator
- Create script to generate realistic activity patterns for testing.
  - Include edge cases: rapid actions, long pauses, errors, abandonments, multiple tabs.
  - AC: Can generate 1000 events matching various personas in <1min.

### T28.1 Pattern Mining Tests
- Unit tests for each mining algorithm with known patterns.
  - Test frequency, temporal, and semantic miners.
  - AC: Test suite covers happy path + edge cases (sparse data, noise, ambiguous patterns).

### T28.2 Selector Generation Tests
- Unit tests for multi-strategy selector generation on sample DOM.
  - Verify all strategies generated correctly.
  - AC: Test elements produce 5+ valid selectors. Fallback chain works.

### T29 E2E Playwright Tests
- Test full flow: capture events → mine patterns → suggest automation → approve → execute.
  - Use synthetic test site with known workflows.
  - AC: CI passes headless tests. Covers main user journey end-to-end.

### T29.1 Selector Resilience Tests
- Test automation execution when page structure changes.
  - Simulate breaking primary selector, verify fallback works.
  - AC: Tests pass with modified DOM. Fallback selectors succeed.

### T29.2 Real-Time Detection Tests
- Test in-session pattern detection with rapid repetitive actions.
  - AC: Real-time detector fires after 3rd repetition within 5min window.

---

## Phase 11: Deployment & Operations

### T30 Packaging + Release
- Vercel deploy for web. Supabase production instance. Zip extension for store submission.
  - AC: Production web URL reachable. Extension ZIP builds reproducibly.

### T30.1 Environment Configuration
- Separate dev/staging/prod configs. Env validation on startup.
  - AC: Each environment has correct keys. Invalid config fails fast with clear error.

### T30.2 Monitoring Setup
- Set up error tracking (Sentry), performance monitoring, usage analytics.
  - Dashboard for key metrics: DAU, events/user, automation success rate.
  - AC: Can view real-time metrics. Errors logged with context.

### T30.3 CI/CD Pipeline
- GitHub Actions: type-check, lint, test on PR. Auto-deploy on merge to main.
  - AC: Failed tests block merge. Successful merge auto-deploys to staging.

---

## Phase 12: Polish & UX

### T31 Onboarding Flow
- First-run tutorial: explain concept, show value, set permissions, demo on test site.
  - Interactive walkthrough of first automation suggestion.
  - AC: New users complete onboarding. Understand privacy controls before any capture.

### T31.1 Progressive Disclosure UI
- Week 1: Show only activity feed + friction detection.
  - Week 2: Introduce simple patterns + templates.
  - Week 3+: Full automation suggestions + temporal patterns.
  - AC: UI adapts based on account age and data volume.

### T32 Empty States
- Helpful empty states for: no events yet, no patterns found, no automations approved.
  - Include tips, examples, links to tutorials.
  - AC: Every empty state shows actionable next step, not just blank screen.

### T33 Notification System
- In-app notifications for: automation ready to run, automation needs repair, feedback request.
  - Respect notification preferences (frequency, types).
  - AC: User receives timely notifications. Can configure in settings.

### T33.1 Success Celebrations
- Celebrate milestones: first automation, 10 hours saved, 100 runs completed.
  - Show time saved statistics prominently.
  - AC: Users see encouraging feedback. Time saved metric accurate and visible.

---

## Phase 13: Performance & Optimization

### T34 Ingest Batching Optimization
- Tune batch size and frequency for optimal performance vs latency.
  - Implement adaptive batching based on event volume.
  - AC: High-activity users batch every 30s. Low-activity batch every 5min. No dropped events.

### T34.1 Embedding Caching
- Cache embeddings by content hash. Avoid re-embedding identical content.
  - AC: Duplicate events use cached embeddings. Cache hit rate >70%.

### T34.2 Query Optimization
- Add indexes on frequently queried fields (user_id, ts, domain, type).
  - Optimize pattern mining queries with materialized views.
  - AC: Dashboard loads <500ms. Mining completes <30s for 10k events.

### T35 Extension Performance
- Profile content script overhead. Ensure <5ms impact on page load.
  - Throttle sensors during high CPU usage.
  - AC: Lighthouse score impact <2 points. Extension respects battery saver mode.

---

## Phase 14: Documentation

### T36 User Documentation
- Help center articles: getting started, privacy explained, creating automations, troubleshooting.
  - Video tutorials for key workflows.
  - AC: Comprehensive docs published. Search works. Videos embedded.

### T36.1 Developer Documentation
- API documentation for ingest endpoint, webhook integrations.
  - Architecture diagrams, data flow explanations.
  - AC: Developers can integrate using docs alone. Examples for all endpoints.

### T37 Changelog & Versioning
- User-facing changelog for features, fixes, privacy updates.
  - Semantic versioning for extension and API.
  - AC: Users notified of updates. Can view full changelog in app.

---

## Optional Stretch Goals (Post-MVP)

### S01 Advanced Semantic Mining
- LLM-based pattern explanation: "You're researching competitors every Tuesday"
  - Natural language automation creation: "Make this a routine"
  - AC: Users can describe desired automation in plain English.

### S02 Server Runners
- OAuth integrations: Slack, Notion, Gmail, Google Sheets, Linear.
  - Webhook-based automations for non-browser tasks.
  - AC: Can create "When I save in Gmail → append to Sheets" automation.

### S03 Multi-Device Sync
- Sync patterns and automations across user's devices.
  - Merge patterns detected on different machines.
  - AC: Automation approved on desktop works on laptop. Patterns from both devices combined.

### S04 Team Features
- Share automation templates within organization.
  - Team analytics: aggregate time saved, common patterns.
  - AC: Team admin can publish approved automations. Members can install with one click.

### S05 Automation Marketplace
- Community-contributed automation templates.
  - Rating and review system.
  - AC: Users can browse and install popular automations. Can publish their own.

### S06 Advanced Analytics
- Detailed productivity insights: time spent per category, efficiency trends.
  - Weekly report emails with insights and suggestions.
  - AC: Dashboard shows time allocation. Users get weekly digest email.

### S07 Mobile Extension
- iOS Safari and Android Chrome extension versions.
  - Adapted UI for mobile interactions.
  - AC: Extension works on mobile browsers. Patterns detected from mobile activity.

### S08 Voice Control
- Voice-triggered automation execution: "Run my morning routine"
  - Voice-based automation creation.
  - AC: Can speak command to trigger automation. Basic voice setup works.

### S09 Predictive Pre-fetching
- Predict next action based on patterns. Pre-load pages or data.
  - Proactive suggestions: "You usually check X next"
  - AC: Predicted actions shown. Pre-fetching reduces wait time by 30%.

### S10 Cross-Application Automation
- Desktop app to capture activity outside browser.
  - Automate sequences involving desktop apps + web.
  - AC: Can create automation that spans VS Code → GitHub → Slack.

### S11 A/B Testing Framework
- Test different automation strategies to find best approach.
  - Compare selector strategies, timing, suggestion phrasing.
  - AC: Can run A/B test on suggestion copy. See which performs better.

### S12 Advanced Repair with LLM
- When selectors break: use LLM to understand page changes and generate new selectors.
  - Natural language error explanations.
  - AC: Broken automation gets LLM-suggested fix. User sees plain English explanation of what changed.

---

## Implementation Timeline Estimate

**Phase 0-2 (Foundation + Core):** 3-4 weeks
- Repo setup, database, basic web app, extension scaffold, sensors

**Phase 3-5 (Intelligence + Real-Time):** 3-4 weeks  
- Pattern mining, semantic analysis, real-time detection, suggestions

**Phase 6-8 (Execution + Learning):** 2-3 weeks
- Resilient selectors, execution, triggers, feedback loops

**Phase 9-11 (Safety + Deploy):** 2-3 weeks
- Privacy controls, testing, deployment, monitoring

**Phase 12-14 (Polish + Docs):** 2-3 weeks
- UX improvements, optimization, documentation

**Total MVP:** ~12-17 weeks (3-4 months)

**Stretch Goals:** Additional 2-4 months depending on scope

---

## Success Metrics

### MVP Launch Criteria
- ✅ 100+ test events captured and processed without errors
- ✅ 5+ patterns detected from synthetic test data
- ✅ 3+ automation suggestions generated with >70% confidence
- ✅ End-to-end automation execution with 90% success rate on test site
- ✅ All privacy controls functional and tested
- ✅ Extension passes Chrome Web Store review
- ✅ Web app deployed and accessible
- ✅ Documentation complete

### Post-Launch Success Metrics (3 months)
- 1000+ active users
- 50,000+ events captured daily
- 10,000+ patterns detected
- 500+ automations created
- 80%+ automation success rate
- <1% error rate in event processing
- 4.0+ star rating in Chrome Web Store
- 20+ hours average time saved per user

---

## Risk Register & Contingencies

### High Priority Risks

**R1: Selector brittleness**
- Risk: Page changes break automations frequently
- Mitigation: Multi-strategy selectors, auto-repair, health checks, user corrections
- Contingency: If >30% breakage rate, prioritize semantic selectors over structural

**R2: Privacy concerns**
- Risk: Users uncomfortable with activity tracking
- Mitigation: Transparency, local processing, granular controls, clear value prop
- Contingency: Offer fully local-only mode with no cloud sync

**R3: Pattern false positives**
- Risk: Suggest automations for non-repetitive or random behaviors
- Mitigation: High confidence thresholds, evidence display, easy dismissal
- Contingency: Implement user feedback loop to quickly filter bad suggestions

**R4: Performance impact**
- Risk: Extension slows down browsing
- Mitigation: Lightweight sensors, batched uploads, profiling, throttling
- Contingency: Add performance mode that reduces capture fidelity

**R5: Cold start problem**
- Risk: Poor experience in first week with no patterns
- Mitigation: Pre-built templates, progressive disclosure, instant value via friction detection
- Contingency: Emphasize activity feed and insights before automation

### Medium Priority Risks

**R6: Embedding costs**
- Risk: OpenAI embeddings too expensive at scale
- Mitigation: Use sentence-transformers locally, cache aggressively
- Contingency: Implement tiered plans with embedding limits

**R7: Mining performance**
- Risk: Pattern mining takes too long with large datasets
- Mitigation: Incremental mining, partitioning, materialized views
- Contingency: Reduce mining frequency or limit analysis window

**R8: Browser compatibility**
- Risk: Extension doesn't work on all sites
- Mitigation: Extensive testing, graceful degradation, user reports
- Contingency: Maintain site compatibility list, quick fixes for popular sites

---

## Notes for Implementation

### Development Priorities
1. **Privacy First**: Implement redaction and controls before any data collection
2. **Value Before Automation**: Show activity insights and friction detection before suggesting automations
3. **Resilience Over Features**: Focus on selector reliability over adding more automation types
4. **Learn Fast**: Collect feedback early and iterate on suggestion quality

### Technical Debt to Avoid
- Don't skip RLS policies (security critical)
- Don't hardcode selectors (use multi-strategy from start)
- Don't skip error handling in sensors (silent failures harm trust)
- Don't defer mobile testing (responsive design easier early)

### Key Decision Points
- **Week 2**: Embeddings model selection (local vs API)
- **Week 4**: Pattern mining algorithm choice (evaluate accuracy vs speed)
- **Week 6**: Real-time suggestion UX testing (ensure not annoying)
- **Week 10**: Beta launch decision (gather feedback before public)

### Quality Gates
- Every phase must pass security review before next phase
- User testing required before moving from Phase 8 to Phase 9
- Performance benchmarks must meet targets before deployment
- Documentation must be complete before public launch
  

## T02.1 Device Identity + Merge Logic
- Add device_id field to events and sessions.
- Server merges events from multiple devices for the same user.
  - AC: device_id stored and visible in Supabase tables; miner merges correctly across devices.

## T06.2 Local Embedding Model Fallback
- Implement local sentence-transformers model with LRU cache and hash-based deduplication.
  - AC: When OpenAI key unavailable, fallback model used seamlessly; embedding vectors cached.

## T12.2 Event Budget + Rate Limit
- Enforce per-user daily event capture cap and server-side rate limiting.
  - AC: Over-cap users receive HTTP 429; background transport backs off with exponential delay.

## T18.3 Accessibility + Nudge Ergonomics
- Ensure popup and nudges are keyboard-accessible and respect reduced-motion OS settings.
  - AC: A11y audit passes; nudge cooldown persists across sessions.

## T21.3 Selector Bundle Schema
- Define selector bundle schema in packages/schemas/automation.ts and reference across suggest, run, repair.
  - AC: Validation ensures every automation action conforms to shared schema.

## T24.2 Run Metrics + Time Saved Model
- Track per-step execution timings; estimate baseline manual time vs automation runtime.
  - AC: Dashboard shows cumulative time saved per automation.

## T26.3 Retention Default + Policy Artifacts
- Implement 30-day default data retention with override in privacy dashboard.
  - AC: Chrome Web Store privacy URL and in-app disclosure required for publish.

## T29.3 Synthetic Test Site
- Build small static test site (Playwright-served) with stable selectors for end-to-end validation.
  - AC: Automated tests confirm selectors, friction, and nudge triggers behave deterministically.

## T30.4 Env Guard + Feature Flags
- Add kill-switch flags for realtime, screenshots, and semantic miners.
- Fail early when env keys missing.
  - AC: Disabled features show “not available” in UI; errors logged cleanly.

## T30.5 Audit + Incident Playbook
- Add structured logs with redaction and rotation; define incident handling checklist.
  - AC: Each run produces anonymized audit entry; rotation keeps 7 days locally.

## T30.6 Chrome Web Store Compliance
- Run Chrome Web Store checklist: limited permissions, disclosures, screenshots, privacy policy URL.
  - AC: Extension passes automated pre-submission review.

## T34.3 DB Indexes + pgvector HNSW
- Create indexes on (user_id, ts, domain). Add HNSW index for embeddings column.
  - AC: Query latency <100ms on 10M events; index verified via EXPLAIN ANALYZE.
