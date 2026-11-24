export function SixHourClockDiagram() {
  return (
    <>
      <p className="doc-eyebrow">{"Timeline · How PriceTrail works"}</p>
      <h1>{"The six-hour clock"}</h1>
      <p className="doc-sub">{"One hour of the <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">schedules</code> in <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">vercel.json</code>. The same hour repeats every six hours. Each POST calls <code style=\"font-family: var(--font-mono); font-size: 0.9em;\">cronRequestAuthorized</code> before the database opens."}</p>
      <div className="doc-diagram">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="04-six-hour-clock-title 04-six-hour-clock-desc">
          <title id="04-six-hour-clock-title">
            {"The six-hour clock"}
          </title>
          <desc id="04-six-hour-clock-desc">
            {"vercel.json schedules: verify-anthropic POST /api/verify/anthropic at minute 0, verify-openai at minute 10, verify-google at minute 20, signals-litellm POST /api/signals/litellm at minute 30, signals-openrouter at minute 40, then drain-triggers-1, drain-triggers-2, and drain-triggers-3 all POST /api/triggers/drain at minutes 50, 52, and 54. The drain cluster is stretched so the two-minute gaps stay readable. cronRequestAuthorized refuses a missing CRON_SECRET or one under 16 characters before the database opens."}
          </desc>
          <rect className="dd-paper" width="100%" height="100%" />
          <line className="dd-stroke-soft" x1="48" y1="348" x2="808" y2="348" strokeWidth="1.5" />
          <line className="dd-stroke-muted" x1="904" y1="348" x2="1232" y2="348" strokeWidth="2" />
          <line className="dd-stroke-ink" x1="836" y1="332" x2="856" y2="364" strokeWidth="1.2" />
          <line className="dd-stroke-ink" x1="856" y1="332" x2="876" y2="364" strokeWidth="1.2" />
          <text className="dd-muted dd-mono" x="856" y="316" fontSize="8" textAnchor="middle" letterSpacing="0.12em">
            {"BREAK"}
          </text>
          <text className="dd-muted dd-mono" x="856" y="388" fontSize="8" textAnchor="middle" letterSpacing="0.08em">
            {"2 MIN STRETCHED"}
          </text>
          <line className="dd-stroke-muted" x1="120" y1="242" x2="120" y2="348" strokeWidth="1" />
          <circle className="dd-soft" cx="120" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="120" y="168" fontSize="8" textAnchor="middle">
            {":00 · verify-anthropic"}
          </text>
          <text className="dd-ink dd-sans" x="120" y="190" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Anthropic"}
          </text>
          <text className="dd-soft dd-mono" x="120" y="208" fontSize="8" textAnchor="middle">
            {"POST /api/verify/anthropic"}
          </text>
          <text className="dd-muted dd-mono" x="120" y="226" fontSize="8" textAnchor="middle">
            {"respondToSchedule"}
          </text>
          <line className="dd-stroke-muted" x1="280" y1="348" x2="280" y2="454" strokeWidth="1" />
          <circle className="dd-soft" cx="280" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="280" y="472" fontSize="8" textAnchor="middle">
            {":10 · verify-openai"}
          </text>
          <text className="dd-ink dd-sans" x="280" y="494" fontSize="12" fontWeight="600" textAnchor="middle">
            {"OpenAI"}
          </text>
          <text className="dd-soft dd-mono" x="280" y="512" fontSize="8" textAnchor="middle">
            {"POST /api/verify/openai"}
          </text>
          <text className="dd-muted dd-mono" x="280" y="530" fontSize="8" textAnchor="middle">
            {"respondToSchedule"}
          </text>
          <line className="dd-stroke-muted" x1="440" y1="242" x2="440" y2="348" strokeWidth="1" />
          <circle className="dd-soft" cx="440" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="440" y="168" fontSize="8" textAnchor="middle">
            {":20 · verify-google"}
          </text>
          <text className="dd-ink dd-sans" x="440" y="190" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Google"}
          </text>
          <text className="dd-soft dd-mono" x="440" y="208" fontSize="8" textAnchor="middle">
            {"POST /api/verify/google"}
          </text>
          <text className="dd-muted dd-mono" x="440" y="226" fontSize="8" textAnchor="middle">
            {"respondToSchedule"}
          </text>
          <line className="dd-stroke-muted" x1="600" y1="348" x2="600" y2="454" strokeWidth="1" />
          <circle className="dd-soft" cx="600" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="600" y="472" fontSize="8" textAnchor="middle">
            {":30 · signals-litellm"}
          </text>
          <text className="dd-ink dd-sans" x="600" y="494" fontSize="12" fontWeight="600" textAnchor="middle">
            {"LiteLLM"}
          </text>
          <text className="dd-soft dd-mono" x="600" y="512" fontSize="8" textAnchor="middle">
            {"POST /api/signals/litellm"}
          </text>
          <text className="dd-muted dd-mono" x="600" y="530" fontSize="8" textAnchor="middle">
            {"readLiteLLMSignal"}
          </text>
          <line className="dd-stroke-muted" x1="760" y1="242" x2="760" y2="348" strokeWidth="1" />
          <circle className="dd-soft" cx="760" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="760" y="168" fontSize="8" textAnchor="middle">
            {":40 · signals-openrouter"}
          </text>
          <text className="dd-ink dd-sans" x="760" y="190" fontSize="12" fontWeight="600" textAnchor="middle">
            {"OpenRouter"}
          </text>
          <text className="dd-soft dd-mono" x="760" y="208" fontSize="8" textAnchor="middle">
            {"POST /api/signals/openrouter"}
          </text>
          <text className="dd-muted dd-mono" x="760" y="226" fontSize="8" textAnchor="middle">
            {"readOpenRouterSignal"}
          </text>
          <line className="dd-stroke-muted" x1="984" y1="348" x2="984" y2="454" strokeWidth="1" />
          <circle className="dd-muted" cx="984" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="984" y="472" fontSize="8" textAnchor="middle">
            {":50 · drain-triggers-1"}
          </text>
          <text className="dd-ink dd-sans" x="984" y="494" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Trigger drain"}
          </text>
          <text className="dd-soft dd-mono" x="984" y="512" fontSize="8" textAnchor="middle">
            {"POST /api/triggers/drain"}
          </text>
          <text className="dd-muted dd-mono" x="984" y="530" fontSize="8" textAnchor="middle">
            {"respondToTriggerDrain"}
          </text>
          <line className="dd-stroke-muted" x1="1080" y1="242" x2="1080" y2="348" strokeWidth="1" />
          <circle className="dd-muted" cx="1080" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="1080" y="168" fontSize="8" textAnchor="middle">
            {":52 · drain-triggers-2"}
          </text>
          <text className="dd-ink dd-sans" x="1080" y="190" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Trigger drain"}
          </text>
          <text className="dd-soft dd-mono" x="1080" y="208" fontSize="8" textAnchor="middle">
            {"POST /api/triggers/drain"}
          </text>
          <text className="dd-muted dd-mono" x="1080" y="226" fontSize="8" textAnchor="middle">
            {"respondToTriggerDrain"}
          </text>
          <line className="dd-stroke-muted" x1="1176" y1="348" x2="1176" y2="454" strokeWidth="1" />
          <circle className="dd-muted" cx="1176" cy="348" r="4" />
          <text className="dd-muted dd-mono" x="1176" y="472" fontSize="8" textAnchor="middle">
            {":54 · drain-triggers-3"}
          </text>
          <text className="dd-ink dd-sans" x="1176" y="494" fontSize="12" fontWeight="600" textAnchor="middle">
            {"Trigger drain"}
          </text>
          <text className="dd-soft dd-mono" x="1176" y="512" fontSize="8" textAnchor="middle">
            {"POST /api/triggers/drain"}
          </text>
          <text className="dd-muted dd-mono" x="1176" y="530" fontSize="8" textAnchor="middle">
            {"respondToTriggerDrain"}
          </text>
          <line className="dd-stroke-silver" x1="48" y1="588" x2="1232" y2="588" strokeWidth="1" />
          <text className="dd-muted dd-mono" x="48" y="616" fontSize="8" letterSpacing="0.14em">
            {"LEGEND"}
          </text>
          <circle className="dd-soft" cx="128" cy="612" r="4" />
          <text className="dd-muted dd-sans" x="140" y="616" fontSize="8.5">
            {"10-minute route"}
          </text>
          <circle className="dd-muted" cx="268" cy="612" r="4" />
          <text className="dd-muted dd-sans" x="280" y="616" fontSize="8.5">
            {"Drain, 2 minutes, axis stretched"}
          </text>
          <text className="dd-muted dd-mono" x="48" y="648" fontSize="9">
            {"cronRequestAuthorized runs first. A missing CRON_SECRET, or one under 16 characters, returns 401. The database stays closed."}
          </text>
          <text className="dd-muted dd-mono" x="48" y="670" fontSize="9">
            {"All eight calls are POST. Drains call runPendingTriggers, one pending row each. Verify routes then call runProductionVisit."}
          </text>
        </svg>
      </div>
    </>
  );
}
