export function SuggestALabDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Flowchart · How PriceTrail works"}</p>
      <h1>{"Accepting a lab does not add one"}</h1>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="suggest-a-lab-title suggest-a-lab-desc">
          <title id="suggest-a-lab-title">
            {"Accepting a lab does not add one"}
          </title>
          <desc id="suggest-a-lab-desc">
            {"A signed-in person calls suggestLabAction, and suggestLab inserts one pending requests row. decideLabRequestAction then calls decideLabRequest. A blank note throws LabRequestRefusal and writes nothing. Accept or decline stores review_note, reviewed_by, and reviewed_at on that row. Accept sets status accepted and does not insert a lab, a source, or a schedule."}
          </desc>
          <defs>
            <marker id="suggest-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="440" y1="96" x2="520" y2="96" strokeWidth="1.2" markerEnd="url(#suggest-arrow)" />
          <line className="dd-stroke-ink" x1="760" y1="96" x2="840" y2="96" strokeWidth="1.2" markerEnd="url(#suggest-arrow)" />
          <path className="dd-stroke-ink" d="M 1080 96 H 1152 Q 1160 96 1160 104 V 264 Q 1160 272 1152 272 H 760" fill="none" strokeWidth="1.2" markerEnd="url(#suggest-arrow)" />
          <path className="dd-stroke-ink" d="M 560 328 V 376 Q 560 384 552 384 H 328 Q 320 384 320 392 V 448" fill="none" strokeWidth="1.2" markerEnd="url(#suggest-arrow)" />
          <line className="dd-stroke-ink" x1="640" y1="328" x2="640" y2="448" strokeWidth="1.2" markerEnd="url(#suggest-arrow)" />
          <path className="dd-stroke-ink" d="M 720 328 V 376 Q 720 384 728 384 H 952 Q 960 384 960 392 V 448" fill="none" strokeWidth="1.2" markerEnd="url(#suggest-arrow)" />
          <rect className="dd-paper" x="454" y="76" width="52" height="12" />
          <text className="dd-muted dd-mono" x="480" y="86" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"LAB NAME"}
          </text>
          <rect className="dd-paper" x="778" y="76" width="44" height="12" />
          <text className="dd-muted dd-mono" x="800" y="86" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"INSERT"}
          </text>
          <rect className="dd-paper" x="1104" y="172" width="48" height="12" />
          <text className="dd-muted dd-mono" x="1128" y="182" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"DECIDE"}
          </text>
          <rect className="dd-paper" x="328" y="408" width="44" height="12" />
          <text className="dd-muted dd-mono" x="350" y="418" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"BLANK"}
          </text>
          <rect className="dd-paper" x="648" y="340" width="48" height="12" />
          <text className="dd-muted dd-mono" x="672" y="350" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"ACCEPT"}
          </text>
          <rect className="dd-paper" x="968" y="408" width="56" height="12" />
          <text className="dd-muted dd-mono" x="996" y="418" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"DECLINE"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="200" y="40" width="240" height="112" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-ink" x="212" y="52" width="40" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="232" y="62" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"USER"}
          </text>
          <text className="dd-ink dd-sans" x="320" y="86" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Signed-in person"}
          </text>
          <text className="dd-muted dd-mono" x="320" y="106" fontSize="9" textAnchor="middle">
            {"suggestLabAction()"}
          </text>
          <text className="dd-muted dd-mono" x="320" y="124" fontSize="9" textAnchor="middle">
            {"readSignedInAccountId()"}
          </text>
          <rect className="dd-link dd-stroke-link" x="520" y="40" width="240" height="112" rx="6" strokeWidth="1" />
          <rect className="dd-link dd-stroke-link" x="532" y="52" width="40" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="552" y="62" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"CALL"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="86" fontSize="12" fontWeight="600" textAnchor="middle">
            {"suggestLab()"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="106" fontSize="9" textAnchor="middle">
            {"labNameKey · matchesTrackedLab"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="124" fontSize="9" textAnchor="middle">
            {"duplicate pending inserts nothing"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="840" y="40" width="240" height="112" rx="6" strokeWidth="1" />
          <rect className="dd-mustard dd-stroke-mustard" x="852" y="52" width="32" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="868" y="62" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"ROW"}
          </text>
          <text className="dd-ink dd-sans" x="960" y="86" fontSize="12" fontWeight="600" textAnchor="middle">
            {"requests · pending"}
          </text>
          <text className="dd-muted dd-mono" x="960" y="106" fontSize="9" textAnchor="middle">
            {"kind, lab_name, lab_name_key"}
          </text>
          <text className="dd-muted dd-mono" x="960" y="124" fontSize="9" textAnchor="middle">
            {"suggested_by, suggested_at"}
          </text>
          <rect className="dd-link dd-stroke-link" x="520" y="216" width="240" height="112" rx="6" strokeWidth="1" />
          <rect className="dd-link dd-stroke-link" x="532" y="228" width="40" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="552" y="238" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"CALL"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="262" fontSize="12" fontWeight="600" textAnchor="middle">
            {"decideLabRequest()"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="282" fontSize="9" textAnchor="middle">
            {"decideLabRequestAction"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="300" fontSize="9" textAnchor="middle">
            {"review_note required"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="200" y="448" width="240" height="112" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-ink" x="212" y="460" width="40" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="232" y="470" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"STOP"}
          </text>
          <text className="dd-ink dd-sans" x="320" y="494" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Blank note"}
          </text>
          <text className="dd-muted dd-mono" x="320" y="514" fontSize="9" textAnchor="middle">
            {"checkedReviewNote()"}
          </text>
          <text className="dd-muted dd-mono" x="320" y="532" fontSize="9" textAnchor="middle">
            {"LabRequestRefusal"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="520" y="448" width="240" height="112" rx="6" strokeWidth="1" />
          <rect className="dd-sage dd-stroke-sage" x="532" y="460" width="44" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="554" y="470" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"STAMP"}
          </text>
          <text className="dd-ink dd-sans" x="640" y="494" fontSize="12" fontWeight="600" textAnchor="middle">
            {"status accepted"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="514" fontSize="9" textAnchor="middle">
            {"reviewed_by, reviewed_at, review_note"}
          </text>
          <text className="dd-muted dd-mono" x="640" y="532" fontSize="9" textAnchor="middle">
            {"no labs, sources, schedule"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="840" y="448" width="240" height="112" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-ink" x="852" y="460" width="40" height="14" rx="2" strokeWidth="1" />
          <text className="dd-ink dd-mono" x="872" y="470" fontSize="7" textAnchor="middle" letterSpacing="0.08em">
            {"STOP"}
          </text>
          <text className="dd-ink dd-sans" x="960" y="494" fontSize="12" fontWeight="600" textAnchor="middle">
            {"status declined"}
          </text>
          <text className="dd-muted dd-mono" x="960" y="514" fontSize="9" textAnchor="middle">
            {"reviewed_by, reviewed_at, review_note"}
          </text>
          <text className="dd-muted dd-mono" x="960" y="532" fontSize="9" textAnchor="middle">
            {"note required · no new row"}
          </text>
          <line className="dd-stroke-ink" x1="80" y1="608" x2="1200" y2="608" strokeWidth="1" strokeOpacity="0.2" />
          <text className="dd-muted dd-mono" x="80" y="636" fontSize="8" letterSpacing="0.18em">
            {"LEGEND"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="160" y="624" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="186" y="634" fontSize="9">
            {"Person"}
          </text>
          <rect className="dd-link dd-stroke-link" x="250" y="624" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="276" y="634" fontSize="9">
            {"Server step"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="370" y="624" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="396" y="634" fontSize="9">
            {"requests row"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="500" y="624" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="526" y="634" fontSize="9">
            {"Accept stamps that row only"}
          </text>
          <rect className="dd-dusty dd-stroke-ink" x="710" y="624" width="18" height="12" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="736" y="634" fontSize="9">
            {"Blank note or decline"}
          </text>
        </svg>
      </div>
    </>
  );
}
