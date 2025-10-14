#!/bin/bash

# Phase 1 Test Runner Script
# This script runs all Phase 1 tests in the correct order

set -e  # Exit on any error

echo "🧪 Phase 1 Test Suite Runner"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check if .env.test exists
if [ ! -f ".env.test" ]; then
    print_warning ".env.test not found. Creating from .env.local..."
    if [ -f ".env.local" ]; then
        cp .env.local .env.test
        print_success "Created .env.test from .env.local"
    else
        print_error ".env.local not found. Please create .env.test with test database credentials"
        exit 1
    fi
fi

# Install dependencies if needed
print_status "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    pnpm install
fi

# Build the project
print_status "Building project..."
pnpm build

# Run tests in order
echo ""
print_status "Starting Phase 1 Test Suite..."
echo ""

# 1. Database Tests
echo "📊 Database Tests"
echo "=================="
print_status "Running database integration tests..."

if pnpm test tests/database/; then
    print_success "✅ Database tests passed"
else
    print_error "❌ Database tests failed"
    exit 1
fi

echo ""

# 2. Extension Tests
echo "🔧 Extension Tests"
echo "==================="
print_status "Running extension unit tests..."

if pnpm test tests/extension/; then
    print_success "✅ Extension tests passed"
else
    print_error "❌ Extension tests failed"
    exit 1
fi

echo ""

# 3. API Tests
echo "🌐 API Tests"
echo "============="
print_status "Running API endpoint tests..."

if pnpm test tests/api/; then
    print_success "✅ API tests passed"
else
    print_error "❌ API tests failed"
    exit 1
fi

echo ""

# 4. End-to-End Tests
echo "🔄 End-to-End Tests"
echo "===================="
print_status "Running end-to-end integration tests..."

if pnpm test tests/e2e/; then
    print_success "✅ End-to-end tests passed"
else
    print_error "❌ End-to-end tests failed"
    exit 1
fi

echo ""

# 5. Manual Verification Steps
echo "🔍 Manual Verification Checklist"
echo "================================="
print_status "Please verify the following manually:"
echo ""
echo "1. 🗄️  Database Schema:"
echo "   - Run: SELECT * FROM events WHERE url_path IS NOT NULL LIMIT 5;"
echo "   - Run: SELECT * FROM page_profiles LIMIT 5;"
echo "   - Run: SELECT * FROM frequent_subpaths LIMIT 5;"
echo ""
echo "2. 🔧 Chrome Extension:"
echo "   - Load extension in Chrome (chrome://extensions)"
echo "   - Visit a page 3+ times and check console for PageProfiler logs"
echo "   - Verify IndexedDB has page profiles stored"
echo ""
echo "3. 🌐 Web Dashboard:"
echo "   - Start server: pnpm run dev"
echo "   - Visit: http://localhost:3000/dashboard"
echo "   - Check that insights are generated"
echo ""
echo "4. 📊 API Endpoints:"
echo "   - Test: GET /api/analysis/frequent-subpaths"
echo "   - Verify response includes insights and frequent paths"
echo ""

# Test Summary
echo "📋 Test Summary"
echo "==============="
print_success "All automated tests completed successfully!"
print_status "Phase 1 implementation is ready for manual verification"
echo ""
print_status "Next steps:"
echo "1. Run manual verification checklist above"
echo "2. Test with real browsing data for 24-48 hours"
echo "3. Monitor console logs and database for expected behavior"
echo "4. Create merge request when satisfied with results"
echo ""

print_success "🎉 Phase 1 Test Suite Complete!"
