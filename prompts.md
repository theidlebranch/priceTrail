# PriceTrail UI redesign prompts

This is a visual pass. It is not a step in `docs/build-plan.md`.

The look is Vercel-like: a white page, hairline borders, Geist, and the current green only for the primary button, links, and active states. Screenshot guesses that would invent data or change meaning are already removed. Follow this file, not an older draft.

Note on screenshots: the Review, Review item, Source health, and Model detail screenshots were taken zoomed out. Only the Models screenshot is at 100%. Do not shrink font sizes, chart height, or spacing because of how those screenshots look. Judge the result at 100% browser zoom.

How to use: run PROMPT 0 first, then the pages one at a time. Review each page in the browser at 1440px and 390px before moving on.

Suggested order: 0, then Models, model detail, review queue, review item, source health, then the final pass.

There is no `.cursor/rules/ui-design.mdc`. The design note that does exist is `.agents/skills/frontend-design/SKILL.md`. Where this brief names colors, type, and borders, this brief wins.

## Do not change

- Do not add queries, and do not change what an existing query returns.
- Do not change routes or path shapes.
- Do not edit confirm or reject behavior. `publishPriceVersion()` stays the only function that writes a price.
- Do not touch the review lock (`src/proxy.ts`, allowlist, or sign-in actions).
- Do not remove `Suspense` or `connection()` from a page. Those keep the page off the static build.
- Keep every user-facing sentence word for word. Tests and the product voice depend on them. Layout, color, type, and the chart padding may change.
- The word in the code is **lab**, not provider. A lab is the company (Anthropic, Google, OpenAI today). Read names from the rows. Do not hardcode those three. A fourth lab must still work.
- Amounts stay the stored decimal strings. Do not turn `0.10` into `0.1`.

## PROMPT 0: Design foundation (run first, once)

Restyle the shared chrome and the tokens. This reaches every page, including the landing page, because they share one stylesheet. Change colors and type only. Leave the landing page layout and copy alone. Leave the footer copy alone.

Files:

- `src/app/globals.css` for tokens
- `src/app/layout.tsx` for the font
- `src/components/site-header.tsx` for the header
- `src/components/page-shell.tsx` only if the header offset must change

Use the existing stack (Next.js, Tailwind, the shadcn pieces already in the repo, Recharts, lucide-react). shadcn on this repo is only `src/components/ui/button.tsx`, `card.tsx`, and `input.tsx`. Do not install a component kit up front. Add a small shared piece only when a page in this pass renders it.

Tokens in `globals.css`, on the variables that already exist (`--background`, `--foreground`, `--primary`, and the rest):

- Background: pure white (`#fff`). Secondary surfaces `#fafafa`. Remove the current lavender page tint (`#faf8ff`).
- Text: near-black `#171717` for primary, `#666` for secondary, `#8f8f8f` for tertiary.
- Borders: 1px `#ebebeb`. No drop shadows on cards. Surfaces are defined by borders only.
- Accent: the current brand green `#005c55`. The logo mark stays `#0F766E`. Use the green only for the primary button, links, and active states.
- Semantic colors, used only as small status shapes: green = confirmed or ok, amber = needs review or warning, red = error or failed, blue = info, gray = neutral.
- Radius: 8px for cards, 6px for buttons, inputs, and badges. Nothing larger.
- Fonts: Geist Sans for UI, Geist Mono for prices, dates, URLs, and ids. Load them with `next/font`. Do not add a font package. Today the stack is Arial and a system mono font.
- Base size 14px. Page title 28–32px at weight 600. Section title 16px at weight 500. Meta 12–13px.
- All numbers use `tabular-nums`.

Do not add a dark theme. The file has a `dark` variant and no dark token set. Do not add a theme toggle.

Layout:

- Keep the shared container that already exists: `max-w-7xl` with `px-4 sm:px-6 lg:px-10`. Header, footer, landing page, and data pages all use it. Do not switch pages to `max-w-5xl`. The models page feels empty because of the card grid, not because the container is wrong.
- Header (`src/components/site-header.tsx`): it is already fixed, 56px tall (`h-14`), with a bottom border. Keep that. Keep the mobile menu. Remove the extra "Browse models" button on the right. The nav already contains that link.
- Nav links stay: Browse models (`/models`), Receipts (`/#receipts`), How it works (`/#how-it-works`), Honest by design (`/#honest`). An active style fits `/models` only. The other three are landing-page anchors. Do not add a GitHub button.
- Page header pattern for the data pages: title, the existing one-line description, optional actions on the right. Do not invent a new eyebrow above every title.

Focus rings already exist in `globals.css`. Keep them visible.

Loading today is one sentence inside Suspense: "Loading models…", "Loading model…", "Loading review…", "Loading sources…", "Loading sign-in…". A skeleton may replace that sentence. The sentence's job stays: the list is not ready yet.

Sign-in (`src/app/review/sign-in/page.tsx`) picks up the new tokens and the same container. Leave its copy and buttons as they are: "Review sign-in", "Only a listed Google or GitHub account can open the review page.", "Review sign-in is not configured.", "Sign in with Google", "Sign in with GitHub", and "Sign out".

## PROMPT 1: Models list (`/models`)

Files: `src/app/models/page.tsx`, `src/components/model-list.tsx`. The rows are built in `src/app/models/model-list-entries.ts`.

`listModels()` returns the lab name, lab slug, model name, model slug, and `deprecatedAt`. The list component receives `labName`, `modelName`, `href`, and `retired`. It does not receive a price or a review flag. Prices stay on the detail page. Do not add `$10 / $50` or "Under review".

Keep these sentences:

- Title: "Tracked models"
- Description: "These are the models PriceTrail follows."
- Empty list: "No models are tracked yet."

Make it:

- Page header: the title, the description, and a count of the loaded rows (for example "9 models"). The count is `entries.length`. It is not a new query.
- Under the header: a search input that filters by model name, and lab filter chips. Chips are "All" plus one chip per `labName` present in the entries, with a count on each chip. Client-side filtering of the rows already loaded is enough. Do not also group the rows under sticky lab headings.
- Replace the two-column card grid with one bordered list. Hairline dividers. Each row is the existing link (`/models/<lab slug>/<model slug>`). Do not invent a new route.
- Left: model name. Lab name beside or under it, in the quieter text color. When `retired` is true, keep the word "Retired".
- Right: a chevron. The whole row is clickable. Hover background `#fafafa`.
- The container stays `max-w-7xl`.

## PROMPT 2: Model detail (`/models/[labSlug]/[modelSlug]`)

Files: `src/app/models/[labSlug]/[modelSlug]/page.tsx`, `src/components/model-detail.tsx`, `src/components/price-history-chart.tsx`. The view is `toModelDetailView` in `src/app/models/model-detail-view.ts`.

Keep every branch the view already has. Do not drop a sentence because one screenshot did not show it.

Header:

- Breadcrumb, already there: "Models" links to `/models`, then the lab name, then the model name.
- Title is the model name. When `retired` is true, keep "Retired".
- When `versionCount` is greater than 0 and `sinceDay` is set, keep "{n} price version since {day}" or "{n} price versions since {day}".
- The review notice is only this sentence: "A possible change is under review." It is a yes or no. It has no review item id and no pending amount. Style it as a quiet amber callout if you want. Do not add a "Review it" link. Do not move the published date into that notice.
- The published price has its own line. Keep `dateLine` as the view built it. It is one of these two: "Changed on or before {day}." or "Announced for {day}. First seen {day}." Next to it, the "Official pricing page" link stays a real link (`sourceUrl`, new tab). This link is not the review-page URL.
- When `price` is null, keep "No current price is published."

Hero prices: the INPUT and OUTPUT cards may use larger mono type. Keep the "/ 1M tokens" line. When `change` is present, keep the direction mark, the percent, "was {previous amount}", and the previous date. When `change` is null, show nothing there. Do not invent a "no changes" caption.

Price components: one bordered table is fine. Keep, for each row, the dimension label, the condition label when it is non-empty, the multiplier when `multiplierText` is set, the last-change mark and date when `lastChange` is set, and the amount. Keep the section title "Price components" and the line "USD per 1M tokens." A multiplier is not on every row.

Price history:

- Keep the section title "Price history".
- When there is nothing to draw and nothing was skipped, keep "No price history is published."
- The dimension tabs already exist. Keep them, and keep the change count line: "{n} change · {label}" or "{n} changes · {label}".
- Keep each skipped-tier sentence: "{label} has a tier, so it is not on this chart."
- Under the plot, when `changeCount` is 0, keep "No changes since {day}."
- Keep the legend words: "Solid line: a price we saw" and "Dashed line: a gap between checks".
- Keep the screen-reader table inside the chart. It is the accessible copy of the same series.

Chart fix, same data:

- The plot is `h-28` (112px). Raise it to at least 240px.
- X labels are full `YYYY-MM-DD`, placed on the first and last instant, with bottom margin 0, so they clip. Add horizontal padding. Shorten the tick text to a short UTC date such as "Oct 18". Do not add ticks that look like extra observations. Two ticks (first day and last day) are enough when the range is more than one day. One tick is enough when the range is a single day.
- Keep flat known segments and dashed gap segments. Do not switch the line to `stepAfter`. A step across a gap would claim the old price was still known.
- Do not add a 1M / 6M / 1Y / All control. The view has no range, and the history is short.
- The tooltip already shows the day and `$` plus `amountText`. For a gap it also says "Not observed between checks." Keep that. Do not invent old price, new price, and percent in the tooltip. The change log already has the percent.
- A light fill under known segments only is allowed. Gaps stay dashed and unfilled.
- The Y axis is hidden today. A muted axis is allowed only if the labels are not a second rounding of the price. The number the reader trusts is `amountText` in the tooltip and in the screen-reader table.

Change log:

- Keep the title "Change log".
- A vertical timeline is fine. Each event keeps its date line, the "{n} component changed" or "{n} components changed" line, and for each change the dimension, the condition when present, "{from} → {to}", and the direction mark with percent.
- When there are no events, keep "No price changes since {day}." if `sinceDay` is set, otherwise "No price changes are published."

## PROMPT 3: Review queue (`/review`)

Files: `src/app/review/page.tsx`, `src/components/review-list.tsx`. The rows are built in `src/app/review/review-list.ts`.

This route is locked. Do not touch auth. Each row already has the model name, lab name, full source URL, fetched time as `YYYY-MM-DD HH:MM:SS UTC`, and the review note when one is stored. The list query does not load `parsed_data`, so there is no warning count. Do not add one. Do not compute "20h ago". The mapper does not read the clock. Keep the UTC string. Do not add J/K keys.

Keep these sentences:

- Title: "Review"
- Description: "Official snapshots that are still waiting. A flagged row is not a published price."
- The "Source health" link to `/review/sources`. It may look like a button. The href stays.
- Empty list: "Nothing is waiting for review."

Make it:

- Page header: title, description, and the Source health action on the right.
- A count of the loaded rows is enough (for example "3 waiting"). That count is `entries.length`. Do not add summary tiles for warnings or a last-fetch time. Those fields are not on this page.
- Search by model name, and lab chips built the same way as on the models page: from the rows, not from a hardcoded list of three labs.
- One bordered list, not a stack of cards. Each row is the existing link, `/review/items/<id>`.
- Show the model name, the lab name, the UTC timestamp, the full source URL, and the review note when `reviewNote` is not null. The URL may wrap. It must stay readable, not hidden behind a tooltip.
- Every row on this page is already waiting. Do not add a "Pending" badge on each row.
- Hover background `#fafafa`, chevron on the right.

## PROMPT 4: Review item (`/review/items/[id]`)

Files: `src/app/review/items/[id]/page.tsx`, `src/components/review-detail.tsx`, `src/components/review-decision-form.tsx`, `src/components/review-decision-fields.tsx`. The view is `toReviewDetailView` in `src/app/review/review-detail.ts`.

A two-column layout on desktop is fine: the source and the table on the left, the decision form on the right. On a narrow screen, stack them. The form must not cover the table or hide a refusal message.

Header: breadcrumb "Review" linking to `/review`, then the model name as the title, and the lab name under it.

Keep every status sentence. They change with the stored status. Do not replace them with badges that drop the words.

- Flagged: "Waiting for review."
- Cell check passed: "The cell check passed."
- Confirmed: "A reviewer confirmed this item."
- Rejected: "A reviewer rejected this item."
- Always: "This is not a published price."
- Always: "No cell check is stored for this item."
- While the item is flagged: "Confirm publishes this price. Reject publishes nothing."
- Otherwise: "This decision is already recorded."

Confirm and Reject render only when `canDecide` is true (the item is flagged). They must stay submit buttons on the existing server action. The button name stays `decision`. The values stay `confirm` and `reject`. Do not replace them with a client click. Do not add C or R hotkeys. Confirm can publish a price.

The note field stays required. A blank note is refused. On a refusal, the typed note must come back into the box, and the refusal sentence must show. That reset already lives in `review-decision-fields.tsx`. Do not mark the note optional. The label stays "Note".

When the view has them, keep "Reviewed by {id}.", "Reviewed at {time}.", and the stored review note.

Source block:

- Keep the source type label. It is not always "Official pricing page". It can also be "Wayback", "Aggregator", "Announcement", "Changelog feed", or "Platform API".
- The source URL is plain text on purpose, so a stored address cannot navigate the browser. Do not turn it into a link. A copy button is fine. The model page's official link is a different field and stays a link.
- Keep "Fetched {time}."

Warnings: when the view has a warning sentence, keep it. It is "This snapshot has 1 warning." or "This snapshot has {n} warnings." The view does not include the warning strings. Do not add a collapsible list in this pass. When the count is 0, the view has no warning sentence. Do not invent one.

Prices:

- When `prices.kind` is `not-a-price-list`, keep "This snapshot is not a parsed price list." and do not render a table. The seeded Mythos example is this case.
- Otherwise keep one table row per parsed row. Do not merge schedule periods into one row. A row with a schedule date cannot be confirmed. The server says "price schedule cannot be confirmed yet". The Schedule column is how the reviewer sees that.
- Columns stay: Dimension, USD per 1M tokens, Condition, Schedule, Note, Row source. Hide the Condition column only when every visible row has an empty condition. Hide the Note column only when every visible row has an empty note. If any row has a value, keep the column.
- Row source is the stored source string. Do not replace it with a made-up "official" badge.
- Amounts stay the stored decimal strings, in mono, right-aligned is fine.

## PROMPT 5: Source health (`/review/sources`)

Files: `src/app/review/sources/page.tsx`, `src/components/source-health-list.tsx`. The view is `toSourceHealthView` in `src/app/review/source-health.ts`.

This route is locked. Do not touch auth. Do not fetch favicons.

Keep these sentences:

- Title: "Source health"
- Description: "Every stored page, its latest check, and whether the schedule still looks up that URL. A warning here is not a published price."
- "Back to the review queue" linking to `/review`. It may look like a button. The href stays.
- Empty list: "No sources are tracked yet."

Above the list, keep every `missingCheckerWarnings` line. The text is "The schedule looks up a URL that is not in the database: {url}".

Each source already carries more than the screenshot showed. Keep all of it:

- The full URL, visible, not only a domain in a tooltip.
- The type text, as stored (for example "official").
- "Active" or "Inactive".
- Either "Not checked yet." or "Last checked {time}."
- When a check exists, one line is "{outcome}. {timestamp}. {http}." The outcome is one of "Prices unchanged", "Parsed prices changed", "The parser could not read the page", or "The download failed". The timestamp is the UTC string. The http part is "No HTTP status." or "HTTP status: {code}."
- The note line when a note exists: "Note: {note}."
- The archive sentence, one of: "No snapshot yet.", "Archive is still pending.", "Archived.", "Archive failed. The stored copy remains."
- The warning when one is set: "No checker is wired to this URL." or "The next visit will stop before download."

Do not collapse a row to Active / official / 200 / unchanged / Archived. Those shorter badges hide a failed download, a pending archive, and a URL the schedule no longer fetches.

A failure must look different from a success. A row needs attention when any of these is true: the archive sentence is "Archive failed. The stored copy remains.", the HTTP line is "No HTTP status.", the outcome is "The download failed" or "The parser could not read the page", the row is "Inactive", or a warning string is set. An amber left border on that row is enough. "Archived." and "Prices unchanged" stay quiet.

Summary counts are optional, and only from fields already on the view:

- Sources: `entries.length`
- Needs attention: the rows above, plus each missing-checker line
- Healthy: the other rows

One bordered list is fine. On a narrow screen the lines wrap. They do not disappear.

## Final pass (after all pages)

Review the data pages and the landing page at 1440px and at 390px.

Check:

- The container is still `max-w-7xl` with the same horizontal padding on the header, footer, landing page, and data pages.
- The lavender page background is gone. Landing layout and landing copy are otherwise unchanged.
- The duplicate "Browse models" button is gone. The mobile menu still works.
- Existing sentences listed above are still present, word for word.
- The chart is at least 240px tall, the first and last date labels are not clipped, known segments are solid, and gaps are still dashed.
- The review item still posts Confirm and Reject through the existing form. The note still comes back after a refusal.
- The review source URL is still not a link.
- No new query was added. `publishPriceVersion()` is still the only price write.

List anything you still find, fix it, and write a short summary of what changed.
