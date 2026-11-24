export function APersonDecidesDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"State machine · How PriceTrail works"}</p>
      <h1>{"A person decides"}</h1>
      <p className="doc-sub">{"decideReviewItem() stamps review_status confirmed, then calls publishPriceVersion() in the same transaction when the price is new. sameConfirmPrice() stamps confirmed and leaves the open row open. A blank note or a non-official source throws before any stamp."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="07-a-person-decides-title 07-a-person-decides-desc">
          <title id="07-a-person-decides-title">
            {"A person decides"}
          </title>
          <desc id="07-a-person-decides-desc">
            {"decideReviewItem() rejects with no price row, confirms a sameConfirmPrice() without calling the writer, or stamps confirmed and calls publishPriceVersion() in one transaction, and a throw leaves review_status flagged."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="46" y1="328" x2="64" y2="328" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="224" y1="260" x2="224" y2="164" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 320 260 V 196 Q 320 188 328 188 H 962 Q 970 188 970 180 V 164" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="384" y1="328" x2="720" y2="328" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="224" y1="396" x2="224" y2="468" strokeWidth="1.2" strokeDasharray="5,4" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="168" y="206" width="48" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="192" y="215" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"REJECT"}
          </text>
          <rect className="dd-paper" x="605" y="168" width="80" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="645" y="177" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SAME PRICE"}
          </text>
          <rect className="dd-paper" x="516" y="308" width="72" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="552" y="317" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"NEW PRICE"}
          </text>
          <rect className="dd-paper" x="232" y="426" width="56" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="260" y="435" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"THROWS"}
          </text>
          <circle className="dd-ink" cx="40" cy="328" r="6" />
          <rect className="dd-slate dd-stroke-slate" x="64" y="260" width="320" height="136" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="224" y="292" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Flagged"}
          </text>
          <text className="dd-ink dd-mono" x="224" y="314" fontSize="9" textAnchor="middle">
            {"review_status = flagged"}
          </text>
          <text className="dd-ink dd-mono" x="224" y="332" fontSize="9" textAnchor="middle">
            {"decideReviewItem()"}
          </text>
          <text className="dd-ink dd-mono" x="224" y="350" fontSize="9" textAnchor="middle">
            {"observation_items FOR UPDATE"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="64" y="36" width="320" height="128" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="224" y="68" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Rejected"}
          </text>
          <text className="dd-ink dd-mono" x="224" y="90" fontSize="9" textAnchor="middle">
            {"review_status = rejected"}
          </text>
          <text className="dd-ink dd-mono" x="224" y="108" fontSize="9" textAnchor="middle">
            {"stamp(); writes no price row"}
          </text>
          <text className="dd-ink dd-mono" x="224" y="126" fontSize="9" textAnchor="middle">
            {"price_versions stays untouched"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="720" y="36" width="500" height="128" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="970" y="68" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Same price"}
          </text>
          <text className="dd-ink dd-mono" x="970" y="90" fontSize="9" textAnchor="middle">
            {"stamp() sets review_status confirmed"}
          </text>
          <text className="dd-ink dd-mono" x="970" y="108" fontSize="9" textAnchor="middle">
            {"sameConfirmPrice(); writer not called"}
          </text>
          <text className="dd-ink dd-mono" x="970" y="126" fontSize="9" textAnchor="middle">
            {"the open row stays open"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="720" y="260" width="500" height="136" rx="8" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="970" y="292" fontSize="12" fontWeight="600" textAnchor="middle">
            {"publishPriceVersion()"}
          </text>
          <text className="dd-ink dd-mono" x="970" y="314" fontSize="9" textAnchor="middle">
            {"stamp() confirmed in this transaction"}
          </text>
          <text className="dd-ink dd-mono" x="970" y="332" fontSize="9" textAnchor="middle">
            {"first price, or a price that changed"}
          </text>
          <text className="dd-ink dd-mono" x="970" y="350" fontSize="9" textAnchor="middle">
            {"a throw rolls the confirmed stamp back"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="48" y="468" width="456" height="148" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="276" y="496" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Stays flagged"}
          </text>
          <text className="dd-ink dd-mono" x="276" y="518" fontSize="9" textAnchor="middle">
            {"both: blank note, sources.type not official"}
          </text>
          <text className="dd-ink dd-mono" x="276" y="536" fontSize="9" textAnchor="middle">
            {"both: not flagged, grounding_result set"}
          </text>
          <text className="dd-ink dd-mono" x="276" y="554" fontSize="9" textAnchor="middle">
            {"confirm: non-official row, non-price snapshot"}
          </text>
          <text className="dd-ink dd-mono" x="276" y="572" fontSize="9" textAnchor="middle">
            {"confirm: earlier flagged item, schedule gap"}
          </text>
          <text className="dd-ink dd-mono" x="276" y="590" fontSize="9" textAnchor="middle">
            {"confirm: >1 open row, no matching snapshot"}
          </text>
          <line className="dd-stroke-silver" x1="48" y1="648" x2="1232" y2="648" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="48" y="672" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <circle className="dd-ink" cx="140" cy="692" r="6" />
          <text className="dd-muted dd-sans" x="156" y="696" fontSize="8.5">
            {"Start"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="220" y="686" width="28" height="12" rx="4" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="256" y="696" fontSize="8.5">
            {"Waiting or still flagged"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="430" y="686" width="28" height="12" rx="4" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="466" y="696" fontSize="8.5">
            {"Rejected"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="560" y="686" width="28" height="12" rx="4" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="596" y="696" fontSize="8.5">
            {"Same price, no writer"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="760" y="686" width="28" height="12" rx="4" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="796" y="696" fontSize="8.5">
            {"Calls publishPriceVersion()"}
          </text>
          <line className="dd-stroke-ink" x1="1020" y1="692" x2="1056" y2="692" strokeWidth="1.2" strokeDasharray="5,4" />
          <text className="dd-muted dd-sans" x="1064" y="696" fontSize="8.5">
            {"Throw, item stays flagged"}
          </text>
        </svg>
      </div>
    </>
  );
}
