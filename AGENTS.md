# Project Instructions

PriceTrail is an open, source-backed history of AI model API prices. Every published number must trace back to evidence. The design lives in [docs/architecture.md](docs/architecture.md). The order of work lives in [docs/build-plan.md](docs/build-plan.md). Source findings live in [docs/source-spike.md](docs/source-spike.md). If the sequence and the design disagree, the build plan wins. When a step adds a database table, update [docs/price-tables.md](docs/price-tables.md) in that same branch with the new table on the diagram and a filled example of every column, and keep the earlier tables.

## Stack

- Next.js 16.4.2, React 19.3, TypeScript 5, Tailwind 4
- Node 24 (see `.nvmrc`). Package manager: pnpm 10.32.1
- Postgres on Neon, Drizzle, Zod
- Vitest for tests

Do not add Docker. The database is a Neon URL in `.env`.

## First run

```bash
pnpm install
cp .env.schema .env
# Fill in DATABASE_URL, then:
pnpm dev
pnpm db:ping
```

`pnpm dev` serves the app at http://localhost:3000. The landing page is `src/app/page.tsx`.

## Hard constraints

- Dependency direction: `src/core` (pure logic, no I/O) <- `src/server` (DB, fetch, pipeline) <- `src/app` (thin routes, UI).
- Exactly one function, `publishPriceVersion()`, may write price rows. If a change would write a price any other way, stop and flag it. See [docs/architecture.md](docs/architecture.md).
- Use pnpm, not npm, yarn, or bun.
- Use git for branches, commits, and push. Do not use the `gh` CLI. Open pull requests in the GitHub website.
- Do not claim a test, build, or check passed unless it was actually run and passed.
- Never print or commit a database URL. It contains the password.

## Verification commands

These are the same checks CI runs:

- Lint: `pnpm lint`
- Type check: `pnpm typecheck`
- Tests: `pnpm test`
- Full verification: `pnpm check` (lint, type check, and tests)

## Session handoff

Read [PROGRESS.md](PROGRESS.md) at the start of a session. Update it before the session ends. Record what is done, what is in progress, and what is blocked. Do not copy the build plan into that file.

Cursor rules in `.cursor/rules/` also apply: explain decisions in plain language, run `npx fallow dead-code --format json` after code changes, and do not use `gh`.

## My experience level

I am a junior developer. Help me build good engineering habits while working on this project.

- Explain important technical decisions in plain language. Focus on why a solution is appropriate and what trade-offs it introduces.
- Don't explain every line of code. Help me understand the underlying concepts and the parts that are not obvious.
- Prefer teaching through small, working examples over generating large amounts of code at once.
- When introducing a new library, architectural pattern, or abstraction, explain why it is needed and whether a simpler option would work.
- Don't silently make significant product or architectural decisions on my behalf. Explain the options and ask when my decision matters.

## Engineering principles

- Prefer the simplest solution that meets the current requirements.
- Read the relevant existing code before changing it. Follow established patterns when they are sensible.
- Avoid unnecessary dependencies, abstractions, generic frameworks, premature optimization, and unrelated refactoring.
- Keep changes small enough that I can understand and review them.
- Use TypeScript types and runtime validation at appropriate boundaries. Do not rely on TypeScript alone to validate external data.
- Handle expected failures explicitly. Never silently discard errors or invent successful results.
- Write tests for important logic and edge cases. For bug fixes, add a regression test when practical.
- Follow a test-first workflow for non-trivial logic when it is practical.
- Never claim a test, build, or check passed unless it was actually run and passed.

## Working with me

For a non-trivial task:

1. Inspect the relevant code and understand the existing behavior.
2. Explain the problem, the proposed approach, and the smallest reasonable implementation plan.
3. Identify any important assumptions or decisions that need my input.
4. Implement in small, coherent steps. Avoid unrelated changes.
5. Run the relevant tests, type checks, and other available verification commands.
6. Summarize what changed, why, what was verified, and any remaining risks.

When wrapping up, check-your-understanding questions must be labeled as such. They are not product or direction questions. Direction questions are separate: those are when my answer would change the work.

Wait for my approval before implementing a substantial design or multi-step feature. For small, well-defined changes, use judgment and avoid unnecessary planning overhead.

Prefer completing work in the current agent session rather than spawning subagents or creating worktrees unless I request them or parallelization has a clear benefit.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
