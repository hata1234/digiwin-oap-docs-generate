# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERP Documentation Auto-Generation Tool - A TypeScript CLI that generates API field documentation by querying SQL Server databases directly. All data comes from database queries to ensure accuracy.

## Essential Commands

### Development
```bash
npm run dev                    # Run in development mode (uses tsx)
npm run dev test              # Test database connection
npm run build                 # Compile TypeScript to dist/
npm start                     # Run compiled code
```

### Core Functionality
```bash
npm run explore operations    # Explore OAPMB operations
npm run explore -- --operation ACPI02  # Explore specific operation

npm run generate -- --operation ACPI02  # Generate docs for single operation
npm run generate-all          # Generate docs for all 101 operations

npm run import-excel          # Import and merge Excel documentation
npm run analyze-merge-all     # Analyze and merge all operations
```

### Linting/Type Checking
No lint or typecheck commands configured. Use TypeScript compiler for validation:
```bash
npx tsc --noEmit             # Type check without building
```

## Architecture

### Service Layer (`src/services/`)
- **database.service.ts**: Core SQL Server connectivity and queries
- **explorer.service.ts**: Interactive database exploration
- **excel-import.service.ts**: Excel file parsing and data extraction
- **merge.service.ts**: Merges Excel data with generated documentation
- **batch-merge-analyzer.service.ts**: Batch processing and conflict analysis

### Generator Layer (`src/generators/`)
- Each generator creates different output formats from the same field data
- All generators extend common patterns for consistency
- Output goes to `docs/operation_code/` directories

### CLI Structure
- Entry point: `src/index.ts` using Commander.js
- Commands: test, explore, generate, import-excel, analyze-merge
- All commands connect to SQL Server for real-time data

## Database Queries

The tool queries these key tables:
- **OAPMB**: Main operation definition table
- **OAPMD**: Operation field details
- Related tables for field relationships and constraints

## Environment Configuration

Required `.env` file (no example exists - create manually):
```env
DB_SERVER=your_server
DB_PORT=1433
DB_DATABASE=your_database
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_USE_WINDOWS_AUTH=false
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
DEFAULT_BATCH_SIZE=50
MAX_BATCH_SIZE=500
DEFAULT_OUTPUT_DIR=./output
EXCEL_SOURCE_DIR=/path/to/GP40
```

## Development Workflow

1. Always verify database connection first with `npm run dev test`
2. Use `npm run explore` to understand data structure before generating
3. Test single operations before running batch processes
4. Check `merge-reports/` for conflict analysis results
5. Generated docs go to `docs/operation_code/` directories

## Key Implementation Details

- No formal test framework - rely on CLI testing
- All data fetched real-time from database (no hardcoded values)
- Batch scripts in `scripts/` handle parallel processing
- Excel merge uses intelligent conflict resolution with risk scoring
- TypeScript strict mode enabled - handle all nullable fields properly