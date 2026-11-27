import Link from "next/link";

const sections = [
  { num: "01", id: "code-layers", label: "Code layers" },
  { num: "02", id: "where-it-runs", label: "Where it runs" },
  { num: "03", id: "who-sees-which-page", label: "Who sees which page" },
  { num: "04", id: "six-hour-clock", label: "Six-hour clock" },
  { num: "05", id: "one-official-visit", label: "One official visit" },
  { num: "06", id: "a-changed-page", label: "A changed page" },
  { num: "07", id: "a-person-decides", label: "A person decides" },
  { num: "08", id: "a-price-period", label: "A price period" },
  { num: "09", id: "only-price-writer", label: "Only price writer" },
  { num: "10", id: "witnesses", label: "Witnesses" },
  { num: "11", id: "untracked-model", label: "Untracked model" },
  { num: "12", id: "suggest-a-lab", label: "Suggest a lab" },
  { num: "13", id: "tables", label: "Tables" },
  { num: "14", id: "when-a-number-looks-wrong", label: "Wrong number" },
];

export default function DocsIndexPage() {
  return (
    <div className="doc-sheet">
      <nav className="docs-sections" aria-label="Sections">
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>
                <span className="docs-num">{section.num}</span>
                {section.label}
              </a>
            </li>
          ))}
          <li className="docs-later">
            <a href="#not-built-yet">Not built yet</a>
          </li>
        </ol>
      </nav>
      <div className="doc-essay">
        <h1>How PriceTrail works</h1>
        <p className="doc-intro">
          These pictures describe the code as it is now;{" "}
          <a href="https://github.com/theidlebranch/priceTrail/blob/master/docs/architecture.md">
            docs/architecture.md
          </a>{" "}
          is the design, including parts not built yet.
        </p>
        <p className="doc-read">
          The drawings use the diagram-design colors. The paper is white-smoke, the type is
          jet-black, and the burnt-tangerine box is the price write, <code>publishPriceVersion()</code>.
          Sage, dusty blue, mustard, rust, and slate mark the other kinds of box.
        </p>

        <section id="code-layers">
          <h2>1. Code layers</h2>
          <p>
            The pages (<code>src/app</code>) call the server code (<code>src/server</code>) and also
            call the shared logic (<code>src/core</code>) directly.
          </p>
          <p>
            The server calls <code>src/core</code>. That shared folder has no database import and no
            fetch, so it cannot talk to Postgres or download a page.
          </p>
          <p>
            A price row is written only by <code>publishPriceVersion()</code> in{" "}
            <code>src/server/db/publish-price-version.ts</code>. <code>src/proxy.ts</code> runs before
            the page, so a gate can redirect or refuse before any page starts.
          </p>
          <p className="doc-see">
            <Link href="/docs/code-layers">Code layers</Link>
          </p>
        </section>

        <section id="where-it-runs">
          <h2>2. Where it runs</h2>
          <p>
            The site runs on Vercel, which serves the web app (Next.js), starts the schedules, and
            keeps one login cookie that Google and GitHub share.
          </p>
          <p>
            The database is Neon Postgres, and saved page copies go to <code>web.archive.org</code>.
          </p>
          <p>
            LiteLLM is the cost-map file <code>model_prices_and_context_window.json</code> on{" "}
            <code>raw.githubusercontent.com</code>. OpenRouter is <code>openrouter.ai/api/v1/models</code>.
            We read both only to hear that a price may have changed.
          </p>
          <p className="doc-see">
            <Link href="/docs/where-it-runs">Where it runs</Link>
          </p>
        </section>

        <section id="who-sees-which-page">
          <h2>3. Who sees which page</h2>
          <p>
            A guest can open <code>/</code>, <code>/models</code>, <code>/labs</code>, and sign-in. A
            signed-in person lands on <code>/following</code> instead of <code>/</code>. The suggest
            form is on <code>/labs</code>. A reviewer on the allowlist (the list of accounts allowed
            to review) can open <code>/review</code> and the review pages.
          </p>
          <p>
            The gate (<code>src/proxy.ts</code>) does this before the page starts. A missing login
            secret (<code>AUTH_SECRET</code>) is a 403 on <code>/review</code> and does not load the
            login library. Once that secret is set, a signed-out visitor is sent to{" "}
            <code>/review/sign-in</code>, and any other account is a 403.
          </p>
          <p>
            These pages are empty placeholders: <code>/alerts</code>,{" "}
            <code>/receipts</code>, <code>/account</code>, and <code>/review/reports</code>.
          </p>
          <p className="doc-see">
            <Link href="/docs/who-sees-which-page">Who sees which page</Link>
          </p>
        </section>

        <section id="six-hour-clock">
          <h2>4. The six-hour clock</h2>
          <p>
            Every six hours, <code>vercel.json</code> POSTs <code>/api/verify/anthropic</code> at
            minute 0, <code>/api/verify/openai</code> at minute 10, <code>/api/verify/google</code> at
            minute 20, <code>/api/signals/litellm</code> at minute 30, and{" "}
            <code>/api/signals/openrouter</code> at minute 40.
          </p>
          <p>
            The drain path is <code>/api/triggers/drain</code>. <code>runPendingTriggers()</code> runs
            there at minutes 50, 52, and 54, and works through checks queued earlier.
          </p>
          <p>
            Each route checks the schedule secret (<code>CRON_SECRET</code>) with{" "}
            <code>cronRequestAuthorized()</code> before it does the work. A missing or short secret
            (under 16 characters) is refused.
          </p>
          <p className="doc-see">
            <Link href="/docs/six-hour-clock">The six-hour clock</Link>
          </p>
        </section>

        <section id="one-official-visit">
          <h2>5. One official visit</h2>
          <p>
            One visit (<code>verifyOfficialSource()</code>) downloads the lab page, parses it, and
            runs <code>checkParsedPrices()</code> (a sanity check that the numbers look like real
            prices). <code>recordSourceCheck()</code> stores a fingerprint (a short id of those parsed
            prices) and writes the ending.
          </p>
          <p>
            The visit ends as <code>fetch_error</code>, <code>parser_suspect</code> (a failed sanity
            check, or a parser that threw, and the page text is not stored), <code>unchanged</code>, or{" "}
            <code>changed</code>. A tracked model missing from the page is still stored.
          </p>
          <p>
            Those four endings write a log row (<code>fetch_log</code>). A throw before that insert
            writes no row, and the visit never publishes a price.
          </p>
          <p className="doc-see">
            <Link href="/docs/one-official-visit">One official visit</Link>
          </p>
        </section>

        <section id="a-changed-page">
          <h2>6. A changed page</h2>
          <p>
            A new fingerprint stores the snapshot (<code>observations</code>) and one row per tracked
            offering whose model is on the page (<code>observation_items</code>; an offering is one
            way to buy that model), and{" "}
            <code>trackedPriceUnchanged()</code> compares the prices that apply today with the open
            price.
          </p>
          <p>
            <code>10</code> and <code>10.0</code> match, and a later-dated price is ignored. The same
            price for today is stamped <code>system:same-price</code> and does not open a period (a
            stretch of time one price was in effect). A different amount stays flagged, and so does no
            open price or a snapshot the check cannot read.
          </p>
          <p>
            <code>syncOfficialCandidates()</code> files candidate cards, then{" "}
            <code>archiveObservation()</code> asks Wayback to save the page. A missing tracked model
            does not get a price-review row. Two good misses open a gone card.
          </p>
          <p className="doc-see">
            <Link href="/docs/a-changed-page">A changed page</Link>
          </p>
        </section>

        <section id="a-person-decides">
          <h2>7. A person decides</h2>
          <p>
            Confirm of a new price is <code>decideReviewItem()</code>. It stamps the item{" "}
            <code>confirmed</code>, then calls <code>publishPriceVersion()</code> in the same
            transaction (both writes save together, or neither does).
          </p>
          <p>
            The same price, checked by <code>sameConfirmPrice()</code>, stamps the item{" "}
            <code>confirmed</code> and does not call <code>publishPriceVersion()</code>. Reject stamps{" "}
            <code>rejected</code> and writes no price row.
          </p>
          <p>
            A blank note, or a source that is not <code>official</code>, throws for both buttons
            before any stamp. An earlier flagged item, or a snapshot <code>componentsForConfirm()</code>{" "}
            cannot read, throws only on confirm and leaves the item flagged.
          </p>
          <p className="doc-see">
            <Link href="/docs/a-person-decides">A person decides</Link>
          </p>
        </section>

        <section id="a-price-period">
          <h2>8. A price period</h2>
          <p>
            Each offering has one open price row. A change fills <code>last_seen_at</code> on the old
            row and opens a new one. A person&apos;s confirm sends no <code>announcedOn</code>, so the
            new row is observed (we only know the day we saw it), and a correction sets{" "}
            <code>retracted_at</code> and <code>replaces_version_id</code>.
          </p>
          <p>
            The evidence row (<code>price_version_evidence</code>) stores the observation item id, the
            Wayback link lives on the snapshot as <code>archive_url</code> and can be blank, and a card
            signed <code>system:same-price</code> cannot publish. <code>componentsForConfirm()</code>{" "}
            keeps the Google segment (the dated slice of that schedule) that includes the UTC review
            day (the calendar day of the click, on the shared clock) and drops a later segment.
          </p>
          <p className="doc-see">
            <Link href="/docs/a-price-period">A price period</Link>
          </p>
        </section>

        <section id="only-price-writer">
          <h2>9. The only price writer</h2>
          <p>
            <code>publishPriceVersion()</code> in <code>src/server/db/publish-price-version.ts</code>{" "}
            locks the review item, then the offering, so two publishes cannot both open a row.
          </p>
          <p>
            <code>findForbiddenPriceWrites()</code> returns each forbidden write it finds.{" "}
            <code>assertNoForbiddenPriceWrites()</code> throws, and the test fails CI (the checks that
            run on a change) when another file inserts, updates, or deletes the price tables.
          </p>
          <p>
            <code>linkExistingPriceEvidence()</code> in that same file may insert a{" "}
            <code>price_version_evidence</code> row and does not insert price rows.
          </p>
          <p className="doc-see">
            <Link href="/docs/the-only-price-writer">The only price writer</Link>
          </p>
        </section>

        <section id="witnesses">
          <h2>10. Witnesses</h2>
          <p>
            LiteLLM and OpenRouter never publish a price. <code>readWitnessList()</code> stores the
            read.
          </p>
          <p>
            The first good read is the baseline (the copy later reads are compared with). There is no
            earlier name list, so it files no new names. A later new name is a card where Approve
            creates the model, one <code>official-api</code> offering, and the alias (another name for
            that model), with no price.
          </p>
          <p>
            A disagreement writes warning rows (<code>verification_flags</code>) and one queued job per
            lab (<code>fetch_triggers</code>). <code>runPendingTriggers()</code> calls{" "}
            <code>verifyOfficialSource()</code> and does not publish.
          </p>
          <p className="doc-see">
            <Link href="/docs/witnesses">Witnesses</Link>
          </p>
        </section>

        <section id="untracked-model">
          <h2>11. A model we did not track</h2>
          <p>
            On an official card, <code>publishNewOfficialModel()</code> creates the model, the{" "}
            <code>official-api</code> offering, the price through <code>publishPriceVersion()</code>,
            and one confirmed <code>observation_items</code> row, in that same transaction.
          </p>
          <p>
            On a witness card, <code>approveWitnessModel()</code> writes the model, one{" "}
            <code>official-api</code> offering, and an <code>aggregator_slug</code> alias, and it
            writes no price.
          </p>
          <p>Reject does not bring that name back, and a refusal leaves no model.</p>
          <p className="doc-see">
            <Link href="/docs/untracked-model">A model we did not track</Link>
          </p>
        </section>

        <section id="suggest-a-lab">
          <h2>12. Suggest a lab</h2>
          <p>
            A signed-in person calls <code>suggestLab()</code>, which inserts one <code>requests</code>{" "}
            row. <code>kind</code> is <code>lab</code>, <code>lab_name</code> is the typed name,{" "}
            <code>lab_name_key</code> is that name trimmed and lowercased, and <code>status</code>{" "}
            starts as <code>pending</code>.
          </p>
          <p>
            Accept or decline is <code>decideLabRequest()</code>. A blank note makes{" "}
            <code>checkedReviewNote()</code> throw <code>LabRequestRefusal</code> (a refusal the form
            can show), so the reason is saved in <code>review_note</code> with <code>reviewed_by</code>{" "}
            and <code>reviewed_at</code>.
          </p>
          <p>
            Accept sets <code>status</code> to <code>accepted</code> and does not insert a lab, a
            source, or a schedule. Decline sets <code>status</code> to <code>declined</code>. A lab we
            already track, or a second pending row with the same <code>lab_name_key</code>, throws the
            same refusal and inserts nothing.
          </p>
          <p className="doc-see">
            <Link href="/docs/suggest-a-lab">Suggest a lab</Link>
          </p>
        </section>

        <section id="tables">
          <h2>13. Tables, in three pictures</h2>
          <p>
            Three pictures cover the tables: the catalog (<code>labs</code>, <code>models</code>,{" "}
            <code>model_aliases</code>, <code>offerings</code>, <code>price_versions</code>,{" "}
            <code>price_components</code>, <code>price_version_evidence</code>), the evidence (
            <code>sources</code>, <code>observations</code>, <code>observation_items</code>,{" "}
            <code>fetch_log</code>), and the signals (<code>witness_reads</code>,{" "}
            <code>verification_flags</code>, <code>candidate_models</code>, <code>model_signals</code>,{" "}
            <code>fetch_triggers</code>, <code>requests</code>).
          </p>
          <p>
            Column-level detail stays in the table notes (
            <a href="https://github.com/theidlebranch/priceTrail/blob/master/docs/price-tables.md">
              docs/price-tables.md
            </a>
            ).
          </p>
          <p>
            The <code>requests</code> table has no foreign key (a column that must match a row in
            another table).
          </p>
          <ul>
            <li>
              <Link href="/docs/tables-catalog">Catalog tables</Link>
            </li>
            <li>
              <Link href="/docs/tables-evidence">Evidence tables</Link>
            </li>
            <li>
              <Link href="/docs/tables-signals">Signal tables</Link>
            </li>
          </ul>
        </section>

        <section id="when-a-number-looks-wrong">
          <h2>14. When a number looks wrong</h2>
          <p>
            A failed download or a bad parse leaves only <code>fetch_log</code>. A price waiting for
            review has <code>observation_items.review_status</code> set to <code>flagged</code>.
          </p>
          <p>
            <code>findModelDetail()</code> reads the published number from <code>price_versions</code>{" "}
            and <code>price_components</code>. It does not select <code>observations.raw_content</code>
            , so the public page never loads the saved page text or the unverified amount.
          </p>
          <p>
            Public pages keep the last published price. The banner says &quot;A possible change is
            under review.&quot;
          </p>
          <p className="doc-see">
            <Link href="/docs/when-a-number-looks-wrong">When a number looks wrong</Link>
          </p>
        </section>

        <section id="not-built-yet">
          <h2>Not built yet</h2>
          <p>These parts are not in the code yet.</p>
          <ul>
            <li>the cell/grounding check (does this number sit in the matching row and column)</li>
            <li>the 10× jump (a price that suddenly grows by ten times)</li>
            <li>changelog feeds</li>
            <li>deprecation (a lab retiring a model)</li>
            <li>webhooks (a lab calling us when a price changes)</li>
            <li>wrong-price reports</li>
            <li>Wayback backfill (saving older copies we missed)</li>
            <li>personal notifications</li>
          </ul>
          <p>
            These pages are in the app but empty: <code>/alerts</code>,{" "}
            <code>/receipts</code>, <code>/account</code>, and <code>/review/reports</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
