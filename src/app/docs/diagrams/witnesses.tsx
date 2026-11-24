export function WitnessesDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Data flow · How PriceTrail works"}</p>
      <h1>{"Witness sites never publish a price"}</h1>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="witnesses-title witnesses-desc">
          <title id="witnesses-title">
            {"Witness sites never publish a price"}
          </title>
          <desc id="witnesses-desc">
            {"readWitnessList compares LiteLLM and OpenRouter with open prices. The first ok witness_reads row is the baseline and newModels returns nothing. A later new slug becomes a pending candidate_models card. A disagreement, including on that first read, stores verification_flags and one fetch_triggers row per lab page, and a second witness skips that page while processed_at is blank. The drain calls verifyOfficialSource and does not publish."}
          </desc>
          <defs>
            <marker id="witnesses-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="436" y1="96" x2="500" y2="96" strokeWidth="1.2" markerEnd="url(#witnesses-arrow)" />
          <line className="dd-stroke-ink" x1="640" y1="140" x2="640" y2="280" strokeWidth="1.2" markerEnd="url(#witnesses-arrow)" />
          <path className="dd-stroke-ink" d="M 564 140 V 192 Q 564 200 556 200 H 304 Q 296 200 296 208 V 280" fill="none" strokeWidth="1.2" markerEnd="url(#witnesses-arrow)" />
          <path className="dd-stroke-ink" d="M 716 140 V 224 Q 716 232 724 232 H 976 Q 984 232 984 240 V 280" fill="none" strokeWidth="1.2" markerEnd="url(#witnesses-arrow)" />
          <line className="dd-stroke-ink" x1="984" y1="368" x2="984" y2="500" strokeWidth="1.2" markerEnd="url(#witnesses-arrow)" />
          <rect className="dd-paper" x="450" y="76" width="36" height="12" />
          <text className="dd-muted dd-mono" x="468" y="86" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"LIST"}
          </text>
          <rect className="dd-paper" x="648" y="248" width="64" height="12" />
          <text className="dd-muted dd-mono" x="680" y="258" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"NEW SLUG"}
          </text>
          <rect className="dd-paper" x="304" y="220" width="72" height="12" />
          <text className="dd-muted dd-mono" x="340" y="230" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"BASELINE"}
          </text>
          <rect className="dd-paper" x="900" y="248" width="76" height="12" />
          <text className="dd-muted dd-mono" x="938" y="258" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"CAN DIFFER"}
          </text>
          <rect className="dd-paper" x="912" y="420" width="64" height="12" />
          <text className="dd-muted dd-mono" x="944" y="430" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"NO PRICE"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="156" y="52" width="280" height="88" rx="6" strokeWidth="1" strokeDasharray="4,3" />
          <rect className="dd-rust dd-stroke-rust" x="168" y="62" width="36" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="186" y="72" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"SITE"}
          </text>
          <text className="dd-ink dd-sans" x="296" y="96" fontSize="12" fontWeight="600" textAnchor="middle">
            {"LiteLLM · OpenRouter"}
          </text>
          <text className="dd-muted dd-mono" x="296" y="114" fontSize="9" textAnchor="middle">
            {"sources.type aggregator"}
          </text>
          <text className="dd-muted dd-mono" x="296" y="128" fontSize="9" textAnchor="middle">
            {"litellm · openrouter"}
          </text>
          <rect className="dd-link dd-stroke-link" x="500" y="52" width="280" height="88" rx="6" strokeWidth="1" />
          <rect className="dd-link dd-stroke-link" x="512" y="62" width="36" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="530" y="72" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"READ"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="96" fontSize="12" fontWeight="600" textAnchor="middle">
            {"readWitnessList()"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="114" fontSize="9" textAnchor="middle">
            {"compareLiteLLMWitness()"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="128" fontSize="9" textAnchor="middle">
            {"open price_versions"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="156" y="280" width="280" height="88" rx="6" strokeWidth="1" />
          <rect className="dd-mustard dd-stroke-mustard" x="168" y="290" width="32" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="184" y="300" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"ROW"}
          </text>
          <text className="dd-ink dd-sans" x="296" y="324" fontSize="12" fontWeight="600" textAnchor="middle">
            {"witness_reads"}
          </text>
          <text className="dd-muted dd-mono" x="296" y="342" fontSize="9" textAnchor="middle">
            {"is_baseline · outcome ok"}
          </text>
          <text className="dd-muted dd-mono" x="296" y="356" fontSize="9" textAnchor="middle">
            {"newModels() returns []"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="500" y="280" width="280" height="88" rx="6" strokeWidth="1" />
          <rect className="dd-slate dd-stroke-slate" x="512" y="290" width="40" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="532" y="300" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"CARD"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="324" fontSize="12" fontWeight="600" textAnchor="middle">
            {"candidate_models"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="342" fontSize="9" textAnchor="middle">
            {"status pending_review"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="356" fontSize="9" textAnchor="middle">
            {"raw_name · raw_slug · no price"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="844" y="280" width="280" height="88" rx="6" strokeWidth="1" />
          <rect className="dd-mustard dd-stroke-mustard" x="856" y="290" width="40" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="876" y="300" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"FLAG"}
          </text>
          <text className="dd-ink dd-sans" x="984" y="324" fontSize="12" fontWeight="600" textAnchor="middle">
            {"verification_flags"}
          </text>
          <text className="dd-muted dd-mono" x="984" y="342" fontSize="9" textAnchor="middle">
            {"one fetch_triggers per lab"}
          </text>
          <text className="dd-muted dd-mono" x="984" y="356" fontSize="9" textAnchor="middle">
            {"skip if processed_at is null"}
          </text>
          <rect className="dd-link dd-stroke-link" x="844" y="500" width="280" height="88" rx="6" strokeWidth="1" />
          <rect className="dd-link dd-stroke-link" x="856" y="510" width="44" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="878" y="520" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"DRAIN"}
          </text>
          <text className="dd-ink dd-sans" x="984" y="544" fontSize="12" fontWeight="600" textAnchor="middle">
            {"runPendingTriggers()"}
          </text>
          <text className="dd-muted dd-mono" x="984" y="562" fontSize="9" textAnchor="middle">
            {"POST /api/triggers/drain"}
          </text>
          <text className="dd-muted dd-mono" x="984" y="576" fontSize="9" textAnchor="middle">
            {"verifyOfficialSource()"}
          </text>
          <line className="dd-stroke-ink" x1="80" y1="632" x2="1200" y2="632" strokeWidth="1" strokeOpacity="0.2" />
          <text className="dd-muted dd-mono" x="80" y="656" fontSize="8" letterSpacing="0.18em">
            {"LEGEND"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="160" y="646" width="18" height="12" rx="2" strokeWidth="1" strokeDasharray="4,3" />
          <text className="dd-muted dd-sans" x="186" y="656" fontSize="9">
            {"Witness site"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="290" y="646" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="316" y="656" fontSize="9">
            {"Table row"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="400" y="646" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="426" y="656" fontSize="9">
            {"Pending card"}
          </text>
          <rect className="dd-link dd-stroke-link" x="530" y="646" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="556" y="656" fontSize="9">
            {"Server step. The drain does not call publishPriceVersion()."}
          </text>
        </svg>
      </div>
    </>
  );
}
