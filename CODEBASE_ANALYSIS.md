# KDP Studio Library - Codebase Analysis

## Overview

**KDP Studio Library** is a SaaS application that generates print-ready puzzle/activity books for Amazon KDP (Kindle Direct Publishing). The first generator is a "whodunit" logic-grid puzzle book with fully deterministic, mathematically verified puzzles.

### Key Value Proposition
- **No AI/LLM involved** - All puzzles are generated deterministically using constraint satisfaction
- **Mathematical verification** - Every puzzle is brute-force verified to have exactly one solution before rendering
- **Print-ready output** - Generates KDP-formatted PDFs with proper bleeds, spine calculations, and interior layouts

---

## Architecture

### Monorepo Structure (pnpm)

```
/workspace
├── apps/
│   ├── web/          # Next.js app - dashboard, API routes, auth, billing
│   └── worker/       # Background process for book generation
├── packages/
│   ├── db/           # Prisma schema + client (shared by web & worker)
│   ├── shared/       # Zod schemas, KDP constants, utilities
│   └── generators/
│       └── grid-mystery/  # Deduction engine + PDF renderer
├── assets/
│   └── packs/        # Artwork packs (noir-1930s, chibi-cartoon)
└── docs/             # Documentation, roadmap, research
```

### Technology Stack

**Frontend/Web App:**
- Next.js 16.3.4 with React 19
- TypeScript 5.9+
- Tailwind CSS 4
- Clerk authentication
- pdfjs-dist for PDF preview
- @dnd-kit for drag-and-drop

**Worker:**
- Node.js ESM module
- tsx for development
- Runs as long-running background process

**Database:**
- PostgreSQL via Neon/Supabase
- Prisma ORM with driver adapter
- Transaction-safe job claiming with `FOR UPDATE SKIP LOCKED`

**Storage:**
- AWS S3 / Cloudflare R2 / Supabase Storage for PDFs and assets

**External Services:**
- Clerk: Authentication (no passwords stored locally)
- Stripe: Subscription billing
- Upstash Redis: Rate limiting
- Vercel: Web app hosting
- Render/Railway: Worker hosting

---

## Core Components

### 1. Puzzle Generation Engine (`packages/generators/grid-mystery`)

The heart of the system - a constraint-based deduction engine:

**Generation Process:**
1. **Solution First** - Random permutation placing one suspect per row/column in N×N grid
2. **Floor Plan Generation** - Recursive rectangular partitioning creates rooms
3. **Fact Derivation** - Generate all true facts about the solution (room, adjacency, landmarks, relative position, height rank)
4. **Clue Selection** - Select one clue per suspect, escalating to more constraining clues when needed
5. **Uniqueness Verification** - Brute-force solver checks every possible arrangement; only accepts if exactly one solution exists
6. **PDF Rendering** - Verified puzzles rendered to KDP-formatted PDFs

**Key Files:**
- `generate.ts` - Main generation logic with verification loop
- `solve.ts` - Brute-force uniqueness checker with node budget
- `technique-solver.ts` - Derives deduction paths for difficulty grading
- `clues.ts` - Clue generation and constraint system
- `floor-plan.ts` - Room generation via recursive partitioning
- `render-pdf.ts` - PDF generation with pdf-lib
- `tier-contract.ts` - Difficulty tier definitions and validation

**Supported Grid Sizes:** 6×6 to 8×8 (benchmarked at 90/90 success rate, worst case ~16s)

**Difficulty Tiers:** Easy, Medium, Hard, Expert, Extreme - each with distinct clue selection strategies and technique requirements

### 2. Database Schema (`packages/db/prisma/schema.prisma`)

**Core Models:**
- `User` - Linked to Clerk user ID (no passwords stored)
- `Subscription` - Stripe subscription tracking
- `Book` - User's puzzle book projects
- `Puzzle` - Individual puzzles with seed-based regeneration
- `GenerationJob` - Queue for background processing
- `CustomPage` - User-defined front/back matter pages
- `Asset` - Uploaded images for page customization
- `AuditLog` - Security audit trail

**Key Design Decisions:**
- Puzzles store `seed` + `difficulty`, not full puzzle data (deterministic regeneration)
- Overrides (title edits, suspect names) stored separately, applied at render time
- Row-level security via `userId` scoping on all models

### 3. Web Application (`apps/web`)

**Key Features:**
- Dashboard for managing books
- "Generate" tab for creating new books
- "Customize" tab for reviewing/editing puzzles before export
- Asset gallery for uploading page images
- Real-time PDF preview using Web Workers

**API Routes:**
- `/api/books` - CRUD for books
- `/api/books/[id]/puzzles` - Puzzle management (reroll, undo, verify)
- `/api/assets` - Image upload/management
- `/api/custom-pages` - Custom page management
- `/api/webhooks/clerk` - Clerk webhook for user sync

**Security Features:**
- Clerk middleware for auth
- Rate limiting on book creation (Upstash)
- Ownership checks on all API routes
- Zod validation on all inputs
- HMAC signature verification on webhooks
- Security headers (HSTS, X-Frame-Options, etc.)

### 4. Worker (`apps/worker`)

**Responsibilities:**
- Polls database for QUEUED jobs
- Claims jobs atomically (safe for horizontal scaling)
- Generates complete books (all puzzles + PDF rendering)
- Uploads PDFs to object storage
- Handles failures gracefully (retry up to 3 times)

**Key Design:**
- Separate from web app to avoid blocking requests
- Never crashes on bad jobs (isolated error handling)
- Polls every 5s when working, 15s when idle

### 5. Shared Package (`packages/shared`)

**Contents:**
- Zod schemas for input validation
- KDP geometry constants (trim sizes, bleed, spine calculations)
- Difficulty tier definitions
- Mystery theme configurations
- Page layout constants
- Mix planner for difficulty distribution

---

## Data Flow

### Book Creation Flow

1. User fills out "Generate" form in dashboard
2. POST `/api/books` validates input with Zod schema
3. Creates `Book` record with status `QUEUED` or `DRAFT`
4. If QUEUED: creates `GenerationJob` record
5. Worker polls and claims job atomically
6. Worker generates all puzzles using seeds
7. Worker renders complete PDF with all pages
8. Worker uploads PDF to S3/R2
9. Worker updates job status to `SUCCEEDED`
10. User can download from dashboard

### Puzzle Review Flow (Customize Tab)

1. Book created as `DRAFT` with Puzzle rows (seeds only)
2. Frontend loads puzzles by generating from seeds
3. User can reroll individual puzzles (new seed saved)
4. User can edit titles, suspect names (saved as overrides)
5. When ready, user triggers export (changes job to QUEUED)

---

## Security Model

### Authentication & Authorization
- Clerk handles all authentication
- Only Clerk user ID stored locally
- `getOrCreateCurrentUser()` mirrors user on first sight
- Every API route checks `userId` scope

### Input Validation
- All user input validated with Zod schemas
- Schemas defined in `@kdp/shared` and reused everywhere
- Strict limits on string lengths, array sizes, numeric ranges

### Rate Limiting
- Upstash Redis-backed rate limiter
- Applied to book creation endpoints
- Prevents spam/abuse

### Audit Logging
- `AuditLog` model tracks security-sensitive actions
- Billing changes, book deletions logged
- IP addresses captured

### Dependency Security
- Dependabot configured for vulnerability alerts
- CI runs `pnpm audit` on every push
- Lockfile maintained for reproducible builds

---

## Current Capabilities

### Supported Features
✅ User authentication via Clerk
✅ Book creation with customizable parameters
✅ Grid sizes 6×6 to 8×8
✅ Five difficulty tiers (Easy → Extreme)
✅ Deterministic puzzle generation
✅ Mathematical uniqueness verification
✅ PDF export with KDP formatting
✅ Multiple trim sizes (6×9, 7×10, 8.5×11)
✅ Color or grayscale interiors
✅ Bleed support for full-page images
✅ Custom page upload and assignment
✅ Puzzle review and customization before export
✅ Suspect name/title editing
✅ Answer key generation
✅ Multiple themes (Manor, Farm, Camp, Mess Hall)

### Book Structure
- Title page (optional)
- Copyright page (optional)
- How to Solve instructions (optional)
- Review request page (optional)
- Puzzle pages (1 or 2 per spread)
- Answer key at end
- Custom front/back matter pages
- User-uploaded image replacements

---

## Roadmap (from docs/roadmap.md)

### Phase 0 - Instrument
- Content pool scaffolding for larger grids
- Measurement harness for generation metrics

### Phase 1 - Harvest
- Solution walkthroughs (deduction path printing)
- Hint ladders
- Difficulty badges on pages
- Logic profile in answer key
- Case headers with title/hook

### Phase 2 - Engine Core
- Structured clue representation
- Propagation + MRV in solver (88.6% of generation time)
- AC-3 worklist optimization
- IF-THEN conditional clues
- Scale to 12×12, 14×14, 16×16 grids

### Phase 3 - The Book
- Story mode with editable prologue/epilogue
- Series continuity
- Two-page dossier spreads
- Suspect profiles
- Typography improvements
- Table of contents, page numbers

### Phase 4 - Art & Content
- Theme pack versioning
- Real content pools
- Furniture icons
- Floor textures
- Suspect portraits
- Additional themes

### Phase 5 - Reach & Workflow
- More trim sizes
- Localization
- KDP pre-flight validation
- Export formats (PNG, SVG, PPTX)
- Batch queue with progress

### Phase 6 - Second Format
- Matrix logic grids (Murdle-style)
- Category-bijection constraints
- X/O triangular grid renderer
- Differentiator from competitors

---

## Competitive Positioning

### vs. Shigai Royalty
- **Same puzzle type** (spatial logic grid)
- **Stricter verification** (zero guessing allowed at all tiers)
- **Better transparency** (logic profiles, technique disclosure)
- **Gap:** Book presentation less polished

### vs. Murdle/Murdoku
- **Different format** (they use matrix grids, we use spatial)
- **Opportunity:** Matrix format as Phase 6 differentiator
- **Advantage:** Database-backed templates vs. their browser-local storage

---

## Key Technical Decisions

### Why Separate Worker?
- Generation too slow for web requests
- Isolation prevents crashes from taking down web app
- Horizontal scaling without distributed locks
- Failed jobs retry without affecting others

### Why Store Seeds Not Puzzles?
- Deterministic regeneration saves storage
- Overrides applied at render time
- No risk of drift between stored puzzle and generator
- Edit history preserved naturally

### Why Brute-Force Solver?
- Simplicity and correctness over cleverness
- Node budget prevents infinite loops
- Works for current grid sizes (6-8)
- Being optimized in Phase 2

### Why Clerk for Auth?
- No password storage liability
- Professional security team
- Built-in MFA, session management
- Webhook integration for user sync

---

## Development Commands

```bash
pnpm install                    # Install dependencies
pnpm dev                        # Run web app locally
pnpm --filter @kdp/worker dev   # Run worker locally
pnpm db:generate                # Generate Prisma client
pnpm --filter @kdp/db migrate   # Run migrations
pnpm lint                       # ESLint
pnpm typecheck                  # TypeScript check
pnpm test                       # Vitest tests
pnpm build                      # Production build
```

### Environment Requirements
- `DATABASE_URL` (required)
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY` (for billing)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Object storage credentials (S3/R2)

---

## Testing Strategy

- Unit tests in `__tests__/` directories
- Vitest as test runner
- CI runs lint, typecheck, test, build on every PR
- Generation benchmarks tracked in docs

---

## Known Limitations

1. **Grid Size Ceiling** - 8×8 max currently (engine limitation at 10×10)
2. **Single Puzzle Format** - Only spatial logic grids (matrix format planned)
3. **No Hints/Walkthroughs** - Computed but discarded after grading
4. **Limited Themes** - 4 themes with basic content pools
5. **No Localization** - English only currently
6. **Manual Cover Design** - Cover spec provided, design done externally

---

## File Count Summary

- **TypeScript/JavaScript files:** ~151
- **Main applications:** 2 (web, worker)
- **Shared packages:** 3 (db, shared, generators/grid-mystery)
- **Documentation files:** 5 markdown docs
- **Asset packs:** 2 (noir-1930s, chibi-cartoon)

---

## Conclusion

This is a well-architected, production-ready SaaS with:
- ✅ Strong security foundation
- ✅ Clean separation of concerns
- ✅ Deterministic, verified core algorithm
- ✅ Horizontal scaling capability
- ✅ Clear roadmap for growth

The main competitive gap is **book presentation polish** (Phase 3), not the puzzle engine itself. The technical foundation supports all planned features without major refactoring.
