export function WhenANumberLooksWrongDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Flowchart"}</p>
      <h1>{"When a number looks wrong"}</h1>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="14-when-a-number-looks-wrong-title 14-when-a-number-looks-wrong-desc">
          <title id="14-when-a-number-looks-wrong-title">
            {"When a number looks wrong"}
          </title>
          <desc id="14-when-a-number-looks-wrong-desc">
            {"A failed download or bad parse writes only fetch_log, and observation_id stays null. Waiting review is observation_items.review_status = flagged. The public page keeps the last published price, reads price_versions and price_components, and says A possible change is under review. It does not select raw_content, parsed_data, or grounding_result. A published number is a price version with offering_id, then the observation item whose review_status is ok or confirmed, then observations.archive_url."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="440" y1="68" x2="440" y2="96" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="560" y1="140" x2="720" y2="140" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="440" y1="184" x2="440" y2="224" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="560" y1="268" x2="720" y2="268" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="440" y1="312" x2="440" y2="352" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="920" y1="304" x2="920" y2="328" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="440" y1="424" x2="440" y2="456" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="440" y1="520" x2="440" y2="548" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="622" y="120" width="36" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="640" y="129" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"YES"}
          </text>
          <rect className="dd-paper" x="448" y="196" width="28" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="462" y="205" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"NO"}
          </text>
          <rect className="dd-paper" x="622" y="248" width="36" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="640" y="257" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"YES"}
          </text>
          <rect className="dd-paper" x="448" y="324" width="28" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="462" y="333" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"NO"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="300" y="20" width="280" height="48" rx="20" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="440" y="48" fontSize="12" fontWeight="600" textAnchor="middle">
            {"A number looks wrong"}
          </text>
          <polygon className="dd-dusty dd-stroke-ink" points="440,96 560,140 440,184 320,140" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="440" y="134" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Failed download"}
          </text>
          <text className="dd-ink dd-sans" x="440" y="152" fontSize="12" fontWeight="600" textAnchor="middle">
            {"or bad parse?"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="720" y="108" width="380" height="64" rx="20" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="910" y="134" fontSize="12" fontWeight="600" textAnchor="middle">
            {"fetch_log"}
          </text>
          <text className="dd-ink dd-mono" x="910" y="152" fontSize="9" textAnchor="middle">
            {"observation_id is null"}
          </text>
          <polygon className="dd-dusty dd-stroke-ink" points="440,224 560,268 440,312 320,268" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="440" y="262" fontSize="12" fontWeight="600" textAnchor="middle">
            {"review_status"}
          </text>
          <text className="dd-ink dd-sans" x="440" y="280" fontSize="12" fontWeight="600" textAnchor="middle">
            {"still flagged?"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="720" y="232" width="400" height="72" rx="6" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="920" y="260" fontSize="12" fontWeight="600" textAnchor="middle">
            {"observation_items"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="280" fontSize="9" textAnchor="middle">
            {"review_status = flagged"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="720" y="328" width="400" height="108" rx="20" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="920" y="358" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Public page"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="378" fontSize="9" textAnchor="middle">
            {"reads price_versions, price_components"}
          </text>
          <text className="dd-ink dd-mono" x="920" y="396" fontSize="9" textAnchor="middle">
            {"skips raw_content, parsed_data, grounding_result"}
          </text>
          <text className="dd-ink dd-sans" x="920" y="416" fontSize="11" textAnchor="middle">
            {"A possible change is under review."}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="300" y="352" width="280" height="72" rx="6" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="440" y="380" fontSize="12" fontWeight="600" textAnchor="middle">
            {"price_versions"}
          </text>
          <text className="dd-ink dd-mono" x="440" y="400" fontSize="9" textAnchor="middle">
            {"offering_id"}
          </text>
          <rect className="dd-link dd-stroke-link" x="300" y="456" width="280" height="64" rx="6" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="440" y="482" fontSize="12" fontWeight="600" textAnchor="middle">
            {"observation_items"}
          </text>
          <text className="dd-ink dd-mono" x="440" y="500" fontSize="9" textAnchor="middle">
            {"review_status = ok or confirmed"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="300" y="548" width="280" height="64" rx="20" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="440" y="574" fontSize="12" fontWeight="600" textAnchor="middle">
            {"observations"}
          </text>
          <text className="dd-ink dd-mono" x="440" y="592" fontSize="9" textAnchor="middle">
            {"archive_url"}
          </text>
          <line className="dd-stroke-muted" x1="40" y1="648" x2="1240" y2="648" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="40" y="668" fontSize="8" letterSpacing="0.14em">
            {"LEGEND · SHAPE AND COLOR CARRY THE ROLE"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="40" y="684" width="36" height="16" rx="8" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="84" y="696" fontSize="8">
            {"Start"}
          </text>
          <polygon className="dd-dusty dd-stroke-ink" points="168,692 180,684 192,692 180,700" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="200" y="696" fontSize="8">
            {"Decision"}
          </text>
          <rect className="dd-link dd-stroke-link" x="280" y="684" width="28" height="16" rx="2" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="316" y="696" fontSize="8">
            {"Server step"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="420" y="684" width="36" height="16" rx="8" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="464" y="696" fontSize="8">
            {"fetch_log failure"}
          </text>
          <rect className="dd-slate dd-stroke-slate" x="600" y="684" width="28" height="16" rx="2" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="636" y="696" fontSize="8">
            {"Under review"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="760" y="684" width="36" height="16" rx="8" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="804" y="696" fontSize="8">
            {"Page keeps price"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="940" y="684" width="28" height="16" rx="2" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="976" y="696" fontSize="8">
            {"price_versions"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="1100" y="684" width="36" height="16" rx="8" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="1144" y="696" fontSize="8">
            {"observations"}
          </text>
        </svg>
      </div>
    </>
  );
}
