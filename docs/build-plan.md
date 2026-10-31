This file is the order of work. `docs/architecture.md` is the design (the principles there do not change). `docs/source-spike.md` is the findings. If the sequence disagrees, this file wins.

### Phase 1: Project setup (DONE)

1. **Create the app.** `create-next-app` with TypeScript, Tailwind, ESLint, App Router, `src/` directory. Turn on `strict`. Add your AGENTS.md and PRICETRAIL.md.  
   _Done:_ `npm run dev` shows the default page.
2. **Test tooling.** Add Vitest, write one trivial test, add `typecheck` and `test` scripts.  
   _Done:_ `npm test` and `npm run typecheck` pass.
3. **CI and deploy.** Add `.github/workflows/ci.yml` (lint, typecheck, test), push to GitHub, connect the repo to Vercel.  
   _Done:_ green check on GitHub and a live URL.
4. **Port the landing page.** Move `pricetrail-landing.html` into a Next route and split it into a few components. Keep the example data labeled.  
   _Done:_ the landing page is live on your Vercel URL. This is a quick win for motivation.

### Phase 2: Source spike

5. **Fetch the 3 pricing pages.** Write `scripts/spike-sources.ts` that fetches each page and logs status, size, and whether the prices are in the raw HTML. Note which are static, JS-rendered, or blocked in `docs/source-spike.md`. Save the HTML to `tests/fixtures/`.  
   _Done:_ you know which providers are easy and which are hard. Anthropic and OpenAI are markdown tables. Google is static HTML (always fetch with `?hl=en`). No Playwright. Witnesses (models.dev, LiteLLM) never publish a price. Merged as PR #3.
6. **Wayback live check.** Write `scripts/spike-wayback.ts`: try Save Page Now on one pricing URL by hand, and note the request flow, timing, and whether the archived copy is readable.  
   _Done:_ a written answer to "does Wayback work well enough as Tier 3?"
7. **Parsers and witness adapters.** One letter per branch. Open questions in `docs/source-spike.md` section 7 (Google price schedules, SQL `NULL` uniqueness) stay open until the step that needs them.
   - **7a.** Anthropic parser: header-based, fixture tests, fail-closed cases (missing column, bad unit, empty table, 0 or 2 matching tables, unparseable tier parenthetical).
     _Done:_ `parseAnthropicPricing()` in `src/core/pricing/anthropic.ts`. Tests in `src/core/pricing/anthropic.test.ts` pass against `tests/fixtures/anthropic-pricing.md`.
   - **7b.** models.dev witness adapter, compared against Anthropic only. Decide here whether a later "verify mode" fallback is worth it.
     _Done:_ `parseModelsDevAnthropic()` in `src/core/pricing/models-dev.ts`. Comparison in `src/core/pricing/compare-anthropic-witness.ts`. Verify-mode fallback deferred until Phase 5 has a measured `parser_suspect` rate.
   - **7c.** OpenAI parser, Standard section only. Assert `Prices per 1M tokens.` Skip `-` cells. Do not guess a 272K long-context threshold.
     _Done:_ `parseOpenAiPricing()` in `src/core/pricing/openai.ts`. Tests in `src/core/pricing/openai.test.ts` pass against `tests/fixtures/openai-pricing.md`. OpenAI's single cache-write column maps to `cache_write`.
   - **7d.** Google parser (largest job): four cell formats, English-only, Paid column, unmapped labels as warnings.
     _Done:_ `parseGooglePricing()` in `src/core/pricing/google.ts`. Tests in `src/core/pricing/google.test.ts` pass against `tests/fixtures/google-pricing.2026-10-18.html`. Standard text prices only. A schedule stays as separate `validFrom` / `validUntil` rows. Storage and modality prices are warnings, not rows. A heading with two model codes emits no rows.
   - **7e.** LiteLLM witness adapter. Filter `litellm_provider` + `mode == "chat"`. Convert per-token costs with `decimal.js`, never float math.
     _Done:_ `parseLiteLLM()` in `src/core/pricing/litellm.ts`. Tests in `src/core/pricing/litellm.test.ts` pass against `tests/fixtures/litellm-sample.json`. Chat rows for Anthropic, OpenAI, and Gemini only. Per-token costs convert with `decimal.js`. Context-tier and other cost fields are warnings, not rows. A dated snapshot that disagrees omits that dimension. No comparison script: API ids do not join official page-label slugs until the alias table exists.

### Phase 3: Data foundation

8. **Database setup.** Local Postgres (Docker) or a hosted free tier, plus Drizzle config and an env file validated with Zod.  
   _Done:_ Neon, via a normal Postgres URL. `parseDatabaseEnv()` in `src/server/env.ts` rejects a missing or non-postgres URL. `pnpm db:ping` runs `select 1` and prints `1`. No tables yet.
9. **First tables.** `providers`, `models`, `model_aliases`. Generate and run the first migration.  
   _Done:_ `providers`, `models`, and `model_aliases` in `src/server/db/schema.ts`. Migration `drizzle/0000_identity_tables.sql`. `pnpm db:migrate` applied it, and those three tables are in the public schema. Ids are bigint identity columns. `model_alias_kind` is a Postgres enum. No rows yet. A later pass on this branch renamed `providers` to `labs` and `provider_id` to `lab_id` in `drizzle/0002_simpler_labs_and_price_versions.sql`. `pnpm db:migrate` applied that file. A lab is the company that released the model. A host stays on `offerings.platform`.
10. **Price tables.** `price_components` (dimension, unit, amount, condition) and `price_versions` (the bracket fields, `supersedes_id`).  
    _Done:_ `offerings`, `price_versions`, and `price_components` in `src/server/db/schema.ts`. Migration `drizzle/0001_price_tables.sql`. `pnpm db:migrate` applied it. Those three tables are in the public schema and have no rows. `offerings` is included because a price version must point at one. A price is a set of component rows, not fixed columns such as `input_price`: a new kind of price is a new row, plus a new enum value, not a new column. `condition` is `jsonb NOT NULL DEFAULT '{}'`, and `region` is `text NOT NULL DEFAULT 'global'`. Postgres treats two NULLs as different, so a nullable unique key would allow two "no tier" input prices, or two global offerings, for the same parent. `{}` means no tier. The same later pass cut `price_versions` down to `first_seen_at`, `announced_on`, `last_seen_at`, `retracted_at`, and `replaces_version_id`. Public history filters `retracted_at IS NULL` and does not follow `replaces_version_id`. The filled picture is [docs/price-tables.md](price-tables.md).
11. **Evidence tables.** `observations`, `observation_items`, `fetch_log`.  
    _Done:_ `sources`, `observations`, `observation_items`, and `fetch_log` in `src/server/db/schema.ts`. Migrations `drizzle/0003_evidence_tables.sql`, `drizzle/0004_slimmer_sources.sql`, and `drizzle/0005_slimmer_observation_items.sql`. `pnpm db:migrate` applied them. Those four tables are in the public schema and have no rows. `sources` is included because an observation and a fetch log must point at the page that was fetched. A source is the page, not the lab. `fetch_log.observation_id` is required when `outcome` is `changed`, and empty for `unchanged`, `parser_suspect`, and `fetch_error`. It is unique, so one snapshot belongs to one changed row. The price JSON lives on `observations.parsed_data`. `review_status` defaults to `flagged`. The filled picture is [docs/price-tables.md](price-tables.md). `price_version_evidence` is not in this step.
12. **Repository layer.** Define repository interfaces in `src/server/db/repositories`, with a Drizzle implementation.  
    _Done:_ `createCatalogRepository()` in `src/server/db/repositories/catalog.ts`. It inserts and finds labs, models, aliases, and offerings. A missing row is null. A duplicate throws SQLSTATE 23505, and a broken foreign key throws 23503. The Neon test rolls back, and `pnpm test` skips it when `DATABASE_URL` is missing. Three doors: this file is the catalog. Evidence tables get their own file in step 23. Price writes stay in `publishPriceVersion()` (step 13), outside `repositories/`.
13. **`publishPriceVersion()`.** The only function allowed to write prices, with tests for the happy path, a retracted row plus `replaces_version_id`, and precision labeling.  
    _Done:_ `publishPriceVersion()` in `src/server/db/publish-price-version.ts`. It is the only writer of `price_versions` and `price_components`. The caller passes an observation item id plus the component rows and the dates. The item must be `ok` or `confirmed`. A normal change fills `last_seen_at` on the open row with the previous sighting, then opens a new row. A correction sets `retracted_at` on the open row and inserts a fix whose `replaces_version_id` points at it. The returned label is `announced` when `announced_on` is set, and `observed` ("changed on or before" the UTC day of `first_seen_at`) when it is blank. The function does not read `parsed_data` or `fetch_log`, and it does not write `price_version_evidence`. Input checks run without a database. The Neon tests roll back, and `pnpm test` skips them when `DATABASE_URL` is missing.
14. **Architecture test.** Write a test that fails if any file other than the publish module writes to the price tables.  
    _Done:_ `findForbiddenPriceWrites()` in `src/server/db/price-write-guard.ts`. It reads source text. It does not open a database. It scans `src/`, `scripts/`, and `drizzle/`, and it skips `*.test.ts`. A write is a Drizzle insert, update, or delete of `priceVersions` or `priceComponents`, or SQL `INSERT`, `UPDATE`, or `DELETE` of `price_versions`, `price_components`, or `price_version_evidence`. The only allowed production file is `src/server/db/publish-price-version.ts`. A test file may plant a row. A select, a `pgTable` definition, and a migration that only creates or alters columns are not writes. The fail-on-purpose cases pass a fake file string, so the repo does not keep a broken insert. A renamed import is not seen.
15. **Seed.** Write a seed script with a few real models and hand-verified prices, published through `publishPriceVersion()`.  
   _Done:_ `pnpm seed` runs `scripts/seed.ts`. The hand-checked list is Claude Fable 5.1, Claude Mythos 5.1, and the four gpt-6 Standard rows (`gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`, `gpt-6-sol`). Amounts must match the saved Anthropic and OpenAI fixtures. A mismatch, a retired model, or a second run throws before another price is opened. Long-context OpenAI cells with no token cutoff are not published. Google is not in this seed. Each item is `confirmed`. There is no `fetch_log` row, because the script does not download a page. The Neon tests roll back, and `pnpm test` skips them when `DATABASE_URL` is missing.

### Phase 4: Public pages with seeded data

16. **Install shadcn/ui and build the layout.** Header, footer, and page shell.
17. **Model list page.** Server component reading from the repository.
18. **Model detail page.** Current price, components table, evidence links.
19. **Price history chart.** Recharts, with "changed on or before" wording where the date is not announced.
20. **Pending-change banner.** Show the last confirmed price plus a "change under review" banner (fake the pending state with a seed row for now).

### Phase 5: Tier 2 + 3 pipeline

21. **Provider source interface.** `ProviderSource` (fetch + parse), wired around the Anthropic parser from 7a. Do not write a new parser here.
22. **Sanity checks.** Pure functions in `core/verification` for "did the parse break?", with tests built from broken fixtures.
23. **Hash and store.** Hash `parsed_data`; on a changed hash store an observation and items, otherwise only update `fetch_log` and `sources.last_checked_at`. The open price version stays open.
24. **Archive step.** Turn the Wayback spike into `wayback-client.ts` with a fake-fetch test suite, and fall back to stored `raw_content` on failure.
25. **Run script.** Chain these into `scripts/run-verify.ts` for one provider.
26. **Wire OpenAI, then Google.** One step each, using the parsers from 7c and 7d. This proves the plugin shape works.
27. **Schedule it.** `verify.yml` cron (~6h), then watch a few real runs.

### Phase 6: Review queue

28. **Decide auth** (GitHub OAuth allowlist vs. a single secret) and write an ADR. This is your decision, so ask your agent for the trade-offs.
29. **Protect the `/review` routes.**
30. **Candidate list and detail view.**
31. **Approve/reject actions.** They go through `publishPriceVersion()` and record `reviewed_by`, `reviewed_at`, and a note.
32. **Source health page.**

### Phase 7: Tier 1 signals

33. **LiteLLM feed signal.** It writes to `fetch_triggers` only, never prices. The LiteLLM commits feed was not checked in the source spike; confirm it here.
34. **OpenRouter and `/models` endpoints.** They feed `candidate_models` and `verification_flags`.
35. **Trigger-driven verification.** Triggers can prompt an early Tier 2 check. Provider changelog feeds were not checked in the source spike; confirm one here if this step uses them.

### Phase 8: Polish

36. **Replace landing page example data** with real data.
37. **README.** What it is, architecture diagram, how evidence works, how to run it.
38. **Docs and ADRs cleanup.**
39. **Post-MVP backlog:** RSS/JSON change feed, Wayback backfill, cloud platform APIs.

Tips:

- Phases 1 to 4 give you a **live, real-looking site** early, which keeps motivation up. The hard pipeline work comes after you already have something to show.
- The source spike changed parser order (Anthropic first, then OpenAI, then Google) and confirmed no Playwright and no LLM extraction for the MVP. The rest of Phases 5 to 8 stays as written.
- Treat each step as one small branch and PR, even if you're alone. That's a habit worth building.
- When a step adds a table, update [docs/price-tables.md](price-tables.md) in that same branch. Add the table to the diagram and add a filled example with every column. Keep the earlier tables and their rows. Do not start a second diagram.
