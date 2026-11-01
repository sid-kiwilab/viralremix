import type { ReactNode } from "react";
import { HERO_VIDEO } from "@/lib/site-constants";
import { SiteHeader } from "@/components/site-header";

export function SiteShell({
  isLanding,
  onHomeClick,
  children,
}: {
  isLanding: boolean;
  onHomeClick?: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="hero-photo" aria-hidden>
        <video autoPlay muted loop playsInline src={HERO_VIDEO} />
        <div className="hero-photo-scrim" />
      </div>
      <div className="grain" aria-hidden />
      <div className={`site-shell${isLanding ? " is-landing" : ""}`}>
        <div className="landing-stage">
          <SiteHeader onHomeClick={onHomeClick} homeHref="/" />
          <main className="site-main" id="top">
            <div className="content-page">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
