export function OneOfficialVisitDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Flowchart · How PriceTrail works"}</p>
      <h1>{"One official visit"}</h1>
      <p className="doc-sub">{"<code style=\"font-family: var(--font-mono); font-size: 0.9em;\">verifyOfficialSource()</code> calls <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">source.fetchPage</code>, then <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">source.parse</code>, then <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">recordSourceCheck()</code>. That insert runs <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">checkParsedPrices()</code> and <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">fingerprintParsedPrices()</code>. Every stored ending writes <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">fetch_log</code>. None calls <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">publishPriceVersion()</code>."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="05-one-official-visit-title 05-one-official-visit-desc">
          <title id="05-one-official-visit-title">
            {"One official visit"}
          </title>
          <desc id="05-one-official-visit-desc">
            {"verifyOfficialSource downloads with source.fetchPage, parses with source.parse, then recordSourceCheck runs checkParsedPrices and fingerprintParsedPrices. Endings are fetch_error, parser_suspect, unchanged, and changed. parser_suspect covers a parse throw and a failed sanity check, and it does not store page text. A missing tracked model is stored with the page. All four endings write fetch_log. A throw before that insert writes no log row: missing sources row, unreadable amount, or fetchedAt earlier than the last observation. None publishes a price."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="184" y1="108" x2="184" y2="156" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="184" y1="228" x2="184" y2="276" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="184" y1="348" x2="184" y2="396" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="304" y1="72" x2="872" y2="72" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 304 192 H 832 Q 840 192 840 200 V 220 Q 840 228 848 228 H 872" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 304 312 H 816 Q 824 312 824 304 V 260 Q 824 252 816 252 H 872" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="304" y1="420" x2="872" y2="420" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 304 444 H 832 Q 840 444 840 452 V 548 Q 840 556 848 556 H 872" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="168" y="124" width="32" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="184" y="133" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"OK"}
          </text>
          <rect className="dd-paper" x="168" y="244" width="32" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="184" y="253" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"OK"}
          </text>
          <rect className="dd-paper" x="168" y="364" width="32" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="184" y="373" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"OK"}
          </text>
          <rect className="dd-paper" x="566" y="52" width="44" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="588" y="61" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"FAIL"}
          </text>
          <rect className="dd-paper" x="546" y="172" width="44" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="568" y="181" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"FAIL"}
          </text>
          <rect className="dd-paper" x="528" y="292" width="64" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="560" y="301" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SUSPECT"}
          </text>
          <rect className="dd-paper" x="566" y="400" width="44" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="588" y="409" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SAME"}
          </text>
          <rect className="dd-paper" x="796" y="492" width="36" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="814" y="501" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"NEW"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="64" y="36" width="240" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="184" y="68" fontSize="12" fontWeight="600" textAnchor="middle">
            {"source.fetchPage"}
          </text>
          <text className="dd-ink dd-mono" x="184" y="86" fontSize="9" textAnchor="middle">
            {"lab page over HTTP"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="64" y="156" width="240" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="184" y="188" fontSize="12" fontWeight="600" textAnchor="middle">
            {"source.parse"}
          </text>
          <text className="dd-ink dd-mono" x="184" y="206" fontSize="9" textAnchor="middle">
            {"rows, or a parse throw"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="64" y="276" width="240" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="184" y="308" fontSize="12" fontWeight="600" textAnchor="middle">
            {"checkParsedPrices"}
          </text>
          <text className="dd-ink dd-mono" x="184" y="326" fontSize="9" textAnchor="middle">
            {"suspect, or amount throws"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="64" y="396" width="240" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="184" y="428" fontSize="12" fontWeight="600" textAnchor="middle">
            {"fingerprintParsedPrices"}
          </text>
          <text className="dd-ink dd-mono" x="184" y="446" fontSize="9" textAnchor="middle">
            {"hash of rows + warnings"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="872" y="36" width="280" height="72" rx="20" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="1012" y="62" fontSize="12" fontWeight="600" textAnchor="middle">
            {"fetch_error"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="80" fontSize="9" textAnchor="middle">
            {"fetch_log · http_status empty"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="94" fontSize="9" textAnchor="middle">
            {"download never became rows"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="872" y="204" width="280" height="72" rx="20" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="1012" y="226" fontSize="12" fontWeight="600" textAnchor="middle">
            {"parser_suspect"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="244" fontSize="9" textAnchor="middle">
            {"parse throw, sanity fail, missing model"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="258" fontSize="9" textAnchor="middle">
            {"raw_content is not stored"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="872" y="396" width="280" height="72" rx="20" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="1012" y="418" fontSize="12" fontWeight="600" textAnchor="middle">
            {"unchanged"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="436" fontSize="9" textAnchor="middle">
            {"same contentHash"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="450" fontSize="9" textAnchor="middle">
            {"fetch_log · observation_id empty"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="872" y="516" width="280" height="80" rx="20" strokeWidth="1.5" />
          <text className="dd-ink dd-mono" x="1012" y="546" fontSize="12" fontWeight="600" textAnchor="middle">
            {"changed"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="564" fontSize="9" textAnchor="middle">
            {"observations row + fetch_log"}
          </text>
          <text className="dd-ink dd-mono" x="1012" y="578" fontSize="9" textAnchor="middle">
            {"does not publish a price"}
          </text>
          <line className="dd-stroke-silver" x1="48" y1="632" x2="1232" y2="632" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="48" y="656" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="128" y="646" width="28" height="14" rx="3" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="164" y="657" fontSize="8.5">
            {"Outside fetch"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="276" y="646" width="28" height="14" rx="3" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="312" y="657" fontSize="8.5">
            {"Core check"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="408" y="646" width="28" height="14" rx="7" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="444" y="657" fontSize="8.5">
            {"Failure ending"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="568" y="646" width="28" height="14" rx="7" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="604" y="657" fontSize="8.5">
            {"Same hash"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="692" y="646" width="28" height="14" rx="7" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="728" y="657" fontSize="8.5">
            {"Changed snapshot, still not a publish"}
          </text>
          <text className="dd-muted dd-mono" x="48" y="688" fontSize="9">
            {"Four endings insert fetch_log. No row if the sources row is missing, the amount cannot be read, or fetchedAt is earlier than the last observation."}
          </text>
        </svg>
      </div>
    </>
  );
}
