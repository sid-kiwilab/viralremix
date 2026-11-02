import {
  DIMENSION_LABELS,
  type RecreatabilityAnalysis,
  type RecreatabilityBand,
} from "@/lib/recreatability";

function bandShort(band: RecreatabilityBand): string {
  switch (band) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

function parseBeat(beat: string): { time: string | null; body: string } {
  const match = beat.match(/^(\d+(?:-\d+)?s):\s*(.+)$/i);
  if (match) {
    return { time: match[1], body: match[2] };
  }
  return { time: null, body: beat };
}

type Props = {
  analysis: RecreatabilityAnalysis;
};

export function RecreatabilityCard({ analysis }: Props) {
  const dimensionEntries = Object.entries(analysis.dimensions) as Array<
    [keyof typeof analysis.dimensions, number]
  >;
  const parsedBeats = analysis.beats.map((beat) => parseBeat(beat));
  const beatsHaveTimestamps = parsedBeats.some((beat) => beat.time !== null);

  return (
    <article
      className="recreatability-card"
      aria-labelledby="recreatability-heading"
    >
      <header className="recreatability-header">
        <div className="recreatability-header-top">
          <p className="recreatability-kicker">Recreatability</p>
          <span
            className={`recreatability-pill recreatability-pill-${analysis.band}`}
          >
            {bandShort(analysis.band)}
          </span>
        </div>
        <p id="recreatability-heading" className="sr-only">
          Recreatability score {analysis.overallScore},{" "}
          {bandShort(analysis.band).toLowerCase()} band
        </p>
        <p
          className={`recreatability-score recreatability-score-${analysis.band}`}
          aria-hidden="true"
        >
          {analysis.overallScore}
        </p>
        <p className="recreatability-summary">{analysis.summary}</p>
      </header>

      <section className="recreatability-section" aria-labelledby="format-heading">
        <h2 id="format-heading" className="recreatability-section-title">
          Format read
        </h2>

        <div className="recreatability-field">
          <p className="recreatability-field-label">Hook</p>
          <p className="recreatability-field-body">{analysis.hook}</p>
        </div>

        {analysis.speechSummary ? (
          <div className="recreatability-field">
            <p className="recreatability-field-label">Speech</p>
            <p className="recreatability-field-body">{analysis.speechSummary}</p>
          </div>
        ) : null}

        {parsedBeats.length > 0 ? (
          <div className="recreatability-subsection">
            <p className="recreatability-field-label">Beats</p>
            {beatsHaveTimestamps ? (
              <ol className="recreatability-timeline">
                {parsedBeats.map((beat, index) =>
                  beat.time ? (
                    <li
                      key={`beat-${index}`}
                      className="recreatability-timeline-row recreatability-timeline-row--stamped"
                    >
                      <span className="recreatability-timeline-time">
                        {beat.time}
                      </span>
                      <span className="recreatability-timeline-body">
                        {beat.body}
                      </span>
                    </li>
                  ) : (
                    <li
                      key={`beat-${index}`}
                      className="recreatability-beat-plain"
                    >
                      {beat.body}
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <ul className="recreatability-verdict-list">
                {parsedBeats.map((beat, index) => (
                  <li key={`beat-${index}`}>{beat.body}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {analysis.onScreenText.length > 0 ? (
          <div className="recreatability-subsection">
            <p className="recreatability-field-label">On-screen text</p>
            <ul className="recreatability-chips">
              {analysis.onScreenText.map((line, index) => (
                <li key={`text-${index}`}>
                  <span className="recreatability-chip">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section
        className="recreatability-section"
        aria-labelledby="dimensions-heading"
      >
        <h2 id="dimensions-heading" className="recreatability-section-title">
          Dimensions
        </h2>
        <ul className="recreatability-dimensions">
          {dimensionEntries.map(([key, value]) => (
            <li key={key} className="recreatability-dimension-row">
              <span className="recreatability-dimension-label">
                {DIMENSION_LABELS[key]}
              </span>
              <span className="recreatability-dimension-bar-wrap">
                <span
                  className="recreatability-dimension-bar"
                  style={{
                    width: `${value}%`,
                    opacity: 0.35 + (value / 100) * 0.65,
                  }}
                />
              </span>
              <span className="recreatability-dimension-value">{value}</span>
            </li>
          ))}
        </ul>
      </section>

      {(analysis.remakesWell.length > 0 ||
        analysis.remakesPoorly.length > 0 ||
        analysis.canDrop.length > 0) ? (
        <div className="recreatability-verdict">
          {analysis.canDrop.length > 0 ? (
            <section
              className="recreatability-verdict-col"
              aria-labelledby="can-drop-heading"
            >
              <h2 id="can-drop-heading" className="recreatability-section-title">
                Can drop
              </h2>
              <ul className="recreatability-verdict-list">
                {analysis.canDrop.map((item, index) => (
                  <li key={`drop-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {analysis.remakesWell.length > 0 ? (
            <section
              className="recreatability-verdict-col"
              aria-labelledby="remakes-well-heading"
            >
              <h2 id="remakes-well-heading" className="recreatability-section-title">
                Remakes well
              </h2>
              <ul className="recreatability-verdict-list">
                {analysis.remakesWell.map((item, index) => (
                  <li key={`well-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {analysis.remakesPoorly.length > 0 ? (
            <section
              className="recreatability-verdict-col"
              aria-labelledby="remakes-poor-heading"
            >
              <h2 id="remakes-poor-heading" className="recreatability-section-title">
                Hard to remake
              </h2>
              <ul className="recreatability-verdict-list">
                {analysis.remakesPoorly.map((item, index) => (
                  <li key={`poor-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
