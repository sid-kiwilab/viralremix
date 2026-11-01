import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

const STEPS = [
  {
    title: "Video URL",
    body: "Paste an Instagram Reel or TikTok link. Nothing is fetched yet.",
  },
  {
    title: "Read the format",
    body: "Later: understand hook, structure, and what to remake. Not built.",
  },
  {
    title: "Remix",
    body: "Later: generate a recreation. Not built.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <SiteShell isLanding={false}>
      <Link href="/" className="btn btn-ghost page-back">
        Back
      </Link>
      <article className="how-it-works">
        <h1 className="content-h1">How it works</h1>
        <p className="content-lede">
          Viral Remix takes a video URL and remakes the format. Sister of Viral
          Radar (find the outliers; remix one).
        </p>
        <ol className="how-steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <h2>
                {i + 1}. {step.title}
              </h2>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </article>
    </SiteShell>
  );
}
