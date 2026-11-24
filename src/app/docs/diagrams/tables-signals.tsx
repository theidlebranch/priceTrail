export function TablesSignalsDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Database schema"}</p>
      <h1>{"Where signals and requests live"}</h1>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="13c-tables-signals-title 13c-tables-signals-desc">
          <title id="13c-tables-signals-title">
            {"Where signals and requests live"}
          </title>
          <desc id="13c-tables-signals-desc">
            {"Nine tables. witness_reads, verification_flags, candidate_models, model_signals, and fetch_triggers each have source_id pointing at sources. verification_flags.offering_id points at offerings. model_signals.model_id points at models. offerings.model_id points at models. candidate_models.lab_id points at labs, which is not drawn, and resolved_model_id optionally points at models. requests has no foreign key. The six signal tables do not point at each other. Every foreign key is on delete restrict."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="412" y1="128" x2="256" y2="128" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="412" y1="216" x2="256" y2="216" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="412" y1="304" x2="256" y2="304" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="412" y1="392" x2="256" y2="392" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="412" y1="480" x2="256" y2="480" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="672" y1="216" x2="860" y2="216" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="672" y1="392" x2="860" y2="392" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="970" y1="252" x2="970" y2="356" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="294" y="108" width="80" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="334" y="117" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SOURCE_ID"}
          </text>
          <rect className="dd-paper" x="294" y="196" width="80" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="334" y="205" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SOURCE_ID"}
          </text>
          <rect className="dd-paper" x="294" y="284" width="80" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="334" y="293" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SOURCE_ID"}
          </text>
          <rect className="dd-paper" x="294" y="372" width="80" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="334" y="381" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SOURCE_ID"}
          </text>
          <rect className="dd-paper" x="294" y="460" width="80" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="334" y="469" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"SOURCE_ID"}
          </text>
          <rect className="dd-paper" x="726" y="196" width="80" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="766" y="205" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"OFFERING_ID"}
          </text>
          <rect className="dd-paper" x="734" y="372" width="64" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="766" y="381" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"MODEL_ID"}
          </text>
          <rect className="dd-paper" x="942" y="292" width="56" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="970" y="301" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"MODEL_ID"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="36" y="56" width="220" height="440" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="48" y="72" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="72" y="83" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="146" y="112" fontSize="12" fontWeight="600" textAnchor="middle">
            {"sources"}
          </text>
          <text className="dd-ink dd-mono" x="146" y="130" fontSize="9" textAnchor="middle">
            {"url"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="412" y="96" width="260" height="64" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="542" y="122" fontSize="12" fontWeight="600" textAnchor="middle">
            {"witness_reads"}
          </text>
          <text className="dd-ink dd-mono" x="542" y="142" fontSize="9" textAnchor="middle">
            {"source_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="412" y="184" width="260" height="64" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="542" y="210" fontSize="12" fontWeight="600" textAnchor="middle">
            {"verification_flags"}
          </text>
          <text className="dd-ink dd-mono" x="542" y="230" fontSize="9" textAnchor="middle">
            {"source_id · offering_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="412" y="272" width="260" height="64" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="542" y="298" fontSize="12" fontWeight="600" textAnchor="middle">
            {"candidate_models"}
          </text>
          <text className="dd-ink dd-mono" x="542" y="318" fontSize="9" textAnchor="middle">
            {"lab_id · resolved_model_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="412" y="360" width="260" height="64" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="542" y="386" fontSize="12" fontWeight="600" textAnchor="middle">
            {"model_signals"}
          </text>
          <text className="dd-ink dd-mono" x="542" y="406" fontSize="9" textAnchor="middle">
            {"source_id · model_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="412" y="448" width="260" height="64" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="542" y="474" fontSize="12" fontWeight="600" textAnchor="middle">
            {"fetch_triggers"}
          </text>
          <text className="dd-ink dd-mono" x="542" y="494" fontSize="9" textAnchor="middle">
            {"source_id · reason"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="860" y="180" width="220" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="970" y="208" fontSize="12" fontWeight="600" textAnchor="middle">
            {"offerings"}
          </text>
          <text className="dd-ink dd-mono" x="970" y="228" fontSize="9" textAnchor="middle">
            {"model_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="860" y="356" width="200" height="72" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="960" y="384" fontSize="12" fontWeight="600" textAnchor="middle">
            {"models"}
          </text>
          <text className="dd-ink dd-mono" x="960" y="404" fontSize="9" textAnchor="middle">
            {"lab_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="860" y="540" width="300" height="80" rx="6" strokeWidth="1" />
          <text className="dd-ink dd-sans" x="1010" y="568" fontSize="12" fontWeight="600" textAnchor="middle">
            {"requests"}
          </text>
          <text className="dd-ink dd-mono" x="1010" y="586" fontSize="9" textAnchor="middle">
            {"kind · lab_name"}
          </text>
          <text className="dd-ink dd-mono" x="1010" y="602" fontSize="9" textAnchor="middle">
            {"no foreign key"}
          </text>
          <line className="dd-stroke-muted" x1="40" y1="648" x2="1240" y2="648" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="40" y="668" fontSize="8" letterSpacing="0.14em">
            {"LEGEND · EVERY FOREIGN KEY IS ON DELETE RESTRICT"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="40" y="684" width="28" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="76" y="696" fontSize="8">
            {"Table"}
          </text>
          <line className="dd-stroke-ink" x1="160" y1="692" x2="196" y2="692" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <text className="dd-muted dd-sans" x="204" y="696" fontSize="8">
            {"Foreign key"}
          </text>
        </svg>
      </div>
    </>
  );
}
