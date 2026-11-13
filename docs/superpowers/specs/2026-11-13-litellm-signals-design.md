# LiteLLM signals

This is the first slice of the witness work. A witness is another site's price list. It can disagree with us, and it can show a name we do not track. It is not allowed to publish a price.

The file we read is LiteLLM's cost map:

`https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`

We do not use the GitHub commits feed. That feed only says the file was edited, and the file changes many times a day for models we do not track.

`parseLiteLLM()` already turns that file into rows. This slice compares those rows with the models we track and shows the result on a new reviewer page.

## What this slice does not do

- It does not call `publishPriceVersion()`.
- It does not write `price_versions`, `price_components`, `observations`, or `fetch_log`.
- It does not download an official pricing page.
- It does not start an official visit when a price disagrees. That is a later slice.
- It does not add a model to the catalog. A new name is only a card.
- It does not set `deprecated_at`. A missing model is only a card.
- It does not change Following, Alerts, Receipts, Requests, Price reports, Contributions, or the official Sources board.
- It does not put witness rows on the price review queue. The queue stays the list of official items waiting for a person.

## One read

`readLiteLLMSignal()` downloads the cost map and runs `parseLiteLLM()`. Tests pass a fake fetch and a saved fixture, so they never call GitHub.

The kept rows are already limited to Anthropic, OpenAI, and Google chat models. Other labs in the file are ignored by the parser.

A download that throws, or an HTTP status outside 200–299, is a failed read. A parser throw, including "no kept chat rows," is a failed read. A failed read stores the attempt and leaves the previous findings in place.

A successful read stores the set of model slugs it saw. The first successful read is the baseline. It stores that set and the price comparisons. It does not create a new-model card for names that are already in the file.

## Linking a model

LiteLLM's id for a model often differs from our page slug. `claude-haiku-4-5` and `claude-fable-5.1` are the two shapes. The join key is the tracked model's slug, or an `aggregator_slug` alias.

Before the first read, we look up each tracked model in a saved fixture and record the result in `docs/source-spike.md`. The alias list in code must match that note. A model with no key in the file gets no alias.

A one-time insert adds those aliases when the model already exists. It does not remove an alias that is already stored. A missing model row throws. A second run inserts nothing new.

On a read, a tracked model is in one of these states:

- **Linked.** Its slug, or one of its `aggregator_slug` aliases, is in this file.
- **Not linked.** It is not linked on this read, and it was not linked on the previous successful read. This is not a retirement. The page says "No witness name is stored." when the model has no alias. It says "The stored witness name is not in this file." when an alias is stored and that alias is absent.
- **Missing.** It was linked on the previous successful read, and it is not linked on this read. `deprecated_at` stays empty.

The first successful read has no previous read, so it writes no missing rows. It can write disagreements and not-linked rows. It creates no new-model cards.

## Comparing amounts

Compare a linked model to its open price only. The open price is the current published version. A future dated segment is not the open price.

Compare a dimension only when both sides use that same dimension name.

- One untiered amount (empty condition) is compared to LiteLLM's base amount.
- A short tier and a long tier: compare LiteLLM's base amount to the short tier only. The long tier is not a disagreement. LiteLLM's `above_*k_tokens` fields stay warnings, as they do today.
- A cache-write duration we do not share is skipped. OpenAI's 30-minute write is not Anthropic's 5-minute write.
- A skipped dimension is not a disagreement.
- `0.10` and `0.1` are the same amount. Compare them as decimals.
- Two open prices for one model throws. The read stores nothing for that attempt.
- Two amounts for one dimension on the open price throws the same way.
- A linked model with no open price, or with no dimension we can compare, is **not compared**. It is not an agreement and not a disagreement.

An agreement is a linked model where every compared dimension matched, and at least one dimension was compared. The page stores the count. It does not store one row per agreeing model.

A disagreement stores one row per dimension that differed. The row keeps our amount and the witness amount. The published price stays as it is.

## New names

On a later successful read, a slug becomes a new-model card when all of these are true:

- It is in this file.
- It was not in the previous successful read's slug set.
- It is not linked to a tracked model.
- No card already exists for this LiteLLM source and this slug.

A pending card stays pending. A rejected card stays rejected and does not come back. This slice has no Approve button. Approve would create a model, an offering, and an alias, and that is a later slice.

Reject sets the card to `rejected` and asks for a note. A blank note writes nothing. Reject does not write a price and does not change the catalog.

## What is stored

Add these tables. The same branch updates `docs/price-tables.md`: one diagram, plus a filled example of every new column. Keep the tables that are already there.

The LiteLLM file is one `sources` row. Its type is `aggregator`. Its URL is the raw JSON URL above.

`witness_reads` is one attempt:

| column | meaning |
| --- | --- |
| id | identity |
| source_id | the LiteLLM source row |
| fetched_at | when this attempt ran |
| outcome | `ok`, `fetch_error`, or `parse_error` |
| note | the failure sentence, empty on success |
| seen_slugs | the slug set, empty when the read failed |
| is_baseline | true only for the first successful read |
| agreed_count | linked models whose compared amounts matched. Empty when the read failed |
| not_compared_count | linked models we could not compare. Empty when the read failed |

`verification_flags` is a current disagreement. A successful read deletes this source's unresolved flags and inserts the new set. A flag that already has `resolved_at` is left alone. This slice never sets `resolved_at`.

| column | meaning |
| --- | --- |
| id | identity |
| offering_id | the tracked offering |
| source_id | the LiteLLM source |
| dimension | the price part that differed, such as `input` |
| detected_at | this read's time |
| aggregator_value | the witness amount, a decimal string |
| our_value | the open price amount, a decimal string |
| resolved_at | empty in this slice |
| resolution | empty in this slice |

`candidate_models` is a new name. One row per LiteLLM source and raw slug.

| column | meaning |
| --- | --- |
| id | identity |
| lab_id | Anthropic, OpenAI, or Google |
| raw_name | the LiteLLM slug, because the file has no separate display name |
| raw_slug | the LiteLLM slug |
| source_id | the LiteLLM source |
| first_seen_at | the read that first saw it |
| status | `pending_review` or `rejected` |
| resolved_model_id | empty in this slice |
| reviewed_by | the reviewer id on Reject, empty while pending |
| reviewed_at | the click time on Reject |
| review_note | required on Reject |

`model_signals` is the current not-linked and missing list. A successful read replaces this source's rows.

| column | meaning |
| --- | --- |
| id | identity |
| model_id | the tracked model |
| source_id | the LiteLLM source |
| kind | `not_linked` or `missing` |
| detected_at | this read's time |

A failed read does not change flags, candidates, or model signals. One successful read writes its rows in one transaction. A download or parser failure is stored as `fetch_error` or `parse_error`. Two open prices, or two amounts for one dimension, throw instead. That transaction rolls back, and the schedule route returns 500.

## The Signals page

`/review/signals` uses the same review lock as `/review`. A signed-out visitor is redirected. Any other account is refused. The path is already covered by `isProtectedReviewPath()`.

Add a **Signals** tab on the review row, after Sources. Queue, Sources, Requests, and Price reports stay where they are.

The page shows the latest attempt and the latest successful read:

- When the latest attempt failed, say so, and keep the last good lists on the page.
- The agreed count and the not-compared count come from that successful read.
- Disagreements show the model, the dimension, our amount, and the witness amount.
- New names still pending show the lab and the slug, with Reject.
- Missing models show the model name. Not-linked models show the model name and the sentence that we have no witness name.
- Zero rows in a list say so in one sentence. A database that has never had a successful read says the witness has not been read yet.

Amounts stay decimal strings. `0.10` is not shown as `0.1`.

## Schedule

`vercel.json` gains one schedule, `signals-litellm`, at minute 30 every 6 hours UTC. That sits after the Google visit at minute 20. It sends POST to `/api/signals/litellm`.

The route checks `CRON_SECRET` the same way the official visits do. A missing, short, or wrong secret is 401 and does not open the database. A filed read, including a failed download, is 200. A throw is 500. The body and the log line leave out the database URL and the secret.

`pnpm signals:litellm` runs the same function once, so a local read does not wait for the schedule.

## Tests

- A fixture covers a linked agreement, a linked disagreement, a short tier against a base amount, a long tier that must not become a disagreement, an unshared cache-write duration, a not-linked model, and a second read that adds one new slug.
- The first successful read creates no new-model card.
- The second read creates one card for the new slug and does not create a second card for a slug from the first read.
- Reject with a note hides the card. A blank note writes nothing. The same slug on a later read does not open a new card.
- A failed download leaves the previous disagreements in place.
- A model that was linked and then disappears becomes missing. A model with no alias stays not linked.
- No test calls GitHub. Database tests roll back and skip when `DATABASE_URL` is missing.

## Later steps

These are not part of this branch. The order is [docs/build-plan.md](../../build-plan.md).

1. OpenRouter uses the same comparison (step 34).
2. A disagreement asks the official visit to run sooner (step 35).
3. **Signal health (step 36).** `/review/signals` becomes a board, like `/review/sources`. One row per signal shows the last run, the outcome, and the counts. The detail page `/review/signals/<id>` shows that signal's run history and its current findings. There is no Wayback column. This slice may use `/review/signals` for the single LiteLLM read. Step 36 moves that read to the detail URL.
4. **Approve a new model (step 37).** A pending card is only for Anthropic, OpenAI, or Google. Approve creates the model, one global `official-api` offering, and the `aggregator_slug` alias. The model shows on `/models` with no published price. The next official visit can flag a price. `publishPriceVersion()` is still the only price writer. A slug from any other lab is ignored.
5. **Labs page (step 38).** A public page lists the labs we track and how many models each has. A signed-in visitor can suggest a lab we do not track. The suggestion is a Request and also appears under Contributions. Accepting a suggestion does not create a parser or a schedule.
6. A new official price can publish with no reviewer when the cell check finds the number on the official page and at least one witness shows the same new amount. If the witnesses disagree with each other, or neither has the model, the item stays for a person. A jump of more than 10x also stays for a person. The stamp on that path must not be `system:same-price`.
