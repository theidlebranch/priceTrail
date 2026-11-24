export function TheOnlyPriceWriterDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Flowchart · How PriceTrail works"}</p>
      <h1>{"The only price writer"}</h1>
      <p className="doc-sub">{"publishPriceVersion() locks the observation item, refuses system:same-price, then locks the offering and inserts the rows. findForbiddenPriceWrites() returns hits. assertNoForbiddenPriceWrites() throws, and CI runs pnpm test."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="09-the-only-price-writer-title 09-the-only-price-writer-desc">
          <title id="09-the-only-price-writer-title">
            {"The only price writer"}
          </title>
          <desc id="09-the-only-price-writer-desc">
            {"publishPriceVersion() locks the observation item, refuses system:same-price, locks the offering, then inserts price rows; findForbiddenPriceWrites() returns hits and assertNoForbiddenPriceWrites() fails pnpm test."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="280" y1="96" x2="280" y2="128" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="280" y1="240" x2="280" y2="276" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="280" y1="372" x2="280" y2="408" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="280" y1="536" x2="280" y2="568" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="920" y1="192" x2="920" y2="236" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="1008" y1="292" x2="1088" y2="292" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="920" y1="348" x2="920" y2="400" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="288" y="250" width="56" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="316" y="259" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"IF OK"}
          </text>
          <rect className="dd-paper" x="288" y="382" width="52" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="314" y="391" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"WRITE"}
          </text>
          <rect className="dd-paper" x="1024" y="272" width="40" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="1044" y="281" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"HITS"}
          </text>
          <rect className="dd-paper" x="928" y="366" width="44" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="950" y="375" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"NONE"}
          </text>
          <text className="dd-muted dd-mono" x="100" y="18" fontSize="8" letterSpacing="0.14em">
            {"THE WRITER"}
          </text>
          <text className="dd-muted dd-mono" x="720" y="18" fontSize="8" letterSpacing="0.14em">
            {"THE CI CHECK"}
          </text>
          <rect className="dd-link dd-stroke-link" x="150" y="32" width="260" height="64" rx="20" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="280" y="56" fontSize="12" fontWeight="600" textAnchor="middle">
            {"publishPriceVersion()"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="74" fontSize="9" textAnchor="middle">
            {"locks, then inserts rows"}
          </text>
          <rect className="dd-link dd-stroke-link" x="100" y="128" width="360" height="112" rx="6" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="280" y="156" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Lock the item"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="178" fontSize="9" textAnchor="middle">
            {"observation_items FOR UPDATE"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="196" fontSize="9" textAnchor="middle">
            {"refuses system:same-price"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="214" fontSize="9" textAnchor="middle">
            {"review_status must be ok or confirmed"}
          </text>
          <rect className="dd-link dd-stroke-link" x="100" y="276" width="360" height="96" rx="6" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="280" y="308" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Lock the offering"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="330" fontSize="9" textAnchor="middle">
            {"offerings FOR UPDATE, second"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="348" fontSize="9" textAnchor="middle">
            {"then findOpenVersions()"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="100" y="408" width="360" height="128" rx="6" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="280" y="436" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Insert the rows"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="458" fontSize="9" textAnchor="middle">
            {"insert price_versions, price_components"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="476" fontSize="9" textAnchor="middle">
            {"price_version_evidence.observation_item_id"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="494" fontSize="9" textAnchor="middle">
            {"linkExistingPriceEvidence(): evidence only"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="512" fontSize="9" textAnchor="middle">
            {"not price_versions or price_components"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="150" y="568" width="260" height="56" rx="20" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="280" y="590" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Rows saved"}
          </text>
          <text className="dd-ink dd-mono" x="280" y="606" fontSize="9" textAnchor="middle">
            {"commit, or a throw rolls back"}
          </text>
          <rect className="dd-link dd-stroke-link" x="720" y="32" width="400" height="160" rx="6" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="920" y="58" fontSize="12" fontWeight="600" textAnchor="middle">
            {"findForbiddenPriceWrites()"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="80" fontSize="9" textAnchor="middle">
            {"returns hits; does not throw"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="98" fontSize="9" textAnchor="middle">
            {"scans src, scripts, and drizzle"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="116" fontSize="9" textAnchor="middle">
            {"skips tests and publish-price-version.ts"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="134" fontSize="9" textAnchor="middle">
            {"assertNoForbiddenPriceWrites() throws"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="152" fontSize="9" textAnchor="middle">
            {"the test calls it; CI runs pnpm test"}
          </text>
          <polygon className="dd-dusty dd-stroke-ink" points="920,236 1008,292 920,348 832,292" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="920" y="296" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Any hit?"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="1088" y="260" width="168" height="64" rx="20" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="1172" y="284" fontSize="12" fontWeight="600" textAnchor="middle">
            {"CI fails"}
          </text>
          <text className="dd-ink dd-mono" x="1172" y="302" fontSize="9" textAnchor="middle">
            {"assert throws"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="820" y="400" width="200" height="64" rx="20" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="920" y="424" fontSize="12" fontWeight="600" textAnchor="middle">
            {"CI passes"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="442" fontSize="9" textAnchor="middle">
            {"no hits"}
          </text>
          <line className="dd-stroke-silver" x1="48" y1="648" x2="1232" y2="648" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="48" y="672" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <rect className="dd-link dd-stroke-link" x="140" y="686" width="36" height="12" rx="6" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="184" y="696" fontSize="8.5">
            {"Server step"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="290" y="686" width="28" height="12" rx="2" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="326" y="696" fontSize="8.5">
            {"The only write"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="450" y="686" width="28" height="12" rx="2" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="486" y="696" fontSize="8.5">
            {"Rows saved"}
          </text>
          <polygon className="dd-dusty dd-stroke-ink" points="600,692 612,686 624,692 612,698" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="634" y="696" fontSize="8.5">
            {"Decision"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="720" y="686" width="28" height="12" rx="4" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="756" y="696" fontSize="8.5">
            {"CI fails"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="840" y="686" width="28" height="12" rx="4" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="876" y="696" fontSize="8.5">
            {"CI passes"}
          </text>
        </svg>
      </div>
    </>
  );
}
