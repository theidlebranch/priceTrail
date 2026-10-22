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
7. **Parsers and witness adapters.** One letter per branch. Open questions in `docs/source-spike.md` section 7 (OpenAI `cache_write`, Google price schedules, SQL `NULL` uniqueness) stay open until the step that needs them.
   - **7a.** Anthropic parser: header-based, fixture tests, fail-closed cases (missing column, bad unit, empty table, 0 or 2 matching tables, unparseable tier parenthetical).
     _Done:_ `parseAnthropicPricing()` in `src/core/pricing/anthropic.ts`. Tests in `src/core/pricing/anthropic.test.ts` pass against `tests/fixtures/anthropic-pricing.md`.
   - **7b.** models.dev witness adapter, compared against Anthropic only. Decide here whether a later "verify mode" fallback is worth it.
   - **7c.** OpenAI parser, Standard section only. Assert `Prices per 1M tokens.` Skip `-` cells. Do not guess a 272K long-context threshold.
   - **7d.** Google parser (largest job): four cell formats, English-only, Paid column, unmapped labels as warnings.
   - **7e.** LiteLLM witness adapter. Filter `litellm_provider` + `mode == "chat"`. Convert per-token costs with `decimal.js`, never float math.
   _Done:_ parser tests pass against the fixture for that letter.

### Phase 3: Data foundation

8. **Database setup.** Local Postgres (Docker) or a hosted free tier, plus Drizzle config and an env file validated with Zod.  
   _Done:_ a script connects and runs `select 1`.
9. **First tables.** `providers`, `models`, `model_aliases`. Generate and run the first migration.  
   _Done:_ tables exist and Drizzle Studio shows them.
10. **Price tables.** `price_components` (dimension, unit, amount, condition) and `price_versions` (the bracket fields, `supersedes_id`).  
    _Done:_ migration runs. Write a short note on why you chose components over fixed price columns. The `NULL` uniqueness question from the spike belongs in that note.
11. **Evidence tables.** `observations`, `observation_items`, `fetch_log`.  
    _Done:_ migration runs.
12. **Repository layer.** Define repository interfaces in `src/server/db/repositories`, with a Drizzle implementation.  
    _Done:_ a test reads and writes through a repository.
13. **`publishPriceVersion()`.** The only function allowed to write prices, with tests for the happy path, corrections via `supersedes_id`, and precision labeling.  
    _Done:_ tests pass.
14. **Architecture test.** Write a test that fails if any file other than the publish module writes to the price tables.  
    _Done:_ the test passes, and fails when you deliberately break the rule.
15. **Seed.** Write a seed script with a few real models and hand-verified prices, published through `publishPriceVersion()`.  
    _Done:_ `npm run seed` fills the database.

### Phase 4: Public pages with seeded data

16. **Install shadcn/ui and build the layout.** Header, footer, and page shell.
17. **Model list page.** Server component reading from the repository.
18. **Model detail page.** Current price, components table, evidence links.
19. **Price history chart.** Recharts, with "changed on or before" wording where the date is not announced.
20. **Pending-change banner.** Show the last confirmed price plus a "change under review" banner (fake the pending state with a seed row for now).

### Phase 5: Tier 2 + 3 pipeline

21. **Provider source interface.** `ProviderSource` (fetch + parse), wired around the Anthropic parser from 7a. Do not write a new parser here.
22. **Sanity checks.** Pure functions in `core/verification` for "did the parse break?", with tests built from broken fixtures.
23. **Hash and store.** Hash `parsed_data`; on a changed hash store an observation and items, otherwise only update `fetch_log` and `last_confirmed_at`.
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

Three tips:

- Phases 1 to 4 give you a **live, real-looking site** early, which keeps motivation up. The hard pipeline work comes after you already have something to show.
- The source spike changed parser order (Anthropic first, then OpenAI, then Google) and confirmed no Playwright and no LLM extraction for the MVP. The rest of Phases 5 to 8 stays as written.
- Treat each step as one small branch and PR, even if you're alone. That's a habit worth building.
