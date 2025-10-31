# Data Collection Health Check (Extension) — Internal

Purpose: Assess robustness/completeness of browser-extension event capture and propose focused fixes to improve next week’s data quality.

## 1) Executive summary
- Coverage is sufficient to extract journeys and friction signals, but several gaps limit precision (timestamp alignment, short sequences, missing DOM/semantic context in portions of events).
- Priorities:
  - Stabilize session/identity handoff from web app to extension; ensure Supabase client is always initialized before uploads.
  - Increase sequence context (capture short “glue” events and persist minimal window focus/visibility).
  - Normalize and enrich events (domains, URL patterns, selectors, scrolling depth).
  - Add lightweight reliability telemetry (upload success, queue sizes, retry counts).

## 2) Current pipeline (at-a-glance)
- Content script captures events (click, nav, friction) + semantic_context + document_context (when available).
- Background worker queues and batches → calls `/api/ingest` → Supabase.
- PageProfiler extracts page profile; uploads to `page_profiles` if Supabase initialized.
- Web app provides session + Supabase URL/Key via `/sync-extension` `postMessage` fallback.

Key fragility points:
- Supabase client not initialized in content/service worker at time of first uploads.
- Extension context invalidated (service worker reloads) → storage lookups fail.
- Partial context (semantic/document) missing on subset of events.
- Timestamp skew corrected downstream (we added +12h in analysis); should be corrected at ingestion time.

## 3) Quantitative health metrics to track (and target thresholds)
Run these quick checks weekly before analysis.

- Event coverage
  - events_total (baseline)
  - events_per_day distribution (no severe dips)
- Sessionization
  - sessions_total; median_session_len (target ≥ 5)
  - pct_sessions_len≥3 (target ≥ 70%)
- Sequence depth
  - distribution of sequence lengths 2–5 (target: ≥ 50% with len≥3)
  - unique_sequences / total_sequences (diversity without extreme sparsity)
- Context completeness
  - pct_events_with_semantic_context (target ≥ 80%)
  - pct_events_with_document_context (target ≥ 60%)
  - avg semantic_context size/keys; presence of `temporalContext`, `journeyState`
- Identity & integrity
  - pct_events_with_device_id (target 100%)
  - pct_events_with_user_id (post-auth; target ≥ 95% when logged-in)
  - duplicate id rate (target 0%)
- Upload reliability (from background logs/DB)
  - upload_success_rate (target ≥ 98%)
  - avg_queue_size during active browsing (target ≤ 5)
  - retry_count per day (target ≤ low single digits)
- Timestamp sanity
  - server_time - client_time skew (target < 2s; fix at ingestion if needed)
- URL normalization
  - pct_events_with_normalized_url (scheme/host/path isolated)
  - domain/path cardinality sanity (long-tail acceptable; no extreme parameter noise)
- Embedding coverage
  - pct_events_with_embedding (if embeddings are generated in pipeline; optional)
- Friction labeling signal
  - pct_events_labeled_friction; path-level concentration (ensure not 100% on many domains)

### Example cells to compute these in pandas
Paste in a scratch cell or notebook:
```python
import pandas as pd
from analysis.utils import load_all, sessionize, add_time_features
dfs = load_all()
events = add_time_features(dfs['events'])
events = sessionize(events, gap_minutes=30)

# Basic coverage
events_total = len(events)
events_per_day = events.groupby(events['ts'].dt.date).size()

# Session metrics
sess_sizes = events.groupby('session_id').size()
median_session_len = sess_sizes.median()
pct_sessions_len_ge3 = (sess_sizes.ge(3).mean()*100)

# Sequence lengths
paths = events[['session_id','url_path','ts']].dropna().sort_values(['session_id','ts'])
from collections import Counter
sub_counts = Counter()
for sid, grp in paths.groupby('session_id'):
    seq = grp['url_path'].tolist()
    for L in (2,3,4): 
        for i in range(0, max(0, len(seq)-L+1)):
            sub_counts[tuple(seq[i:i+L])] += 1
length_dist = pd.Series({len(k):0 for k in range(2,5)})
for k in sub_counts: length_dist[len(k)] = length_dist.get(len(k),0)+sub_counts[k]
pct_len_ge3 = 100*length_dist[[3,4]].sum()/length_dist.sum()

# Context completeness
pct_semantic = 100*events['semantic_context'].notna().mean() if 'semantic_context' in events else None
pct_document = 100*events['document_context'].notna().mean() if 'document_context' in events else None

# Identity / integrity
pct_device_id = 100*events['device_id'].notna().mean() if 'device_id' in events else None
dup_ids = events['id'].duplicated().mean() if 'id' in events else None

# URL normalization
url_cols = ['origin','domain','url_path']
pct_url_norm = 100*events[url_cols].notna().all(axis=1).mean() if set(url_cols).issubset(events) else None

# Summary
{
  'events_total': events_total,
  'median_session_len': median_session_len,
  'pct_sessions_len_ge3': pct_sessions_len_ge3,
  'pct_sequences_len_ge3': pct_len_ge3,
  'pct_semantic_context': pct_semantic,
  'pct_document_context': pct_document,
  'pct_device_id_present': pct_device_id,
  'dup_id_rate': dup_ids,
  'pct_url_normalized': pct_url_norm,
}
```

## 4) Answers to “Is 3 events enough for a sequence?”
- Empirically, many “atomic” tasks manifest as 2–3 consecutive path steps; but higher precision patterns generally need 3–4 to disambiguate noise.
- Recommendation:
  - Use min-length 3 for “pattern mining” but accept length-2 for “hints/suggestions.”
  - Back-off rule: allow length-2 if consecutive and within ≤ 2 minutes and same domain.
  - Add “intent glue” events: focus/blur, visibility, dwell thresholds (e.g., ≥5s) to improve context around short sequences.

## 5) Concrete improvements (surgical edits to extension)
- Reliability & initialization
  - Ensure `PageProfiler.initSupabase()` is awaited before first upload; gate uploads on `supabase != null`.
  - Persist last-known Supabase config in `chrome.storage.local` and verify on each upload attempt; re-init if missing.
  - Add minimal telemetry: `upload_attempt`, `upload_success`, `upload_fail`, `queue_size`, `retry_count` (daily aggregates).
- Event normalization
  - Always populate `origin`, `domain`, `url_path` from URL parsing; strip query/hash into `url_query`, `url_hash`.
  - Include `referer` (if available), `viewport_size`, `scroll_depth_pct`, `is_visible` (page visibility API).
  - Standardize `type` values; map synonyms to canonical (`nav`, `click`, `friction`...).
- Context completeness
  - Guarantee minimal `semantic_context` scaffold even when extraction fails:
    - `temporalContext.localTime`, `journeyState.sessionIndex`, `pageMetadata.title|og:tags`.
  - Reduce size but keep structure: store hashed text blocks (`content_hash`) to avoid PII while enabling similarity.
- Sequence signal quality
  - Add “glue events”: `focus`, `blur`, `visibilitychange`, “idle-start/stop” (e.g., 60s no input).
  - Dwell time bucketing per path; add `time_on_page_ms` computed on blur/nav.
  - Mark “entry” vs “return” visits (first seen in session vs repeated).
- Friction labels hygiene
  - Friction event thresholds: for `rapid_scroll`, derive on z-score of velocity per device; reduce false positives.
  - Add `friction_score` (0–1) and keep raw features (`scroll_velocity`, `rage_click_count`) to recalibrate later.
- Upload batching & backpressure
  - Cap batch size; exponential backoff on 429/5xx; flush on `beforeunload` if possible.
  - Persist queue across restarts; record `first_seen_at` for age of queued events.
- Timestamp accuracy
  - Include both `client_ts` and `server_received_ts`; drop downstream timezone hacks.
  - If clock skew detected (>2 minutes), log `clock_skew_ms`.
- Identity hygiene
  - Ensure `device_id` always set; `user_id` attached when authenticated.
  - Session handoff: when receiving `SUPABASE_SESSION` message, validate and confirm via log ping.

## 6) Small validation notebook cells
Paste/run weekly to catch regressions quickly.

```python
# 1) Context completeness heatmap
cols = ['semantic_context','document_context','device_id','origin','domain','url_path']
(events[cols].notna().mean()*100).sort_values(ascending=False)

# 2) Friction sanity by path
E = events.copy()
E['is_friction'] = E['type'].astype(str).str.contains('friction|rage', case=False, na=False)
(E.groupby('url_path')['is_friction']
  .mean()
  .sort_values(ascending=False)
  .head(20))

# 3) Queue/Upload telemetry (if logged to events/meta)
if 'meta' in events:
    telemetry = events['meta'].dropna().astype(str).str.contains('upload_').mean()
```

## 7) High-priority fixes (1–2 hours)
- Gate uploads on `supabase` readiness; retry init if context invalidated; add 3-line telemetry for success/queue.
- Normalize URL and ensure `device_id` on every event.
- Add `client_ts` field; stop applying timezone correction downstream.

## 8) Medium-priority (half-day)
- Add dwell-time and visibility/focus events; adopt min-length-3 sequences for patterns.
- Add hashed content fingerprints; throttle DOM capture on heavy pages.
- Recalibrate friction thresholds with per-device baselines.

## 9) Success criteria for next week’s run
- ≥ 80% events have semantic context; ≥ 60% have document context.
- ≥ 70% sessions have length ≥ 3; ≥ 50% sequences are length ≥ 3.
- Upload success ≥ 98%; average queue size during activity ≤ 5.
- Zero timestamp skew handling required in analysis (client_ts present).
- Duplicate IDs = 0; device_id presence = 100%.

---
Owner: Data/Extension
Next review: in 7 days