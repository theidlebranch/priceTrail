export function TablesCatalogDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Database schema"}</p>
      <h1>{"How the catalog holds a price"}</h1>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="13a-tables-catalog-title 13a-tables-catalog-desc">
          <title id="13a-tables-catalog-title">
            {"How the catalog holds a price"}
          </title>
          <desc id="13a-tables-catalog-desc">
            {"Seven catalog tables linked by foreign keys, every one on delete restrict. models.lab_id points at labs. offerings.model_id and model_aliases.model_id point at models. price_versions.offering_id points at offerings, and replaces_version_id optionally points at another price version. price_components.price_version_id and price_version_evidence.price_version_id point at that version. price_version_evidence.observation_item_id also points at observation_items, which is not drawn here."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="272" y1="208" x2="208" y2="208" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="516" y1="208" x2="452" y2="208" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="792" y1="208" x2="696" y2="208" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="1092" y1="208" x2="1012" y2="208" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="362" y1="400" x2="362" y2="248" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="902" y1="400" x2="902" y2="248" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <path className="dd-stroke-ink" d="M 862,168 V 132 Q 862,124 870,124 H 934 Q 942,124 942,132 V 168" fill="none" strokeWidth="1.2" strokeDasharray="5,4" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="218" y="188" width="44" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="240" y="197" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"LAB_ID"}
          </text>
          <rect className="dd-paper" x="456" y="188" width="56" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="484" y="197" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"MODEL_ID"}
          </text>
          <rect className="dd-paper" x="708" y="188" width="72" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="744" y="197" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"OFFERING_ID"}
          </text>
          <rect className="dd-paper" x="1016" y="188" width="72" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="1052" y="197" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"VERSION_ID"}
          </text>
          <rect className="dd-paper" x="370" y="312" width="56" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="398" y="321" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"MODEL_ID"}
          </text>
          <rect className="dd-paper" x="910" y="312" width="72" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="946" y="321" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"VERSION_ID"}
          </text>
          <rect className="dd-paper" x="876" y="104" width="52" height="12" rx="2" />
          <text className="dd-ink dd-mono" x="902" y="113" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"REPLACES"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="48" y="168" width="160" height="80" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="60" y="180" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="84" y="191" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="128" y="218" fontSize="12" fontWeight="600" textAnchor="middle">
            {"labs"}
          </text>
          <text className="dd-ink dd-mono" x="128" y="236" fontSize="9" textAnchor="middle">
            {"slug"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="272" y="168" width="180" height="80" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="284" y="180" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="308" y="191" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="362" y="218" fontSize="12" fontWeight="600" textAnchor="middle">
            {"models"}
          </text>
          <text className="dd-ink dd-mono" x="362" y="236" fontSize="9" textAnchor="middle">
            {"lab_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="516" y="168" width="180" height="80" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="528" y="180" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="552" y="191" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="606" y="218" fontSize="12" fontWeight="600" textAnchor="middle">
            {"offerings"}
          </text>
          <text className="dd-ink dd-mono" x="606" y="236" fontSize="9" textAnchor="middle">
            {"model_id"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="792" y="168" width="220" height="80" rx="6" strokeWidth="1.5" />
          <rect className="dd-dusty dd-stroke-dusty" x="804" y="180" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="828" y="191" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="902" y="218" fontSize="12" fontWeight="600" textAnchor="middle">
            {"price_versions"}
          </text>
          <text className="dd-ink dd-mono" x="902" y="236" fontSize="9" textAnchor="middle">
            {"offering_id · replaces_version_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="1092" y="168" width="160" height="80" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="1104" y="180" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="1128" y="191" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="1172" y="218" fontSize="12" fontWeight="600" textAnchor="middle">
            {"price_components"}
          </text>
          <text className="dd-ink dd-mono" x="1172" y="236" fontSize="9" textAnchor="middle">
            {"price_version_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="272" y="400" width="180" height="80" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="284" y="412" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="308" y="423" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="362" y="450" fontSize="12" fontWeight="600" textAnchor="middle">
            {"model_aliases"}
          </text>
          <text className="dd-ink dd-mono" x="362" y="468" fontSize="9" textAnchor="middle">
            {"model_id"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="774" y="400" width="256" height="96" rx="6" strokeWidth="1" />
          <rect className="dd-dusty dd-stroke-dusty" x="786" y="412" width="48" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="810" y="423" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"TABLE"}
          </text>
          <text className="dd-ink dd-sans" x="902" y="452" fontSize="12" fontWeight="600" textAnchor="middle">
            {"price_version_evidence"}
          </text>
          <text className="dd-ink dd-mono" x="902" y="470" fontSize="9" textAnchor="middle">
            {"price_version_id · observation_item_id"}
          </text>
          <text className="dd-ink dd-mono" x="902" y="486" fontSize="9" textAnchor="middle">
            {"also observation_items"}
          </text>
          <line className="dd-stroke-muted" x1="40" y1="620" x2="1240" y2="620" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="40" y="644" fontSize="8" letterSpacing="0.14em">
            {"LEGEND · EVERY FOREIGN KEY IS ON DELETE RESTRICT"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="40" y="664" width="28" height="16" rx="2" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="76" y="676" fontSize="8">
            {"Table"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="160" y="664" width="28" height="16" rx="2" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="196" y="676" fontSize="8">
            {"Published price"}
          </text>
          <line className="dd-stroke-ink" x1="360" y1="672" x2="396" y2="672" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <text className="dd-muted dd-sans" x="404" y="676" fontSize="8">
            {"Foreign key"}
          </text>
          <line className="dd-stroke-ink" x1="540" y1="672" x2="576" y2="672" strokeWidth="1.2" strokeDasharray="5,4" markerEnd="url(#arrow)" />
          <text className="dd-muted dd-sans" x="584" y="676" fontSize="8">
            {"Optional key (replaces_version_id)"}
          </text>
        </svg>
      </div>
    </>
  );
}
