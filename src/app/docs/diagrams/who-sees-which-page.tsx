export function WhoSeesWhichPageDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Architecture · How PriceTrail works"}</p>
      <h1>{"Who can open which page"}</h1>
      <p className="doc-sub">{"src/proxy.ts runs before the page. A signed-in visit to / goes to /following. The proxy does not match /following itself. /review stays shut unless the account is on the allowlist."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="03-who-sees-which-page-title 03-who-sees-which-page-desc">
          <title id="03-who-sees-which-page-title">
            {"Who can open which page"}
          </title>
          <desc id="03-who-sees-which-page-desc">
            {"proxy() checks /, a model URL, and /review. A guest stays on page.tsx. visitorHomePath() sends a signed-in visit to /following, which the matcher does not block. Missing AUTH_SECRET is a 403 and does not load auth.ts. A signed-out review visit goes to /review/sign-in. reviewDecision opens /review only for REVIEWER_ALLOWLIST."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" x="0" y="0" width="1280" height="720" />
          <rect className="dd-slate dd-stroke-slate" x="40" y="244" width="384" height="340" rx="8" strokeWidth="0.8" strokeDasharray="4,4" />
          <rect className="dd-slate dd-stroke-slate" x="448" y="244" width="384" height="340" rx="8" strokeWidth="0.8" strokeDasharray="4,4" />
          <rect className="dd-slate dd-stroke-slate" x="856" y="244" width="384" height="388" rx="8" strokeWidth="0.8" strokeDasharray="4,4" />
          <path className="dd-stroke-ink" d="M 416,92 H 240 Q 232,92 232,100 V 276" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="640" y1="156" x2="640" y2="276" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 864,92 H 1040 Q 1048,92 1048,100 V 276" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="52" y="248" width="64" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="84" y="257" fontSize="8" textAnchor="middle" letterSpacing="0.14em">
            {"ANYONE"}
          </text>
          <rect className="dd-paper" x="460" y="248" width="80" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="500" y="257" fontSize="8" textAnchor="middle" letterSpacing="0.14em">
            {"SIGNED IN"}
          </text>
          <rect className="dd-paper" x="868" y="248" width="80" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="908" y="257" fontSize="8" textAnchor="middle" letterSpacing="0.14em">
            {"REVIEW"}
          </text>
          <rect className="dd-paper" x="242" y="176" width="96" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="290" y="185" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"GUEST STAYS"}
          </text>
          <rect className="dd-paper" x="650" y="196" width="100" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="700" y="205" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"TO FOLLOWING"}
          </text>
          <rect className="dd-paper" x="948" y="176" width="92" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="994" y="185" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"REVIEW PATH"}
          </text>
          <rect className="dd-link dd-stroke-link" x="416" y="28" width="448" height="128" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-soft" x="428" y="36" width="40" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="448" y="45" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"GATE"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="72" fontSize="12" fontWeight="600" textAnchor="middle">
            {"src/proxy.ts"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="92" fontSize="9" textAnchor="middle">
            {"proxy() · calls app, server, and core"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="110" fontSize="9" textAnchor="middle">
            {"matcher: / · /models/:labSlug/:modelSlug"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="128" fontSize="9" textAnchor="middle">
            {"/review · /review/:path* · not /following"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="56" y="276" width="352" height="120" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-ink" x="68" y="284" width="40" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="88" y="293" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"PAGE"}
          </text>
          <text className="dd-ink dd-sans" x="232" y="328" fontSize="12" fontWeight="600" textAnchor="middle">
            {"src/app/page.tsx"}
          </text>
          <text className="dd-ink dd-mono" x="232" y="348" fontSize="9" textAnchor="middle">
            {"guest, or AUTH_SECRET missing"}
          </text>
          <text className="dd-ink dd-mono" x="232" y="366" fontSize="9" textAnchor="middle">
            {"signedInHomeResponse() stays"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="56" y="412" width="352" height="148" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-ink" x="68" y="420" width="40" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="88" y="429" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"PAGE"}
          </text>
          <text className="dd-ink dd-sans" x="232" y="464" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Open pages"}
          </text>
          <text className="dd-ink dd-mono" x="232" y="486" fontSize="9" textAnchor="middle">
            {"/models · /labs · /sign-in · /receipts"}
          </text>
          <text className="dd-ink dd-mono" x="232" y="504" fontSize="9" textAnchor="middle">
            {"guestPageLinks also links /receipts"}
          </text>
          <text className="dd-ink dd-mono" x="232" y="522" fontSize="9" textAnchor="middle">
            {"unknown model: hasTrackedModel → 404"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="464" y="276" width="352" height="128" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-ink" x="476" y="284" width="40" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="496" y="293" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"PAGE"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="328" fontSize="12" fontWeight="600" textAnchor="middle">
            {"/following"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="350" fontSize="9" textAnchor="middle">
            {"visitorHomePath() redirect from /"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="368" fontSize="9" textAnchor="middle">
            {"PlaceholderPage · matcher skips it"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="464" y="420" width="352" height="140" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-ink" x="476" y="428" width="40" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="496" y="437" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"PAGE"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="472" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Suggest form on /labs"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="494" fontSize="9" textAnchor="middle">
            {"LabList · suggestLabAction"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="512" fontSize="9" textAnchor="middle">
            {"only when signed in"}
          </text>
          <text className="dd-ink dd-mono" x="640" y="530" fontSize="9" textAnchor="middle">
            {"empty: /alerts /receipts /account"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="872" y="276" width="352" height="104" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-ink" x="884" y="284" width="36" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="902" y="293" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"403"}
          </text>
          <text className="dd-ink dd-sans" x="1048" y="324" fontSize="12" fontWeight="600" textAnchor="middle">
            {"reviewHttpResult"}
          </text>
          <text className="dd-ink dd-mono" x="1048" y="344" fontSize="9" textAnchor="middle">
            {"no AUTH_SECRET: auth.ts not loaded"}
          </text>
          <text className="dd-ink dd-mono" x="1048" y="360" fontSize="9" textAnchor="middle">
            {"or not on REVIEWER_ALLOWLIST"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="872" y="396" width="352" height="96" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-muted" x="884" y="404" width="44" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="906" y="413" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"WAIT"}
          </text>
          <text className="dd-ink dd-sans" x="1048" y="440" fontSize="12" fontWeight="600" textAnchor="middle">
            {"/review/sign-in"}
          </text>
          <text className="dd-ink dd-mono" x="1048" y="458" fontSize="9" textAnchor="middle">
            {"secret set, session is null"}
          </text>
          <text className="dd-ink dd-mono" x="1048" y="474" fontSize="9" textAnchor="middle">
            {"protectReview() redirects"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="872" y="508" width="352" height="104" rx="6" strokeWidth="1.25" />
          <rect className="dd-stroke-ink" x="884" y="516" width="40" height="12" rx="2" fill="none" strokeWidth="0.8" />
          <text className="dd-ink dd-mono" x="904" y="525" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"PAGE"}
          </text>
          <text className="dd-ink dd-sans" x="1048" y="556" fontSize="12" fontWeight="600" textAnchor="middle">
            {"/review pages"}
          </text>
          <text className="dd-ink dd-mono" x="1048" y="576" fontSize="9" textAnchor="middle">
            {"reviewDecision · allowlist"}
          </text>
          <text className="dd-ink dd-mono" x="1048" y="592" fontSize="9" textAnchor="middle">
            {"/review/reports is empty"}
          </text>
          <line className="dd-stroke-ink" x1="40" y1="652" x2="1240" y2="652" strokeWidth="0.6" strokeOpacity="0.2" />
          <text className="dd-muted dd-mono" x="40" y="672" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <rect className="dd-link dd-stroke-link" x="40" y="684" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="62" y="693" fontSize="9">
            {"Runs before the page"}
          </text>
          <rect className="dd-sage dd-stroke-ink" x="230" y="684" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="252" y="693" fontSize="9">
            {"Next page"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="350" y="684" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="372" y="693" fontSize="9">
            {"403"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="420" y="684" width="14" height="10" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="442" y="693" fontSize="9">
            {"Waiting for sign-in"}
          </text>
          <line className="dd-stroke-ink" x1="600" y1="689" x2="632" y2="689" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <text className="dd-muted dd-sans" x="640" y="693" fontSize="9">
            {"Proxy decides"}
          </text>
        </svg>
      </div>
    </>
  );
}
