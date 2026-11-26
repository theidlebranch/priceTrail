export function AChangedPageDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Flowchart · How PriceTrail works"}</p>
      <h1>{"A changed page"}</h1>
      <p className="doc-sub">{"A new <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">contentHash</code> from <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">fingerprintParsedPrices()</code> stores <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">observations</code> and one <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">observation_items</code> row per tracked offering. Then <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">syncOfficialCandidates()</code>, then <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">archiveObservation()</code>. This path does not publish a price."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="06-a-changed-page-title 06-a-changed-page-desc">
          <title id="06-a-changed-page-title">
            {"A changed page"}
          </title>
          <desc id="06-a-changed-page-desc">
            {"After fingerprintParsedPrices finds a new contentHash, recordSourceCheck stores observations and one observation_items row per tracked offering. trackedPriceUnchanged stamps system:same-price and review_status confirmed when the open price matches, including 10 and 10.0, and opens no new period. Anything else stays review_status flagged, including a missing open price or a snapshot the check cannot read. A later-dated price is ignored. syncOfficialCandidates writes candidate_models for untracked slugs, a retirement note, and a model missing from two good visits, then archiveObservation asks Wayback. A missing tracked model does not get a price-review row. Neither stamp publishes a price."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="640" y1="80" x2="640" y2="104" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="640" y1="176" x2="640" y2="200" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 524 248 H 184 Q 176 248 176 256 V 356" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 756 248 H 1096 Q 1104 248 1104 256 V 356" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 176 432 V 456 H 640" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 1104 432 V 472 H 640" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="640" y1="456" x2="640" y2="496" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="640" y1="560" x2="640" y2="584" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="328" y="228" width="44" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="350" y="237" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"TRUE"}
          </text>
          <rect className="dd-paper" x="906" y="228" width="52" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="932" y="237" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"FALSE"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="500" y="24" width="280" height="56" rx="20" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="640" y="48" fontSize="12" fontWeight="600" textAnchor="middle">
            {"fingerprintParsedPrices"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="66" fontSize="9" textAnchor="middle">
            {"contentHash is new"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="460" y="104" width="360" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="640" y="136" fontSize="12" fontWeight="600" textAnchor="middle">
            {"recordSourceCheck"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="154" fontSize="9" textAnchor="middle">
            {"observations + observation_items"}
          </text>
          <polygon className="dd-rust dd-stroke-rust" points="640,200 756,248 640,296 524,248" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="640" y="244" fontSize="11" fontWeight="600" textAnchor="middle">
            {"trackedPriceUnchanged"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="262" fontSize="9" textAnchor="middle">
            {"amounts on that UTC day"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="36" y="356" width="280" height="76" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="176" y="384" fontSize="12" fontWeight="600" textAnchor="middle">
            {"system:same-price"}
          </text>
          <text className="dd-ink dd-mono" x="176" y="402" fontSize="9" textAnchor="middle">
            {"review_status confirmed"}
          </text>
          <text className="dd-ink dd-mono" x="176" y="418" fontSize="9" textAnchor="middle">
            {"no new period · 10 = 10.0"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="964" y="356" width="280" height="76" rx="6" strokeWidth="1.5" />
          <text className="dd-ink dd-mono" x="1104" y="384" fontSize="12" fontWeight="600" textAnchor="middle">
            {"flagged"}
          </text>
          <text className="dd-ink dd-mono" x="1104" y="402" fontSize="9" textAnchor="middle">
            {"no open price, or cannot read"}
          </text>
          <text className="dd-ink dd-mono" x="1104" y="418" fontSize="9" textAnchor="middle">
            {"later-dated price ignored"}
          </text>
          <circle className="dd-ink" cx="640" cy="472" r="4" />
          <rect className="dd-mustard dd-stroke-mustard" x="480" y="496" width="320" height="64" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="640" y="522" fontSize="12" fontWeight="600" textAnchor="middle">
            {"syncOfficialCandidates"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="540" fontSize="9" textAnchor="middle">
            {"candidate_models · untracked slugs"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="480" y="584" width="320" height="64" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="640" y="610" fontSize="12" fontWeight="600" textAnchor="middle">
            {"archiveObservation"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="628" fontSize="9" textAnchor="middle">
            {"capturePage · Wayback"}
          </text>
          <line className="dd-stroke-silver" x1="48" y1="668" x2="1232" y2="668" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="48" y="692" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="128" y="682" width="28" height="14" rx="3" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="164" y="693" fontSize="8.5">
            {"flagged, waiting"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="292" y="682" width="28" height="14" rx="3" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="328" y="693" fontSize="8.5">
            {"same price, no new period"}
          </text>
          <text className="dd-muted dd-sans" x="520" y="693" fontSize="8.5">
            {"A missing tracked model does not get a price-review row. Neither stamp publishes."}
          </text>
        </svg>
      </div>
    </>
  );
}
