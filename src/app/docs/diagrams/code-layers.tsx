export function CodeLayersDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Layer stack · How PriceTrail works"}</p>
      <h1>{"Three folders, one price write"}</h1>
      <p className="doc-sub">{"proxy() runs before the page and can call all three folders. Pages call the server and the core. Only publishPriceVersion() inserts a price row."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="01-code-layers-title 01-code-layers-desc">
          <title id="01-code-layers-title">
            {"Three folders, one price write"}
          </title>
          <desc id="01-code-layers-desc">
            {"src/proxy.ts calls app, server, and core. src/app calls src/server and src/core. src/server calls src/core. Only publishPriceVersion() in src/server/db/publish-price-version.ts writes price rows. src/core does not import the database or fetch."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" x="0" y="0" width="1280" height="720" />
          <text className="dd-muted dd-mono" x="88" y="108" fontSize="8" textAnchor="middle" letterSpacing="0.14em">
            {"CALLS"}
          </text>
          <line className="dd-stroke-ink" x1="88" y1="124" x2="88" y2="392" strokeWidth="1" />
          <polygon className="dd-ink" points="80,392 96,392 88,404" />
          <rect className="dd-link dd-stroke-link" x="160" y="120" width="1040" height="72" strokeWidth="1.25" />
          <rect className="dd-sage dd-stroke-ink" x="160" y="192" width="1040" height="72" strokeWidth="1.25" />
          <rect className="dd-link dd-stroke-link" x="160" y="264" width="1040" height="72" strokeWidth="1.25" />
          <rect className="dd-rust dd-stroke-rust" x="160" y="336" width="1040" height="72" strokeWidth="1.25" />
          <text className="dd-ink dd-mono" x="180" y="156" fontSize="8" letterSpacing="0.14em">
            {"L4"}
          </text>
          <text className="dd-ink dd-sans" x="248" y="158" fontSize="16" fontWeight="600">
            {"src/proxy.ts"}
          </text>
          <text className="dd-ink dd-mono" x="248" y="178" fontSize="9">
            {"proxy() before the page"}
          </text>
          <text className="dd-ink dd-mono" x="1176" y="158" fontSize="9" textAnchor="end">
            {"calls @/app, @/server, @/core"}
          </text>
          <text className="dd-ink dd-mono" x="180" y="228" fontSize="8" letterSpacing="0.14em">
            {"L3"}
          </text>
          <text className="dd-ink dd-sans" x="248" y="230" fontSize="16" fontWeight="600">
            {"src/app"}
          </text>
          <text className="dd-ink dd-mono" x="248" y="250" fontSize="9">
            {"page.tsx · labs/page.tsx · api/verify/[lab]/route.ts"}
          </text>
          <text className="dd-ink dd-mono" x="1176" y="230" fontSize="9" textAnchor="end">
            {"also imports @/core"}
          </text>
          <text className="dd-ink dd-mono" x="180" y="300" fontSize="8" letterSpacing="0.14em">
            {"L2"}
          </text>
          <text className="dd-ink dd-sans" x="248" y="302" fontSize="16" fontWeight="600">
            {"src/server"}
          </text>
          <text className="dd-ink dd-mono" x="248" y="322" fontSize="9">
            {"decide-review-item.ts calls the writer"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="728" y="276" width="448" height="48" rx="6" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="952" y="296" fontSize="12" fontWeight="600" textAnchor="middle">
            {"publishPriceVersion()"}
          </text>
          <text className="dd-ink dd-mono" x="952" y="312" fontSize="9" textAnchor="middle">
            {"src/server/db/publish-price-version.ts"}
          </text>
          <text className="dd-ink dd-mono" x="180" y="372" fontSize="8" letterSpacing="0.14em">
            {"L1"}
          </text>
          <text className="dd-ink dd-sans" x="248" y="374" fontSize="16" fontWeight="600">
            {"src/core"}
          </text>
          <text className="dd-ink dd-mono" x="248" y="394" fontSize="9">
            {"review-access.ts · header-viewer.ts · pricing/litellm.ts"}
          </text>
          <text className="dd-ink dd-mono" x="1176" y="374" fontSize="9" textAnchor="end">
            {"no database import, no fetch"}
          </text>
          <text className="dd-muted dd-sans" x="160" y="456" fontSize="12">
            {"model-detail-view.ts imports @/server and @/core. read-litellm-signal.ts imports parseLiteLLM."}
          </text>
          <text className="dd-muted dd-sans" x="160" y="480" fontSize="12">
            {"src/core does not import the database or fetch. The tangerine box is the only price-row insert."}
          </text>
          <line className="dd-stroke-ink" x1="160" y1="520" x2="1200" y2="520" strokeWidth="0.6" strokeOpacity="0.2" />
          <text className="dd-muted dd-mono" x="160" y="548" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="160" y="564" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="182" y="573" fontSize="9">
            {"Next pages"}
          </text>
          <rect className="dd-link dd-stroke-link" x="280" y="564" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="302" y="573" fontSize="9">
            {"Server code"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="410" y="564" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="432" y="573" fontSize="9">
            {"Pure core"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="520" y="564" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="542" y="573" fontSize="9">
            {"Price write"}
          </text>
        </svg>
      </div>
    </>
  );
}
