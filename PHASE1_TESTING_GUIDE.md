# Phase 1 Testing Guide

## 🎯 Overview

This guide provides comprehensive testing instructions for Phase 1: Smart Adaptive Context Extraction. The test suite covers database functionality, extension behavior, API endpoints, and end-to-end workflows.

## 🚀 Quick Start

### 1. Setup Test Environment

```bash
# Copy environment variables for testing
cp .env.local .env.test

# Edit .env.test with your test database credentials
# (Use a separate Supabase project for testing)
```

### 2. Run Complete Test Suite

```bash
# Make script executable (first time only)
chmod +x scripts/test-phase1.sh

# Run all Phase 1 tests
./scripts/test-phase1.sh
```

### 3. Manual Verification

After automated tests pass, follow the manual verification checklist in the script output.

---

## 📋 Test Categories

### 1. Database Tests (`tests/database/`)

**Purpose**: Verify database schema, triggers, and materialized views.

#### URL Path Tests (`url-path.test.ts`)
- ✅ Auto-population of `url_path` from `url` field
- ✅ Normalization removes query parameters and hash
- ✅ Handles edge cases (root paths, malformed URLs)
- ✅ Indexing works efficiently

#### Page Profiles Tests (`page-profiles.test.ts`)
- ✅ CRUD operations on `page_profiles` table
- ✅ Auto-update timestamps on profile changes
- ✅ RLS policies prevent unauthorized access
- ✅ Query performance with large datasets

#### Frequent Subpaths Tests (`frequent-subpaths.test.ts`)
- ✅ Materialized view populates correctly
- ✅ Only includes paths with 3+ visits
- ✅ Time span calculations are accurate
- ✅ Refresh function works properly

### 2. Extension Tests (`tests/extension/`)

**Purpose**: Test PageProfiler class functionality in isolation.

#### PageProfiler Tests (`page-profiler.test.ts`)
- ✅ URL normalization logic
- ✅ Platform detection (Google Docs, GitHub, etc.)
- ✅ DOM structure analysis
- ✅ Content signal detection
- ✅ Extraction rule generation
- ✅ Profile creation and retrieval
- ✅ Content classification
- ✅ Error handling

### 3. API Tests (`tests/api/`)

**Purpose**: Verify API endpoints handle requests correctly.

#### Frequent Subpaths API Tests (`frequent-subpaths.test.ts`)
- ✅ Authentication required (401 for missing tokens)
- ✅ Returns correct data structure
- ✅ Handles query parameters (min_visits)
- ✅ Generates meaningful insights
- ✅ Error scenarios handled gracefully

### 4. End-to-End Tests (`tests/e2e/`)

**Purpose**: Test complete user workflows from event capture to insights.

#### Phase 1 Integration Tests (`phase1-integration.test.ts`)
- ✅ Complete user journey simulation
- ✅ Data flows through all components
- ✅ Performance with large datasets
- ✅ Edge cases and error scenarios
- ✅ Data consistency across operations

---

## 🔧 Manual Testing Steps

### 1. Database Verification

Run these queries in Supabase SQL Editor:

```sql
-- Check url_path column is populated
SELECT url, url_path, COUNT(*) as count 
FROM events 
WHERE url_path IS NOT NULL 
GROUP BY url, url_path 
ORDER BY count DESC 
LIMIT 10;

-- Check page_profiles table
SELECT * FROM page_profiles LIMIT 5;

-- Check frequent_subpaths view
SELECT * FROM frequent_subpaths LIMIT 10;

-- Refresh materialized view
SELECT refresh_frequent_subpaths();
```

### 2. Chrome Extension Testing

1. **Load Extension**:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" → Select `apps/extension/dist`

2. **Test Page Profiling**:
   - Visit any website
   - Open DevTools (F12) → Console
   - Look for: `[PageProfiler] Loaded X profiles from storage`

3. **Test Smart Extraction**:
   - Visit same page 3+ times
   - Look for: `[PageProfiler] ✅ Extracted DOM context for frequent page (3 visits)`
   - Check IndexedDB: DevTools → Application → IndexedDB → PageProfilerDB

4. **Test URL Path Tracking**:
   - Visit pages with query parameters
   - Check console logs show normalized `url_path`

### 3. Web Dashboard Testing

1. **Start Server**:
   ```bash
   pnpm run dev
   ```

2. **Test Dashboard**:
   - Visit `http://localhost:3000/dashboard`
   - Verify insights are generated
   - Check that frequent paths appear

3. **Test API Endpoint**:
   ```bash
   # Get auth token from browser DevTools
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        "http://localhost:3000/api/analysis/frequent-subpaths?min_visits=2"
   ```

### 4. Real-World Testing

**Scenario**: Simulate a typical workday

1. **Morning**: Visit work documents 3+ times
2. **Afternoon**: Browse social media briefly
3. **Evening**: Check frequent_subpaths view
4. **Verify**: Work documents appear, social media doesn't

---

## 📊 Expected Results

### Database
- ✅ `url_path` column populated for all events
- ✅ `page_profiles` table contains learned patterns
- ✅ `frequent_subpaths` view shows 3+ visit pages
- ✅ Triggers auto-update timestamps

### Extension
- ✅ Console shows PageProfiler activity
- ✅ IndexedDB stores page profiles
- ✅ DOM extraction only for frequent pages
- ✅ URL paths normalized correctly

### API
- ✅ Returns 401 for unauthorized requests
- ✅ Returns structured data for valid requests
- ✅ Insights include meaningful categories
- ✅ Performance acceptable (< 2 seconds)

### Dashboard
- ✅ Displays frequent paths
- ✅ Shows insights by category
- ✅ Updates with new data
- ✅ Handles empty states gracefully

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Tests Fail with "Missing Environment Variables"
```bash
# Solution: Create .env.test file
cp .env.local .env.test
# Edit with test database credentials
```

#### 2. Database Connection Errors
```bash
# Check Supabase credentials
# Verify test database is accessible
# Check network connectivity
```

#### 3. Extension Not Loading
```bash
# Rebuild extension
cd apps/extension
pnpm build

# Check for build errors
# Reload extension in Chrome
```

#### 4. API Returns 401
```bash
# Check authentication token
# Verify user is logged in
# Check token expiration
```

#### 5. No Insights Generated
```bash
# Check if you have 3+ visits to any page
# Verify materialized view is refreshed
# Check database for frequent_subpaths data
```

### Debug Commands

```bash
# Run specific test with verbose output
TEST_VERBOSE=true pnpm test tests/database/url-path.test.ts

# Check test database
psql "your_test_database_url" -c "SELECT COUNT(*) FROM events;"

# Monitor extension logs
# Open Chrome DevTools → Console on any page
```

---

## 📈 Performance Benchmarks

### Expected Performance

| Test Category | Target Time | Max Time |
|---------------|-------------|----------|
| Database Tests | < 5s | 10s |
| Extension Tests | < 2s | 5s |
| API Tests | < 3s | 8s |
| E2E Tests | < 10s | 20s |
| **Total Suite** | **< 20s** | **45s** |

### Database Performance

| Operation | Target | Max |
|-----------|--------|-----|
| Event Insert (100 records) | < 1s | 3s |
| Materialized View Refresh | < 5s | 15s |
| Frequent Paths Query | < 500ms | 2s |
| Page Profile Query | < 200ms | 1s |

---

## ✅ Success Criteria

Phase 1 is ready for production when:

### Automated Tests
- ✅ All test suites pass
- ✅ Performance meets benchmarks
- ✅ No flaky tests
- ✅ Good test coverage (>90%)

### Manual Verification
- ✅ Database schema works correctly
- ✅ Extension loads without errors
- ✅ Smart extraction triggers appropriately
- ✅ API endpoints return expected data
- ✅ Dashboard displays insights

### Real-World Testing
- ✅ Works with actual browsing data
- ✅ Handles edge cases gracefully
- ✅ Performance acceptable with real usage
- ✅ No data corruption or loss

---

## 🚀 Next Steps

After Phase 1 tests pass:

1. **Merge to Main**: Create PR with test results
2. **Deploy**: Deploy to staging environment
3. **Monitor**: Watch for issues in production
4. **Iterate**: Collect feedback and improve

---

**Ready to test?** Run `./scripts/test-phase1.sh` to get started! 🧪
