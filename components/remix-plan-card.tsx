import { CHARACTERS } from "@/lib/characters";
import type { RemixSpec } from "@/lib/remix-spec";

function formatSec(sec: number): string {
  const rounded = Math.round(sec * 10) / 10;
  return `${rounded}s`;
}

type Props = {
  spec: RemixSpec;
};

export function RemixPlanCard({ spec }: Props) {
  const luca = CHARACTERS[0];

  return (
    <article className="remix-plan-card" aria-labelledby="remix-plan-heading">
      <header className="remix-plan-header">
        <p className="remix-plan-kicker">Remake plan</p>
        <h2 id="remix-plan-heading" className="remix-plan-title">
          {formatSec(spec.output.durationSec)} · 9:16 · {luca.name}
        </h2>
        <p className="remix-plan-meta">
          {spec.clips.length} clip{spec.clips.length === 1 ? "" : "s"} ·{" "}
          {spec.textOverlays.length} overlay
          {spec.textOverlays.length === 1 ? "" : "s"}
          {spec.audio.length > 0
            ? ` · ${spec.audio.length} spoken beat${spec.audio.length === 1 ? "" : "s"}`
            : ""}
          {spec.displayMode === "character-strip" ? " · character strip" : ""}
        </p>
      </header>

      <section className="remix-plan-section" aria-labelledby="clips-heading">
        <h3 id="clips-heading" className="remix-plan-section-title">
          Clips
        </h3>
        <ol className="remix-plan-clips">
          {spec.clips.map((clip, index) => (
            <li key={`clip-${index}`} className="remix-plan-clip">
              <p className="remix-plan-clip-meta">
                Clip {index + 1} · {formatSec(clip.durationSec)}
              </p>
              <p className="remix-plan-clip-prompt">{clip.prompt}</p>
            </li>
          ))}
        </ol>
      </section>

      {spec.textOverlays.length > 0 ? (
        <section
          className="remix-plan-section"
          aria-labelledby="overlays-heading"
        >
          <h3 id="overlays-heading" className="remix-plan-section-title">
            On-screen text
          </h3>
          <ul className="remix-plan-overlays">
            {spec.textOverlays.map((overlay, index) => (
              <li key={`overlay-${index}`} className="remix-plan-overlay">
                <p className="remix-plan-overlay-time">
                  {formatSec(overlay.startSec)}–{formatSec(overlay.endSec)} ·{" "}
                  {overlay.position}
                </p>
                <p className="remix-plan-overlay-text">{overlay.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {spec.audio.length > 0 ? (
        <section className="remix-plan-section" aria-labelledby="vo-heading">
          <h3 id="vo-heading" className="remix-plan-section-title">
            Spoken beats
          </h3>
          <ul className="remix-plan-overlays">
            {spec.audio.map((vo, index) => (
              <li key={`vo-${index}`} className="remix-plan-overlay">
                <p className="remix-plan-overlay-time">
                  {formatSec(vo.startSec)}
                </p>
                <p className="remix-plan-vo-text">{vo.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
