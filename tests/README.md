# Phase 1 Test Suite

This directory contains comprehensive tests for Phase 1 of the Smart Adaptive Context Extraction feature.

## 🧪 Test Structure

```
tests/
├── setup.ts                    # Global test setup and utilities
├── database/                   # Database integration tests
│   ├── url-path.test.ts       # URL path functionality tests
│   ├── page-profiles.test.ts  # Page profiles table tests
│   └── frequent-subpaths.test.ts # Frequent subpaths view tests
├── extension/                  # Extension unit tests
│   └── page-profiler.test.ts  # PageProfiler class tests
├── api/                       # API endpoint tests
│   └── frequent-subpaths.test.ts # API route tests
├── e2e/                       # End-to-end integration tests
│   └── phase1-integration.test.ts # Complete workflow tests
└── README.md                  # This file
```

## 🚀 Running Tests

### Prerequisites

1. **Environment Setup**: Copy `.env.local` to `.env.test`:
   ```bash
   cp .env.local .env.test
   ```

2. **Dependencies**: Install test dependencies:
   ```bash
   pnpm install
   ```

3. **Database**: Ensure your test Supabase project is set up with all migrations applied.

### Quick Start

Run the complete Phase 1 test suite:

```bash
# Make script executable (first time only)
chmod +x scripts/test-phase1.sh

# Run all tests
./scripts/test-phase1.sh
```

### Individual Test Suites

```bash
# Database tests only
pnpm test tests/database/

# Extension tests only
pnpm test tests/extension/

# API tests only
pnpm test tests/api/

# End-to-end tests only
pnpm test tests/e2e/

# All tests
pnpm test
```

### Test Categories

#### 1. Database Tests (`tests/database/`)

**Purpose**: Verify database schema, triggers, and materialized views work correctly.

**Tests**:
- `url-path.test.ts`: URL path column auto-population and normalization
- `page-profiles.test.ts`: Page profiles table CRUD operations and RLS
- `frequent-subpaths.test.ts`: Materialized view population and refresh

**Key Assertions**:
- ✅ `url_path` column auto-populates from `url` field
- ✅ Page profiles can be created, updated, and queried
- ✅ Frequent subpaths view tracks 3+ visit pages correctly
- ✅ RLS policies prevent unauthorized access

#### 2. Extension Tests (`tests/extension/`)

**Purpose**: Test PageProfiler class functionality in isolation.

**Tests**:
- `page-profiler.test.ts`: All PageProfiler methods and edge cases

**Key Assertions**:
- ✅ URL normalization removes query params and hash
- ✅ Platform detection works for major sites
- ✅ DOM structure analysis finds selectors correctly
- ✅ Content signal detection identifies page types
- ✅ Extraction rules are generated appropriately
- ✅ Profile creation and retrieval works

#### 3. API Tests (`tests/api/`)

**Purpose**: Verify API endpoints handle requests correctly.

**Tests**:
- `frequent-subpaths.test.ts`: API route authentication and response format

**Key Assertions**:
- ✅ Authentication required (401 for missing/invalid tokens)
- ✅ Returns correct data structure for valid requests
- ✅ Handles edge cases gracefully
- ✅ Generates meaningful insights

#### 4. End-to-End Tests (`tests/e2e/`)

**Purpose**: Test complete user workflows from event capture to insights.

**Tests**:
- `phase1-integration.test.ts`: Full Phase 1 workflow simulation

**Key Assertions**:
- ✅ Complete user journey works end-to-end
- ✅ Data flows correctly through all components
- ✅ Performance is acceptable with large datasets
- ✅ Error scenarios are handled gracefully

## 🔧 Test Configuration

### Jest Configuration

Tests use Jest with the following configuration (`jest.config.js`):

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', // or 'jsdom' for extension tests
  roots: ['<rootDir>/apps', '<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000
};
```

### Environment Variables

Tests require these environment variables in `.env.test`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_test_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_test_service_role_key
```

### Test Utilities

Global test utilities are available in `tests/setup.ts`:

```typescript
// Wait for async operations
await global.testUtils.wait(1000);

// Create test data
const testUser = global.testUtils.createTestUser();
const testEvent = global.testUtils.createTestEvent();
const testProfile = global.testUtils.createTestProfile();
```

## 📊 Test Coverage

The test suite covers:

- **Database Layer**: 100% of new schema and functions
- **Extension Layer**: 95% of PageProfiler class methods
- **API Layer**: 100% of new endpoints
- **Integration**: Complete user workflows

## 🐛 Debugging Tests

### Verbose Output

Enable detailed console output:

```bash
TEST_VERBOSE=true pnpm test
```

### Individual Test Debugging

Run a specific test file:

```bash
pnpm test tests/database/url-path.test.ts --verbose
```

### Database Debugging

Check test data in Supabase:

```sql
-- View test events
SELECT * FROM events WHERE user_id LIKE 'test-user-%' ORDER BY ts DESC;

-- View test profiles
SELECT * FROM page_profiles WHERE user_id LIKE 'test-user-%';

-- View frequent subpaths
SELECT * FROM frequent_subpaths WHERE user_id LIKE 'test-user-%';
```

## 🚨 Common Issues

### 1. Environment Variables Missing

**Error**: `Missing Supabase environment variables for testing`

**Solution**: Ensure `.env.test` exists with correct credentials.

### 2. Database Connection Issues

**Error**: `Failed to connect to Supabase`

**Solution**: 
- Verify Supabase URL and service role key
- Check network connectivity
- Ensure test database is accessible

### 3. Test Timeouts

**Error**: `Timeout - Async callback was not invoked`

**Solution**:
- Increase timeout in `jest.config.js`
- Check for hanging database connections
- Verify async operations complete properly

### 4. Mock Issues

**Error**: `Cannot read property of undefined`

**Solution**:
- Check mock setup in test files
- Ensure all dependencies are properly mocked
- Verify test environment configuration

## 📈 Performance Benchmarks

Expected performance targets:

- **Database Tests**: < 5 seconds total
- **Extension Tests**: < 2 seconds total  
- **API Tests**: < 3 seconds total
- **E2E Tests**: < 10 seconds total
- **Total Suite**: < 20 seconds

## 🔄 Continuous Integration

For CI/CD pipelines, use:

```bash
# Install dependencies
pnpm install

# Run tests with coverage
pnpm test --coverage

# Run specific test suite
pnpm test tests/database/ --passWithNoTests
```

## 📝 Adding New Tests

When adding new functionality:

1. **Unit Tests**: Add to appropriate category directory
2. **Integration Tests**: Add to `e2e/` directory
3. **Update Documentation**: Update this README
4. **Update Scripts**: Update `test-phase1.sh` if needed

### Test Template

```typescript
import { createClient } from '@supabase/supabase-js';

describe('Feature: New Functionality', () => {
  let supabase: any;
  let testUserId: string;

  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    // Cleanup
  });

  test('should handle expected behavior', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

## 🎯 Success Criteria

Phase 1 tests pass when:

- ✅ All database operations work correctly
- ✅ Extension captures and processes events properly
- ✅ API endpoints return expected data
- ✅ Complete user workflows function end-to-end
- ✅ Performance meets benchmarks
- ✅ Error scenarios are handled gracefully

---

**Ready to test Phase 1?** Run `./scripts/test-phase1.sh` to get started! 🚀
