# Session handoff

Read this at the start of a session. Update it before the session ends.

The ordered checklist is [docs/build-plan.md](docs/build-plan.md). Do not copy that list here. A `_Done:_` line in the build plan is the acceptance check for that step. Trust the latest merged pull request, not that line alone, when you decide what is finished.

## Done

- Phases 1 and 2 (through step 7e).
- Phase 3 step 8: Neon, env check in `src/server/env.ts`, and `pnpm db:ping`. Merged as pull request #10.
- Phase 3 step 9: `providers`, `models`, and `model_aliases`. Merged as pull request #11. This branch renames `providers` to `labs` in `drizzle/0002_simpler_labs_and_price_versions.sql`. `pnpm db:migrate` applied it.
- Phase 3 step 10, on this branch and not merged yet: `offerings`, `price_versions`, and `price_components` in `src/server/db/schema.ts`. Migrations `drizzle/0001_price_tables.sql` and `drizzle/0002_simpler_labs_and_price_versions.sql` are applied. `price_versions` is one period per row: `first_seen_at`, `announced_on`, `last_seen_at`, `retracted_at`, and `replaces_version_id`. The tables are empty. The reading picture is [docs/price-tables.md](docs/price-tables.md).
- Small dependency updates on `master` (`9ffbc5b`): React and React DOM 19.3.1, lucide-react 1.60.0, shadcn 4.22.1. TypeScript stays at 5.9.3. The Dependabot major update (TypeScript 7, ESLint 10, `@types/node` 26) was left unmerged. Revisit TypeScript after 7.1 is stable (target 24 Nov 2026) and typescript-eslint publishes support.

## In progress

- None. After this branch merges, the next checklist item is step 11 (`observations`, `observation_items`, and `fetch_log`).

## Blocked

- None.
