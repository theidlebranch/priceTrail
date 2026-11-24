export function TablesEvidenceDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Database schema"}</p>
      <h1>{"How a visit's evidence hangs together"}</h1>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="13b-tables-evidence-title 13b-tables-evidence-desc">
          <title id="13b-tables-evidence-title">
            {"How a visit's evidence hangs together"}
          </title>
          <desc id="13b-tables-evidence-desc">
            {"Five tables. sources.url is the page. fetch_log.source_id and observations.source_id point at that source. fetch_log.observation_id points at the observation only when the outcome is changed. observation_items.observation_id points at the observation, and observation_items.offering_id points at offerings. offerings.model_id points at models, which is not drawn here. Every foreign key is on delete restrict."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <path className="dd-stroke-ink" d="M 188,220 V 96 Q 188,88 196,88 H 460" fill="none" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="580" y1="220" x2="580" y2="128" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="328" y1="264" x2="450" y2="264" strokeWidth="1.2" strokeDasharray="5,4" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="580" y1="392" x2="580" y2="308" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="730" y1="440" x2="880" y2="440" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="292" y="68" width="72" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="328" y="77" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SOURCE_ID"}
          </text>
          <rect className="dd-paper" x="588" y="162" width="72" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="624" y="171" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SOURCE_ID"}
          </text>
          <rect className="dd-paper" x="353" y="244" width="72" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="389" y="253" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"IF CHANGED"}
          </text>
          <rect className="dd-paper" x="588" y="338" width="48" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="612" y="347" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"OBS_ID"}
          </text>
          <rect className="dd-paper" x="765" y="420" width="80" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="805" y="429" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"OFFERING_ID"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="460" y="48" width="240" height="80" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="472" y="60" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="496" y="71" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="580" y="98" fontSize="12" fontWeight="600" textAnchor="middle">
            {"sources"}
          </text>
          <text className="dd-ink dd-mono" x="580" y="116" fontSize="9" textAnchor="middle">
            {"url"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="48" y="220" width="280" height="88" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="60" y="232" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="84" y="243" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="188" y="274" fontSize="12" fontWeight="600" textAnchor="middle">
            {"fetch_log"}
          </text>
          <text className="dd-ink dd-mono" x="188" y="294" fontSize="9" textAnchor="middle">
            {"source_id · observation_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="450" y="220" width="260" height="88" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="462" y="232" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="486" y="243" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="580" y="274" fontSize="12" fontWeight="600" textAnchor="middle">
            {"observations"}
          </text>
          <text className="dd-ink dd-mono" x="580" y="294" fontSize="9" textAnchor="middle">
            {"source_id · archive_url"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="430" y="392" width="300" height="96" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="442" y="404" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="466" y="415" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="580" y="448" fontSize="12" fontWeight="600" textAnchor="middle">
            {"observation_items"}
          </text>
          <text className="dd-ink dd-mono" x="580" y="468" fontSize="9" textAnchor="middle">
            {"observation_id · offering_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="880" y="404" width="220" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="990" y="436" fontSize="12" fontWeight="600" textAnchor="middle">
            {"offerings"}
          </text>
          <text className="dd-ink dd-mono" x="990" y="456" fontSize="9" textAnchor="middle">
            {"model_id"}
          </text>
          <line className="dd-stroke-muted" x1="40" y1="620" x2="1240" y2="620" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="40" y="644" fontSize="8" letterSpacing="0.14em">
            {"LEGEND · EVERY FOREIGN KEY IS ON DELETE RESTRICT"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="40" y="664" width="28" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="76" y="676" fontSize="8">
            {"Table"}
          </text>
          <line className="dd-stroke-ink" x1="160" y1="672" x2="196" y2="672" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <text className="dd-muted dd-sans" x="204" y="676" fontSize="8">
            {"Foreign key"}
          </text>
          <line className="dd-stroke-ink" x1="340" y1="672" x2="376" y2="672" strokeWidth="1.2" strokeDasharray="5,4" markerEnd="url(#arrow)" />
          <text className="dd-muted dd-sans" x="384" y="676" fontSize="8">
            {"observation_id only when outcome is changed"}
          </text>
        </svg>
      </div>
    </>
  );
}
