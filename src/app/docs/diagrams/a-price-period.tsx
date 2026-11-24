export function APricePeriodDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"State machine · How PriceTrail works"}</p>
      <h1>{"A price period"}</h1>
      <p className="doc-sub">{"One offering has one open price_versions row. publishPeriod() fills last_seen_at and opens the next row. A person's confirm omits announcedOn, so that row is observed. publishCorrection() sets retracted_at and replaces_version_id."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="08-a-price-period-title 08-a-price-period-desc">
          <title id="08-a-price-period-title">
            {"A price period"}
          </title>
          <desc id="08-a-price-period-desc">
            {"One offering has one open price_versions row; publishPeriod() sets last_seen_at and inserts an observed row, publishCorrection() sets retracted_at and replaces_version_id, and system:same-price cannot publish."}
          </desc>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon className="dd-ink" points="0 0, 8 3, 0 6" />
            </marker>
          </defs>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-ink" x1="78" y1="320" x2="140" y2="320" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="320" y1="252" x2="320" y2="156" strokeWidth="1.2" strokeDasharray="5,4" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="500" y1="320" x2="820" y2="320" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <line className="dd-stroke-ink" x1="320" y1="388" x2="320" y2="488" strokeWidth="1.2" markerEnd="url(#arrow)" />
          <rect className="dd-paper" x="85" y="300" width="48" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="109" y="309" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"FIRST"}
          </text>
          <rect className="dd-paper" x="328" y="196" width="72" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="364" y="205" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"EVIDENCE"}
          </text>
          <rect className="dd-paper" x="628" y="300" width="64" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="660" y="309" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"CHANGE"}
          </text>
          <rect className="dd-paper" x="328" y="428" width="72" height="12" rx="2" />
          <text className="dd-muted dd-mono" x="364" y="437" fontSize="8" textAnchor="middle" letterSpacing="0.06em">
            {"CORRECT"}
          </text>
          <circle className="dd-ink" cx="72" cy="320" r="6" />
          <rect className="dd-mustard dd-stroke-mustard" x="140" y="36" width="360" height="120" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="320" y="64" fontSize="12" fontWeight="600" textAnchor="middle">
            {"price_version_evidence"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="86" fontSize="9" textAnchor="middle">
            {"stores observation_item_id"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="104" fontSize="9" textAnchor="middle">
            {"observations.archive_url"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="122" fontSize="9" textAnchor="middle">
            {"a blank archive_url is allowed"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="140" y="252" width="360" height="136" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="320" y="280" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Open price_versions"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="302" fontSize="9" textAnchor="middle">
            {"one open row per offering"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="320" fontSize="9" textAnchor="middle">
            {"last_seen_at is null"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="338" fontSize="9" textAnchor="middle">
            {"retracted_at is null"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="356" fontSize="9" textAnchor="middle">
            {"findOpenVersions() returns this row"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="820" y="236" width="420" height="168" rx="8" strokeWidth="1.5" />
          <text className="dd-ink dd-sans" x="1030" y="264" fontSize="12" fontWeight="600" textAnchor="middle">
            {"New price_versions"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="286" fontSize="9" textAnchor="middle">
            {"publishPeriod() sets last_seen_at"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="304" fontSize="9" textAnchor="middle">
            {"confirm omits announcedOn; observed"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="322" fontSize="9" textAnchor="middle">
            {"componentsForConfirm(): UTC day of reviewedAt"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="340" fontSize="9" textAnchor="middle">
            {"validFrom and validUntil include the day"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="358" fontSize="9" textAnchor="middle">
            {"a gap throws; a later segment is dropped"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="140" y="488" width="360" height="128" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="320" y="516" fontSize="12" fontWeight="600" textAnchor="middle">
            {"publishCorrection()"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="538" fontSize="9" textAnchor="middle">
            {"sets retracted_at on the open row"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="556" fontSize="9" textAnchor="middle">
            {"new row sets replaces_version_id"}
          </text>
          <text className="dd-ink dd-mono" x="320" y="574" fontSize="9" textAnchor="middle">
            {"first_seen_at must match"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="820" y="488" width="420" height="128" rx="8" strokeWidth="1.2" />
          <text className="dd-ink dd-sans" x="1030" y="516" fontSize="12" fontWeight="600" textAnchor="middle">
            {"system:same-price"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="538" fontSize="9" textAnchor="middle">
            {"publishPriceVersion() throws"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="556" fontSize="9" textAnchor="middle">
            {"after item lock, before offering lock"}
          </text>
          <text className="dd-ink dd-mono" x="1030" y="574" fontSize="9" textAnchor="middle">
            {"no new row; the open row stays open"}
          </text>
          <line className="dd-stroke-silver" x1="48" y1="648" x2="1232" y2="648" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="48" y="672" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <circle className="dd-ink" cx="140" cy="692" r="6" />
          <text className="dd-muted dd-sans" x="156" y="696" fontSize="8.5">
            {"Start"}
          </text>
          <rect className="dd-mustard dd-stroke-mustard" x="220" y="686" width="28" height="12" rx="4" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="256" y="696" fontSize="8.5">
            {"Database row"}
          </text>
          <rect className="dd-accent-fill dd-stroke-accent" x="380" y="686" width="28" height="12" rx="4" strokeWidth="1.5" />
          <text className="dd-muted dd-sans" x="416" y="696" fontSize="8.5">
            {"Inserted period"}
          </text>
          <rect className="dd-sage dd-stroke-sage" x="560" y="686" width="28" height="12" rx="4" strokeWidth="1.2" />
          <text className="dd-muted dd-sans" x="596" y="696" fontSize="8.5">
            {"Cannot publish"}
          </text>
          <line className="dd-stroke-ink" x1="740" y1="692" x2="776" y2="692" strokeWidth="1.2" strokeDasharray="5,4" />
          <text className="dd-muted dd-sans" x="784" y="696" fontSize="8.5">
            {"Proof link, not a new row"}
          </text>
          <text className="dd-muted dd-sans" x="980" y="696" fontSize="8.5">
            {"No arrow: that card cannot publish"}
          </text>
        </svg>
      </div>
    </>
  );
}
