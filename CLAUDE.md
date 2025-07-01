# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Visual Migrator is a Next.js 15 application that provides a visual interface for migrating content from WordPress to Sanity CMS. The migration process includes database extraction, media processing, content transformation, and visual verification.

## Development Commands

```bash
# Install dependencies (use Yarn - NOT npm)
yarn install

# Run development server (with Turbopack)
yarn dev

# Build for production
yarn build

# Run production server
yarn start

# Linting (must pass before commits)
yarn lint

# Testing
yarn test          # Run tests once
yarn test:watch    # Run tests in watch mode
yarn test:ui       # Run tests with UI
yarn test:coverage # Run tests with coverage
```

## Architecture Overview

### Domain-Driven Architecture

The project follows Domain-Driven Design with clear separation:
- **Frontend**: UI Components and Pages (`/src/components/`, `/src/app/`)
- **API Routes**: Server-side endpoints (`/src/app/api/`)
- **Domain Logic**: Business logic organized by domain concepts (`/src/domain/`)

### Migration Workflow

1. **Docker Management** (`/api/docker/*`, `DockerManagerUI.tsx`)
   - Start/stop Docker containers hosting WordPress database
   - Container must be running on localhost:3306 for migration

2. **Prepare Migration** (`/api/prepare-migration/*`, `PrepareMigrationUI.tsx`)
   - Connects to WordPress MySQL database
   - Extracts posts, pages, and media references
   - Transforms content to Sanity format
   - Saves to `input/sanity-migration.json`

3. **Verify Migration** (`/api/get-migration-data/*`, `VerifyMigrationUI.tsx`)
   - Visual inspection of migrated content
   - Search, filter, and export capabilities
   - Media reference validation

### Key Directories

- `/src/app/api/` - Server-side API routes for migration operations
- `/src/components/` - React components for each migration step
- `/src/types/` - TypeScript interfaces (WordPressPost, SanityContent, MigrationRecord)
- `/src/utils/` - Media processing and tag analysis utilities
- `/src/domain/` - Domain logic organized by concepts (when refactoring, move logic here)
- `/input/` - Migration input data (database backup, uploads, migration output)

### Important Files

- `src/types/migration.ts` - Core type definitions for migration data
- `src/app/api/prepare-migration/prepare-migration.ts` - Main migration logic
- `src/utils/media-processor.ts` - Media extraction and path mapping
- `src/utils/tag-analyzer.ts` - HTML tag analysis for uncovered media

## Development Guidelines

### Package Management
- **Always use Yarn** - Never use npm for package management
- Lock file (`yarn.lock`) must be committed
- Exact versions only in package.json

### Code Organization
- Follow Domain-Driven Design principles
- Organize code around domain concepts (WordPress migration)
- Use functional programming patterns:
  - Pure functions
  - Immutable data structures
  - No side effects in business logic
  - Composition over inheritance

### Naming Conventions
- Use domain-specific names (e.g., `validate-wordpress-posts.ts` not `validate-data.ts`)
- File names should describe what they do in domain terms
- Components: PascalCase
- Functions/utilities: camelCase
- Types/Interfaces: PascalCase with descriptive names

### Type Safety
- Make invalid states unrepresentable through types
- Use branded types for domain concepts
- Avoid `any` - use `unknown` and narrow types
- Create specific types for each domain concept

### Error Handling
- Use Result/Either types for expected errors
- Never throw in pure functions
- Handle errors at system boundaries
- Provide meaningful error messages with context

### Testing
- Use Vitest with Arrange-Act-Assert pattern
- Test behavior, not implementation
- Focus on domain logic testing
- Mock at architectural boundaries only

### Git Workflow
- Use conventional commits
- Feature branches from main
- All code must pass linting before commit
- Meaningful commit messages describing the change

### Database Connection

The application expects a WordPress MySQL database running on:
- Host: `localhost`
- Port: `3306`
- Database: `mydatabase`
- User: `root`
- Password: `rootpassword`

### Media Handling

- WordPress uploads should be placed in `/input/uploads/` (organized by year/month)
- Media processor maps WordPress URLs to local file paths
- Supports images, audio, and video files
- Tracks found vs missing media references

## Key Type Definitions

```typescript
// Core domain types from migration.ts
interface WordPressPost {
  // WordPress content structure
}

interface SanityContent {
  // Transformed content for Sanity
}

interface MigrationRecord {
  // Links original and transformed content
}

interface MediaReference {
  // Media file tracking
}
```

## State Management

- Keep state local where possible
- Use React's built-in state management
- No global state managers unless absolutely necessary
- Lift state only when needed for sharing

## Performance Considerations

- Use React.memo only when proven necessary
- Implement proper loading states
- Handle large datasets with pagination/virtualization
- Monitor bundle size and code splitting