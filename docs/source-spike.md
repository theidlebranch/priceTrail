# Source spike: findings (2026-10-18)

Purpose: find out, before writing parsers, which assumptions in the v3 plan are false.
Status: probing finished. Step 5 is merged (PR #3). Step 6 (Wayback live check) is written up in section 10.

---

## 1. Decision

- **Official pages are the source of truth and the evidence.** Their snapshots are what we store and archive.
- **models.dev and LiteLLM are witnesses.** They can agree or disagree with the official page. They never publish a price on their own.
- Every source gets its own small adapter that outputs one shared shape (section 4).
- Every adapter **fails closed**: if it is not sure, it throws or warns. It never guesses.
- Skip LLM extraction for the MVP. Revisit it only when real parser breakage hurts (see section 6).

## 2. Summary

| Source     | Format                                       | Role             | Difficulty                     | Fixture                                                             |
| ---------- | -------------------------------------------- | ---------------- | ------------------------------ | ------------------------------------------------------------------- |
| Anthropic  | Markdown table (official)                    | claim + evidence | Easy                           | `tests/fixtures/anthropic-pricing.md`                               |
| OpenAI     | Markdown table (official)                    | claim + evidence | Easy to medium                 | `tests/fixtures/openai-pricing.md`                                  |
| Google     | Static HTML (official), English via `?hl=en` | claim + evidence | Hard (volume + 4 cell formats) | `tests/fixtures/google-pricing.2026-10-18.html`                     |
| models.dev | JSON                                         | witness          | Easy                           | full dump gitignored; `tests/fixtures/models-dev-sample.json`       |
| LiteLLM    | JSON                                         | witness          | Medium                         | `tests/fixtures/litellm-sample.json`                                |

No source needs Playwright or a JS-rendered fetch. Every official page is parseable with plain code.

---

## 3. Per source

### 3.1 Anthropic

- **URL/format:** the pricing docs page (the LiteLLM entry's `source` field points at `https://platform.claude.com/docs/en/about-claude/pricing`). Keep the real URL in config. Markdown.
- **Locate:** the table whose header cells include all of: `Base input tokens`, `5m cache writes`, `1h cache writes`, `Cache hits and refreshes`, `Output tokens`. Require **exactly one** matching table. 0 or 2 is an error.
- **Mapping:**

| Header                   | Dimension        |
| ------------------------ | ---------------- |
| Base input tokens        | `input`          |
| 5m cache writes          | `cache_write_5m` |
| 1h cache writes          | `cache_write_1h` |
| Cache hits and refreshes | `cache_read`     |
| Output tokens            | `output`         |

- **Unit:** `$X / MTok` (per million tokens). Cells must match that exact pattern.
- **Traps and rules:**
  - Footnote markers inside cells (`$0.25 / MTok<sup>1</sup>`): strip `<sup>...</sup>` before parsing.
  - Model cells contain links and parentheticals (`Claude Mythos 5.1 ([limited availability](...))`): strip the markup, keep the parenthetical as a note.
  - `retired` in a parenthetical is a deprecation hint, so keep it as a note. `limited availability` is also a note.
  - **Tier lives in the model name, not in a column**: `Claude Haiku 5.5 (for prompts up to 100,000 tokens)` and `(... over 100,000 tokens)` are two rows. Parse the condition with a regex (`for prompts (up to|over) ([\d,]+) tokens`). If a parenthetical looks like a tier but the regex fails, throw.
  - Footnote 3 says a scheduled Sonnet 5 price increase "will not occur". **Announced future prices can be cancelled.**
  - Unknown extra columns go into an `unmappedColumns` warning, not silently ignored.
- **Free sanity check (warning, not failure):** 5m write = 1.25x input, 1h write = 2x input, cache read = 0.1x input (0.05x for Opus 5.5 and Sonnet 5.5, 0.025x for Fable 5.1 and Mythos 5.1, per the footnotes). Checked by hand on several rows. A violation means `parser_suspect`, because a legitimate multiplier change is possible.

### 3.2 OpenAI

- **URL/format:** the pricing page as Markdown (the page says `.md` versions are available). Keep the URL in config.
- **Locate:** find the heading `### Standard pricing data` first, take the first table after it, then check its headers. Batch, Flex, Fast and Ultrafast are separate sections that reuse the same models, and are out of MVP.
- **Mapping:** 8 columns, two groups.

| Header                                                    | Dimension                         | Condition                     |
| --------------------------------------------------------- | --------------------------------- | ----------------------------- |
| Short context input                                       | `input`                           | none                          |
| Short context cached input                                | `cache_read`                      | none                          |
| Short context cache writes                                | `cache_write`                     | none                          |
| Short context output                                      | `output`                          | none                          |
| Long context input / cached input / cache writes / output | same dimensions                   | long-context tier (see traps) |

- **Unit:** bare `$10.00` cells. The unit is only stated in the sentence `Prices per 1M tokens.` near the top. The parser must **assert that sentence exists** and throw if it does not.
- **Traps and rules:**
  - `-` means "not offered", **not zero**. Skip the cell. Parsing it as 0 would publish a fake free price.
  - The long-context threshold is only written for some models (`gpt-5.5 (<272K context length)`). `gpt-6-*` and `gpt-5.6-*` have long-context prices and **no stated threshold**, and the top of the page has no general note (checked lines 1-29). Rule: publish their short-context prices, record the long-context ones as a `needs_threshold` warning. **Never guess 272K.**
  - `<272K` is ambiguous at exactly 272,000. Do not invent precision.
  - Model names already are API slugs, which makes aliasing easy.
  - Names may carry a parenthetical (`gpt-5.5 (<272K context length)`). Strip it for the slug and keep it as a condition source.

### 3.3 Google

- **URL/format:** `https://ai.google.dev/gemini-api/docs/pricing?hl=en`. Static HTML, so prices are in the raw HTML and no JS rendering is needed.
- **Language:** the first fetch returned the **Chinese** page. Always send `?hl=en` and `Accept-Language: en`, then **assert `<html lang>` starts with `en`** and throw otherwise. (`grep -c 'lang="en'` is not a valid check, because `hreflang="en"` also matches.)
- **Locate:**
  - Model section = `<h2 id="...">`. Mode = `<h3 id="...">` with the `_\d+` suffix removed (`standard`, `batch`, `flex`, `priority`, `contributor`). Never rely on the counter.
  - API model IDs are in `<code>` elements inside each section (`gemini-4-argon`, `gemini-3.1-pro-preview`, ...). In the sections printed, the `h2` id equalled the code, but treat the `<code>` as the real source and the `h2` id as the anchor.
  - Walk `h2, h3, table` in document order with cheerio so the logic does not depend on nesting.
- **Table layout:** one table per model x mode. Rows are dimensions. Columns are `Free Tier` and `Paid Tier, per 1M tokens in USD`. Use the **Paid** column only (find it by `startsWith("Paid Tier")`) and assert `per 1M tokens in USD` is in the header.
- **Row labels seen in standard tables (about 29 tables):**

| Label                                                                                                                        | Maps to                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Input price`                                                                                                                | `input`                                                 |
| `Output price (including thinking tokens)` / `Output price`                                                                  | `output`                                                |
| `Context caching price`                                                                                                      | `cache_read` (and sometimes a storage price, see below) |
| `Input price (text, image, video)`, `Text/Image/Audio/Video input price`                                                     | unmapped in MVP (modality-specific inputs)              |
| `Grounding with Google Search*` / `**` / `***`, `Grounding with Google Maps`, `Grounding with Google Web and Image Search**` | unmapped (per-request pricing)                          |
| `Used to improve our products`                                                                                               | ignore (not a price)                                    |

Strip trailing asterisks before matching labels. Any other label is reported as unmapped, never silently dropped.

- **Cell formats (four seen):**
  1. Plain: `$X`.
  2. **Context tiers:** `$2.00, prompts <= 200k tokens$4.00, prompts > 200k tokens` (seen on `gemini-3.1-pro-preview`, `gemini-2.5-pro`). The two tiers are glued together because `.text()` joins nested nodes without separators. The second tier sometimes omits the word `tokens` (`prompts > 200k`). Accept that. Do not accept `<`. That is a different boundary from `<=`.
  3. **Price schedule:** `$2.00 through November 30, 2026.$4.00 starting December 1, 2026.` (seen on `gemini-4-argon`, `gemini-3.8-flash`). This is a published future price change.
  4. **Mixed dimensions:** `Context caching price` can contain a cache-read price **and** a storage price (`$0.50 / 1,000,000 tokens per hour (storage price)`). Split into segments and map each by its text. **Decided in 7d:** the storage segment is a warning. It is not a `cache_read` row, and `cache_storage` is not added to the shared shape yet. Taking every `$` in the cell would put storage in the wrong dimension.
- **Rules:**
  - Cell grammar is strict. An unknown pattern for a **tracked** model throws. For an untracked model it is a warning (section 5).
  - Sections with more than one model code under one `h2` (the "Live" section lists 3) cannot attribute a table to one model. Flag as out of MVP. **Decided in 7d:** this also includes `gemini-3.1-pro-preview`, because that heading lists a second code, `gemini-3.1-pro-preview-customtools`. The parser emits no rows for that heading. The tier grammar is covered by Gemini 2.5 Pro, which has one code.
  - **Decided in 7d:** a storage amount inside a cache cell is a warning, not a `cache_read` row, and `cache_storage` is not added to the shared shape. A modality parenthetical such as `(text)` or `(audio)` is also a warning, not `input` or `output`. A plain price on the same model can still become a row.
  - `Free of charge` and `Not available` are not prices. Do not read the Free column.
  - Audio and transcription models are not per-token text pricing. Flag as out of MVP dimensions.
- **Hash the parsed schedule, not the "current" price** (section 4), so the hash does not change on Dec 1 when the page did not.

### 3.4 models.dev (witness)

- JSON: `provider -> models -> model`. `cost: { input, output, cache_read, cache_write }` in USD per 1M tokens.
- `release_date` and `last_updated` are **model** dates, not price-change dates. No price history.
- `cache_write` only maps to the 5-minute price. Compare only dimensions both sides have.
- Model names differ from official pages (`claude-haiku-4-5` vs "Claude Haiku 4.5" vs dated API IDs). This is what `model_aliases` is for. Step 7b matches Anthropic by cleaning the display name (strip a trailing `(latest)` only) and using the same page-label slug as the official parser (`claude-haiku-4.5`). API ids are not the join key. The alias table is still a later step.
- 5.6 MB: gitignored, never committed.

### 3.5 LiteLLM (witness)

- URL: the **raw** file, `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` (not the github.com page).
- Costs are **per token**. Verified against Anthropic's page for `claude-haiku-4-5`:

| LiteLLM field                               | Dimension                      |
| ------------------------------------------- | ------------------------------ |
| `input_cost_per_token`                      | `input`                        |
| `output_cost_per_token`                     | `output`                       |
| `cache_read_input_token_cost`               | `cache_read`                   |
| `cache_creation_input_token_cost`           | `cache_write_5m`               |
| `cache_creation_input_token_cost_above_1hr` | `cache_write_1h`               |
| `*_batches`                                 | ignore (batch is out of scope) |

- `haiku-4-5` matched 21 keys (Bedrock, Vertex, Azure, regional copies). Those are other **platforms** (out of MVP). **Filter on `litellm_provider == "anthropic"` and `mode == "chat"`**, not on key naming.
- The bare key and the dated key (`claude-haiku-4-5`, `claude-haiku-4-5-20251001`) are the same model: `latest_pointer` and `dated_snapshot` aliases. If both resolve to one model and disagree, flag it.
- No dates and no history. It can witness both cache write dimensions (models.dev cannot).
- Unit conversion: use `decimal.js`, never float math.
  `new Decimal(String(perToken)).mul(1_000_000).toFixed()`
- **Tier fields (verified 2026-10-18 against `/tmp/litellm.json`, not mapped yet):**
  - A search for `above_` also matches `cache_creation_input_token_cost_above_1hr`, which is the 1-hour cache write we already mapped. That is not a context tier.
  - Context-tier fields look like `input_cost_per_token_above_200k_tokens` (also `100k`, `128k`, `272k`, `512k`). Cache read/write have the same suffix. Extra suffixes `_batches`, `_flex`, `_priority` are other modes, out of MVP.
  - 258 rows have a token-tier `above_*_tokens` field. The naive first-three keys from the TODO jq are Bedrock copies; filter by `litellm_provider` before drawing conclusions.
  - Official Anthropic chat: `claude-haiku-4-5` only has `above_1hr`. `claude-haiku-5-5` is the Anthropic row that has `*_above_200k_tokens` (and similar) fields.
  - Official OpenAI: `gpt-5.5` has `*_above_272k_tokens` (plus `_batches` / `_flex` variants).
  - Gemini API rows are keyed `gemini/<id>` with `litellm_provider: "gemini"`. The bare key `gemini-2.5-pro` is Vertex (`vertex_ai-language-models`). `gemini-4-argon` does not exist as a bare key.
  - We are **not** mapping these token-tier LiteLLM fields yet. They are a witness of "this model has a context split," not a source of truth.

---

## 4. Shared design decisions

### 4.1 Normalized shape (updated)

```ts
type Dimension =
  | "input"
  | "output"
  | "cache_read"
  | "cache_write_5m"
  | "cache_write_1h"
  | "cache_write"; // OpenAI's single cache-write price (decided in 7c)

// Tier conditions use "over" / "atMost" so the boundary is never ambiguous:
//   Anthropic "up to 100,000"  -> { promptTokensAtMost: 100000 }
//   Anthropic "over 100,000"   -> { promptTokensOver: 100000 }
//   Google "<= 200k" / "> 200k" -> { promptTokensAtMost: 200000 } / { promptTokensOver: 200000 }
type Condition = { promptTokensOver?: number; promptTokensAtMost?: number };

type NormalizedPrice = {
  provider: "anthropic" | "openai" | "google";
  modelName: string; // cleaned display name ("Claude Haiku 4.5")
  modelSlug: string; // page-label slug from modelName ("claude-haiku-4.5"), not an API id
  dimension: Dimension;
  usdPer1M: string; // canonical decimal string ("12.5", never "12.50", never a float)
  condition?: Condition;
  validFrom?: string; // ISO date as written on the page ("2026-12-01"), no time zone invented
  validUntil?: string; // inclusive, as written
  source: "official" | "models.dev" | "litellm";
  note?: string; // non-tier parenthetical ("retired...", "limited availability")
};
```

The Zod schema lives in `src/core/pricing/shape.ts`. Anthropic `modelSlug` is derived only from the cleaned display name (lowercase, spaces to hyphens, dots kept). It is not `claude-haiku-4-5`. Alias resolution is a later step.

This replaces the earlier `minContextTokens`, which could not express `<=` versus `<` and invites off-by-one bugs.

### 4.2 Rules for every adapter

- Prices are **decimal strings** in one canonical form (`new Decimal(x).toFixed()`). Compare with `Decimal.equals`, never `===`.
- Parsers are **pure functions**: no `new Date()`, no network. A separate `activeOn(rows, asOf)` picks the active price for a date.
- A price schedule becomes **one row per segment**. Future segments are "announced, re-verify on every fetch", never settled fact.
- **Hash the full parsed output** (all segments), not the resolved current price.
- Parsers return all rows. Picking the ~10 tracked models is a separate step.
- Locate by **meaning** (heading ids, header text, row labels), never by line number or position.
- Throw on 0 rows, a missing required column, an unrecognized unit, or an unrecognized cell format for a tracked model.
- Validate parser output with Zod.

---

## 5. Robustness: what happens when a page changes

We cannot make a scraper that never breaks. The goal is that a break is **loud, never wrong, and cheap to fix**.

1. **Locate by meaning.** Survives reordering, restyling and extra rows.
2. **Fail closed.** A structural change becomes `parser_suspect` plus an alert. Nothing is diffed or published from a suspect parse, and the site keeps the last confirmed price with a banner.
3. **Strict where it matters.** A parse failure on a **tracked** model fails the run. The same failure on an untracked model is only a warning, so an exotic section elsewhere on the page cannot take the whole source down.
4. **Cross-check with witnesses (deferred).** A fallback "verify mode" that only asks whether a current price still appears near a model name is not worth building yet. It cannot know dimensions, tiers, schedules, or dates, and witnesses lag after real changes. Revisit in Phase 5 if `parser_suspect` is common. Until then, a break is `parser_suspect` plus a fixture update (item 5).
5. **Fix workflow:** save the new page as a dated fixture, write a failing test, adjust the adapter, ship. Keep dated fixtures (`google-pricing.2026-10-18.html`); the Dec 1 change gives a free real-world sample.

We will measure the real break rate from `fetch_log` before adding heavier machinery (LLM second extractor, review chat). Add those when the specific pain shows up, not before.

---

## 6. Plan (stages replacing step 7)

1. Anthropic parser, header-based, tested against the fixture. **Done:** `src/core/pricing/anthropic.ts` (`parseAnthropicPricing`). Fail-closed tests: `src/core/pricing/anthropic.test.ts`.
2. models.dev adapter + a comparison script for Anthropic's models. **Done:** `src/core/pricing/models-dev.ts` (`parseModelsDevAnthropic`) and `scripts/compare-models-dev-anthropic.ts`. Fail-closed tests: `src/core/pricing/models-dev.test.ts`. **Verify-mode decision:** do not build it now. It cannot see dimensions, tiers, schedules, or dates; witnesses lag after real changes; and there is no `fetch_log` yet so there is no measured break rate. Revisit in Phase 5 if `parser_suspect` shows up.
3. OpenAI parser (Standard section only). **Done:** `src/core/pricing/openai.ts` (`parseOpenAiPricing`). Fail-closed tests: `src/core/pricing/openai.test.ts`. OpenAI's single cache-write column maps to `cache_write`.
4. Google parser (largest job; cell grammar for 4 formats). **Done:** `src/core/pricing/google.ts` (`parseGooglePricing`). Fail-closed tests: `src/core/pricing/google.test.ts`. Standard text prices only. Schedules are `validFrom` / `validUntil` rows. Storage and modality prices are warnings.
5. LiteLLM adapter as a third witness. **Done:** `src/core/pricing/litellm.ts` (`parseLiteLLM`). Fail-closed tests: `src/core/pricing/litellm.test.ts`. Chat rows for `litellm_provider` `anthropic`, `openai`, and `gemini` only. Per-token costs convert with `decimal.js`. `*_above_*k_tokens` and other unmapped cost fields are warnings, not rows. Dated `-YYYYMMDD` keys collapse to the bare key; a disagreement omits that dimension. No comparison against official parsers in this step: LiteLLM slugs stay API ids (`claude-haiku-4-5`), and official Anthropic slugs are page labels (`claude-haiku-4.5`).
6. Later: new-model detection, deprecation detection (missing on N consecutive checks), hash-based change detection (Phase 5).

Parser tests to write first: real fixture gives expected rows; missing column throws; bad unit throws; empty table throws; footnotes and links stripped; each fail-closed rule has one deliberate failing case.

---

## 7. Decisions still open (confirm during the parser stages)

- OpenAI single cache-write price: **Decided in 7c.** Map it to dimension `cache_write`. Do not treat it as a 5-minute or 1-hour price.
- Published price schedules (Google): **Decided in 7d.** Keep each segment as its own row with `validFrom` / `validUntil`. Do not collapse a schedule to today's price. Sales and promo periods remain out of scope.
- Postgres: `unique(price_version_id, dimension, condition)` treats NULL conditions as distinct. Use `NOT NULL DEFAULT '{}'` or `NULLS NOT DISTINCT` (Postgres 15+). Put this in the step-10 note.
- Google: do the Batch, Flex, Priority and Contributor modes matter? Out of MVP for now.
- Do we need a modality-specific input dimension (audio, image) later? Out of MVP.

---

## 8. TODO to finish step 5

- [x] Re-fetch Google in English (`?hl=en`, `Accept-Language: en`), assert `<html lang>` starts with `en`, re-save the fixture as `google-pricing.2026-10-18.html`.
- [x] Update `scripts/spike-sources.ts` with the same locale pinning and assertion.
- [x] Add `tests/fixtures/models-dev-api.json` to `.gitignore`.
- [x] Commit a small trimmed slice of models.dev and LiteLLM for the **spike example ids** named in this note (`tests/fixtures/models-dev-sample.json`, `tests/fixtures/litellm-sample.json`). This is so tests do not need the 5.6 MB file. It is **not** the MVP catalog; picking the ~10 tracked models is still a later step.
- [x] Verify LiteLLM tier fields (see section 3.5). The TODO jq also matches `above_1hr`; token-tier fields are the `*_above_*k_tokens` names.
- [x] Open the PR for step 5. Merged as PR #3.

## 9. Out of scope for the MVP

Batch, Flex, Fast, Ultrafast, Priority and Contributor modes; per-request tool pricing (grounding); audio, image and transcription pricing; regional and platform pricing (Bedrock, Vertex, Azure); sales and promo periods; following model-specific links.

---

## 10. Wayback live check (step 6, 2026-10-19)

One authenticated Save Page Now capture of the Anthropic markdown page. Script: `pnpm run spike:wayback`. Archived HTML was not committed.

**Request flow (confirmed live, not from a blog post):**

1. `POST https://web.archive.org/save` with `url=...` and `Authorization: LOW <IA_ACCESS_KEY>:<IA_SECRET_KEY>`. Returns `{ url, job_id }` immediately. That is not an archive.
2. Poll `GET https://web.archive.org/save/status/{job_id}` until `status` is `success` or `error`. Pending is the in-between state.
3. On success, the permalink is `https://web.archive.org/web/{timestamp}/{original_url}`. The API does not send a permalink field.

**Observed result:**

| | |
| --- | --- |
| URL | `https://platform.claude.com/docs/en/about-claude/pricing.md` |
| job_id | `spn2-eb689466aaf95d8a0a9e21c7b715f7caf3a5b380` (hex prefix, not the UUID in the public examples) |
| Time to success | 91 seconds (pending until then) |
| Permalink | `https://web.archive.org/web/20261019182706/https://platform.claude.com/docs/en/about-claude/pricing.md` |
| Archive HTTP status | 200 |
| Archive size | 49 KB |
| Dollar amounts in archived body | 190 |
| Readable | yes |

**Where to look:** API captures do not appear in Uploads or My Web Archives. There is no archive.org UI that lists pages saved with the S3 keys. The record is the Wayback permalink (and later `observations.archive_url`). Open: `https://web.archive.org/web/20261019182706/https://platform.claude.com/docs/en/about-claude/pricing.md`.

**Tier 3 answer:** yes, Wayback is good enough as the archive step. The archived copy of the easiest official page still contains the prices. Capture is slow (about a minute and a half here) and can fail or time out.

Timeouts stay non-fatal. Always keep the page we already fetched as `raw_content` (with `raw_content_hash`). On Save Page Now success, store the permalink on `archive_url`. On timeout or error, set `archive_status` to `failed`, do not block prices, and retry on a later run (step 24). The UI says "archive unavailable, using stored copy." Do not treat a finished POST as a stored snapshot. Archive is evidence packaging, not the publish switch; only `publishPriceVersion()` writes prices.

Auth keys stay in `.env` (`IA_ACCESS_KEY`, `IA_SECRET_KEY`). The production client is still step 24.
