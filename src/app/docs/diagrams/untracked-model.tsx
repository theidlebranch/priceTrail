export function UntrackedModelDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Steps · How PriceTrail works"}</p>
      <h1>{"A model we did not track"}</h1>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="untracked-model-title untracked-model-desc">
          <title id="untracked-model-title">
            {"A model we did not track"}
          </title>
          <desc id="untracked-model-desc">
            {"publishCandidateAction can call publishNewOfficialModel, which writes the model, one official-api offering, a confirmed observation item, and the price through publishPriceVersion in one transaction. decideCandidateAction can call approveWitnessModel, which writes the model, one official-api offering, and an aggregator_slug alias, with no price. rejectCandidateModel sets status rejected. A ReviewRefusal stores no model."}
          </desc>
          <rect className="dd-paper" width="100%" height="100%" />
          <text className="dd-muted dd-mono" x="304" y="48" fontSize="8" letterSpacing="0.08em">
            {"publishCandidateAction"}
          </text>
          <text className="dd-muted dd-mono" x="304" y="328" fontSize="8" letterSpacing="0.08em">
            {"decideCandidateAction"}
          </text>
          <g aria-hidden="true">
            <rect className="dd-slate" x="304" y="136" width="224" height="48" data-role="rail" data-step="official-card" data-index="1" />
            <rect className="dd-accent-fill" x="528" y="136" width="224" height="48" data-role="rail" data-step="add-and-publish" data-index="2" data-focal="true" />
            <line className="dd-stroke-accent" x1="528" y1="136" x2="752" y2="136" strokeWidth="1" />
            <line className="dd-stroke-accent" x1="528" y1="184" x2="752" y2="184" strokeWidth="1" />
            <rect className="dd-dusty" x="752" y="136" width="224" height="48" data-role="rail" data-step="official-reject" data-index="3" />
            <rect className="dd-slate" x="304" y="416" width="224" height="48" data-role="rail" data-step="witness-card" data-index="1" />
            <rect className="dd-sage" x="528" y="416" width="224" height="48" data-role="rail" data-step="approve" data-index="2" />
            <rect className="dd-dusty" x="752" y="416" width="224" height="48" data-role="rail" data-step="witness-reject" data-index="3" />
          </g>
          <g className="dd-mono" fontSize="8" fontWeight="600" letterSpacing="0.14em" textAnchor="middle">
            <text className="dd-muted" x="416" y="84" data-role="number" data-step="official-card">
              {"01"}
            </text>
            <text className="dd-accent" x="640" y="84" data-role="number" data-step="add-and-publish">
              {"02"}
            </text>
            <text className="dd-ink" x="864" y="84" data-role="number" data-step="official-reject">
              {"03"}
            </text>
            <text className="dd-muted" x="416" y="364" data-role="number" data-step="witness-card">
              {"01"}
            </text>
            <text className="dd-muted" x="640" y="364" data-role="number" data-step="approve">
              {"02"}
            </text>
            <text className="dd-ink" x="864" y="364" data-role="number" data-step="witness-reject">
              {"03"}
            </text>
          </g>
          <g aria-hidden="true" strokeWidth="1">
            <line className="dd-stroke-muted" x1="416" y1="100" x2="416" y2="120" />
            <line className="dd-stroke-accent" x1="640" y1="100" x2="640" y2="120" />
            <line className="dd-stroke-ink" x1="864" y1="100" x2="864" y2="120" />
            <line className="dd-stroke-muted" x1="416" y1="380" x2="416" y2="400" />
            <line className="dd-stroke-muted" x1="640" y1="380" x2="640" y2="400" />
            <line className="dd-stroke-ink" x1="864" y1="380" x2="864" y2="400" />
          </g>
          <g className="dd-paper" aria-hidden="true" strokeWidth="1">
            <circle className="dd-slate dd-stroke-slate" cx="416" cy="160" r="36" data-role="medallion" data-step="official-card" />
            <circle className="dd-paper" cx="640" cy="160" r="36" stroke="none" />
            <circle className="dd-accent-fill dd-stroke-accent" cx="640" cy="160" r="36" data-role="medallion" data-step="add-and-publish" data-focal="true" />
            <circle className="dd-dusty dd-stroke-ink" cx="864" cy="160" r="36" data-role="medallion" data-step="official-reject" />
            <circle className="dd-slate dd-stroke-slate" cx="416" cy="440" r="36" data-role="medallion" data-step="witness-card" />
            <circle className="dd-sage dd-stroke-sage" cx="640" cy="440" r="36" data-role="medallion" data-step="approve" />
            <circle className="dd-dusty dd-stroke-ink" cx="864" cy="440" r="36" data-role="medallion" data-step="witness-reject" />
          </g>
          <g className="dd-sans" fontSize="12" fontWeight="600" textAnchor="middle">
            <text className="dd-ink" x="416" y="228">
              {"Official card"}
            </text>
            <text className="dd-accent" x="640" y="228">
              {"Add and publish"}
            </text>
            <text className="dd-ink" x="864" y="228">
              {"Reject"}
            </text>
            <text className="dd-ink" x="416" y="508">
              {"Witness card"}
            </text>
            <text className="dd-muted" x="640" y="508">
              {"Approve · no price"}
            </text>
            <text className="dd-ink" x="864" y="508">
              {"Reject"}
            </text>
          </g>
          <g className="dd-muted dd-mono" fontSize="9" textAnchor="middle">
            <text x="416" y="252">
              {"candidate_models"}
            </text>
            <text x="416" y="272">
              {"pending_review · official"}
            </text>
            <text x="640" y="252">
              {"publishNewOfficialModel()"}
            </text>
            <text x="640" y="272">
              {"publishPriceVersion()"}
            </text>
            <text x="864" y="252">
              {"rejectCandidateModel()"}
            </text>
            <text x="864" y="272">
              {"status rejected · no model"}
            </text>
            <text x="416" y="532">
              {"candidate_models"}
            </text>
            <text x="416" y="552">
              {"pending_review · aggregator"}
            </text>
            <text x="640" y="532">
              {"approveWitnessModel()"}
            </text>
            <text x="640" y="552">
              {"official-api · aggregator_slug"}
            </text>
            <text x="864" y="532">
              {"rejectCandidateModel()"}
            </text>
            <text x="864" y="552">
              {"status rejected · no model"}
            </text>
          </g>
          <text className="dd-muted dd-sans" x="640" y="596" fontSize="14" fontStyle="italic" textAnchor="middle">
            {"Same transaction: models, offerings, observation_items review_status confirmed."}
          </text>
          <text className="dd-muted dd-sans" x="640" y="620" fontSize="14" fontStyle="italic" textAnchor="middle">
            {"ReviewRefusal rolls back. The card stays pending_review and no model is stored."}
          </text>
          <line className="dd-stroke-ink" x1="80" y1="648" x2="1200" y2="648" strokeWidth="1" strokeOpacity="0.2" />
          <text className="dd-muted dd-mono" x="80" y="676" fontSize="8" letterSpacing="0.18em">
            {"LEGEND"}
          </text>
          <circle className="dd-slate dd-stroke-slate" cx="168" cy="672" r="8" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="184" y="676" fontSize="9">
            {"Pending card"}
          </text>
          <circle className="dd-accent-fill dd-stroke-accent" cx="292" cy="672" r="8" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="308" y="676" fontSize="9">
            {"Add and publish"}
          </text>
          <circle className="dd-sage dd-stroke-sage" cx="440" cy="672" r="8" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="456" y="676" fontSize="9">
            {"Approve · no price"}
          </text>
          <circle className="dd-dusty dd-stroke-ink" cx="590" cy="672" r="8" strokeWidth="1" />
          <text className="dd-muted dd-sans" x="606" y="676" fontSize="9">
            {"Reject stays rejected. Spacing shows order, not time."}
          </text>
        </svg>
      </div>
    </>
  );
}
