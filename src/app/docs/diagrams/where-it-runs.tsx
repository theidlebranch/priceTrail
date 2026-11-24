export function WhereItRunsDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Deployment · How PriceTrail works"}</p>
      <h1>{"Where PriceTrail runs"}</h1>
      <p className="doc-sub">{"The Next.js app, the Auth.js cookie, and the vercel.json schedules run on Vercel. Price rows live in Neon. The top row is what Vercel calls."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="02-where-it-runs-title 02-where-it-runs-desc">
          <title id="02-where-it-runs-title">
            {"Where PriceTrail runs"}
          </title>
          <desc id="02-where-it-runs-desc">
            {"Vercel runs Next.js 16.4.6, src/proxy.ts, and vercel.json schedules. Neon stores price_versions and price_components. Vercel calls web.archive.org, Google and GitHub OAuth, the LiteLLM cost map on raw.githubusercontent.com, and openrouter.ai."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" x="0" y="0" width="1280" height="720" />
          <rect className="dd-slate dd-stroke-slate" x="48" y="16" width="1184" height="168" rx="8" strokeWidth="0.8" strokeDasharray="4,4" />
          <rect className="dd-slate dd-stroke-slate" x="48" y="216" width="1184" height="188" rx="8" strokeWidth="0.8" strokeDasharray="4,4" />
          <rect className="dd-slate dd-stroke-slate" x="444" y="432" width="392" height="160" rx="8" strokeWidth="0.8" strokeDasharray="4,4" />
          <line className="dd-stroke-ink" x1="208" y1="248" x2="208" y2="160" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="496" y1="248" x2="496" y2="160" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="784" y1="248" x2="784" y2="160" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="1072" y1="248" x2="1072" y2="160" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="640" y1="384" x2="640" y2="464" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="60" y="20" width="72" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="96" y="29" fontSize="8" textAnchor="middle" letterSpacing="0.14em">
            {"INTERNET"}
          </text>
          <rect className="dd-paper" x="60" y="220" width="64" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="92" y="229" fontSize="8" textAnchor="middle" letterSpacing="0.14em">
            {"VERCEL"}
          </text>
          <rect className="dd-paper" x="456" y="436" width="48" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="480" y="445" fontSize="8" textAnchor="middle" letterSpacing="0.14em">
            {"NEON"}
          </text>
          <rect className="dd-paper" x="216" y="194" width="76" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="254" y="203" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"HTTPS:443"}
          </text>
          <rect className="dd-paper" x="504" y="194" width="76" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="542" y="203" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"HTTPS:443"}
          </text>
          <rect className="dd-paper" x="792" y="194" width="76" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="830" y="203" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"HTTPS:443"}
          </text>
          <rect className="dd-paper" x="1080" y="194" width="76" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="1118" y="203" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"HTTPS:443"}
          </text>
          <rect className="dd-paper" x="648" y="408" width="72" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="684" y="417" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"TLS:5432"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="80" y="48" width="256" height="112" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-faint" x="92" y="56" width="64" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="124" y="65" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"ARCHIVE"}
          </text>
          <text className="dd-ink dd-sans" x="208" y="100" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Internet Archive"}
          </text>
          <text className="dd-ink dd-mono" x="208" y="120" fontSize="9" textAnchor="middle">
            {"web.archive.org"}
          </text>
          <text className="dd-ink dd-mono" x="208" y="136" fontSize="9" textAnchor="middle">
            {"permalinks and /save"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="368" y="48" width="256" height="112" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-faint" x="380" y="56" width="48" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="404" y="65" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"OAUTH"}
          </text>
          <text className="dd-ink dd-sans" x="496" y="100" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Google + GitHub"}
          </text>
          <text className="dd-ink dd-mono" x="496" y="120" fontSize="9" textAnchor="middle">
            {"auth.ts · Google() and GitHub()"}
          </text>
          <text className="dd-ink dd-mono" x="496" y="136" fontSize="9" textAnchor="middle">
            {"one jwt cookie on Vercel"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="656" y="48" width="256" height="112" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-faint" x="668" y="56" width="36" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="686" y="65" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"FILE"}
          </text>
          <text className="dd-ink dd-sans" x="784" y="96" fontSize="12" fontWeight="600" textAnchor="middle">
            {"LiteLLM"}
          </text>
          <text className="dd-ink dd-mono" x="784" y="116" fontSize="9" textAnchor="middle">
            {"raw.githubusercontent.com"}
          </text>
          <text className="dd-ink dd-mono" x="784" y="134" fontSize="9" textAnchor="middle">
            {"model_prices_and_context_window.json"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="944" y="48" width="256" height="112" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-faint" x="956" y="56" width="32" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="972" y="65" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"API"}
          </text>
          <text className="dd-ink dd-sans" x="1072" y="100" fontSize="12" fontWeight="600" textAnchor="middle">
            {"OpenRouter"}
          </text>
          <text className="dd-ink dd-mono" x="1072" y="120" fontSize="9" textAnchor="middle">
            {"openrouter.ai"}
          </text>
          <text className="dd-ink dd-mono" x="1072" y="136" fontSize="9" textAnchor="middle">
            {"/api/v1/models"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="80" y="248" width="1120" height="136" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-ink" x="92" y="256" width="64" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="124" y="265" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"MANAGED"}
          </text>
          <text className="dd-ink dd-sans" x="104" y="292" fontSize="12" fontWeight="600">
            {"Vercel"}
          </text>
          <text className="dd-ink dd-mono" x="104" y="310" fontSize="9">
            {"Next.js 16.4.6 · Node 24 · src/proxy.ts · POST /api/verify · /api/signals · /api/triggers/drain"}
          </text>
          <rect className="dd-link dd-stroke-link" x="104" y="324" width="220" height="24" rx="4" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="112" y="340" fontSize="12">
            {"next-auth"}
          </text>
          <text className="dd-ink dd-mono" x="316" y="340" fontSize="9" textAnchor="end">
            {"5.0.0-beta.32"}
          </text>
          <rect className="dd-link dd-stroke-link" x="336" y="324" width="360" height="24" rx="4" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="344" y="340" fontSize="12">
            {"vercel.json crons"}
          </text>
          <text className="dd-ink dd-mono" x="688" y="340" fontSize="9" textAnchor="end">
            {"*/6 * * *"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="708" y="324" width="468" height="24" rx="4" strokeWidth="1.25" />
          <text className="dd-ink dd-sans" x="716" y="340" fontSize="12">
            {"publishPriceVersion()"}
          </text>
          <text className="dd-ink dd-mono" x="1168" y="340" fontSize="9" textAnchor="end">
            {"only price writer"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="460" y="464" width="360" height="112" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-muted" x="472" y="472" width="64" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="504" y="481" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"MANAGED"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="516" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Neon Postgres"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="536" fontSize="9" textAnchor="middle">
            {"price_versions · price_components"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="552" fontSize="9" textAnchor="middle">
            {"rows from publishPriceVersion()"}
          </text>
          <line className="dd-stroke-ink" x1="48" y1="624" x2="1232" y2="624" strokeWidth="0.6" strokeOpacity="0.2" />
          <text className="dd-muted dd-mono" x="48" y="648" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="48" y="664" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="70" y="673" fontSize="9">
            {"Next.js app"}
          </text>
          <rect className="dd-link dd-stroke-link" x="180" y="664" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="202" y="673" fontSize="9">
            {"Server routes"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="320" y="664" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="342" y="673" fontSize="9">
            {"Price write"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="440" y="664" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="462" y="673" fontSize="9">
            {"Neon rows"}
          </text>
          <rect className="dd-rust dd-stroke-rust" x="560" y="664" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="582" y="673" fontSize="9">
            {"Outside service"}
          </text>
          <line className="dd-stroke-ink" x1="720" y1="669" x2="752" y2="669" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <text className="dd-muted dd-sans" x="760" y="673" fontSize="9">
            {"Call that leaves a zone"}
          </text>
        </svg>
      </div>
    </>
  );
}
