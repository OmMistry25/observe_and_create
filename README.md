# Observe & Create

An intelligent browser extension and web platform that passively collects user web usage data and automatically creates automation tools based on usage inference.

## What It Does

- **Passive Sensing**: Captures clicks, navigation, searches, and form interactions via browser extension
- **Smart DOM Extraction**: Automatically learns page structure for frequently visited pages
- **Pattern Mining**: Detects recurring workflows and suggests automations
- **Friction Detection**: Identifies user struggle points for proactive assistance
- **Privacy-First**: Local redaction, granular controls, and user consent management

## Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- Supabase account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/OmMistry25/observe_and_create.git
cd observe_and_create

# Install dependencies
pnpm install

# Set up environment variables
cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/web/.env.local with your Supabase credentials
```

### Setup

1. **Database Setup**: Follow [Setup Guide](docs/SETUP.md) to initialize Supabase
2. **Load Extension**: See [Extension Guide](docs/EXTENSION.md) for installation
3. **Run Development Server**: `pnpm dev`
4. **Access Dashboard**: http://localhost:3000/dashboard

## Documentation

- **[Setup Guide](docs/SETUP.md)** - Complete setup instructions (Supabase, migrations, RLS)
- **[Architecture](docs/ARCHITECTURE.md)** - System design and data flow
- **[API Documentation](docs/API.md)** - REST API endpoints reference
- **[Extension Guide](docs/EXTENSION.md)** - Browser extension installation and usage
- **[Testing Guide](docs/TESTING.md)** - Test suite and validation procedures
- **[Migrations](docs/MIGRATIONS.md)** - Database migration instructions
- **[Development](docs/DEVELOPMENT.md)** - Technical guides and troubleshooting
- **[Phase 1 Summary](docs/PHASE1.md)** - Smart DOM extraction implementation

## Analysis & Reports

- **[Lifetime Insights](reports/lifetime_insights.md)** - User behavior analysis report
- **[Data Collection Health Check](reports/data_collection_healthcheck.md)** - Data quality assessment

## Project Structure

```
apps/
  web/              # Next.js web application (dashboard + API)
  extension/        # Chrome MV3 browser extension
packages/
  schemas/         # Zod validation schemas
  ingest/          # Event processing and embeddings
  automation/      # Pattern mining and automation engine
  intelligence/    # Semantic analysis and intent classification
infra/
  supabase/        # Database migrations and SQL functions
docs/              # Documentation
reports/           # Analysis reports and insights
notebooks/         # Jupyter analysis notebooks
```

## Development

```bash
# Run tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Type check
pnpm type-check

# Build extension
cd apps/extension && pnpm build
```

## Roadmap

See [tasks.md](tasks.md) for detailed implementation roadmap and phases.

## Privacy & Security

- **Local Redaction**: PII and secrets redacted before upload
- **Row Level Security**: Database enforces user data isolation
- **Granular Controls**: Per-domain and per-category consent toggles
- **Transparency**: Privacy dashboard shows exactly what's captured

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Extension**: Chrome MV3 (Manifest V3), TypeScript, Vite
- **Database**: Supabase (PostgreSQL + pgvector)
- **Analysis**: Python (pandas, scikit-learn, UMAP), Jupyter notebooks

## License

See [LICENSE](LICENSE) file.

---

**Status**: In active development. See [Phase 1](docs/PHASE1.md) for completed features.
