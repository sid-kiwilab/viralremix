import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

const STEPS = [
  {
    title: "Video URL",
    body: "Paste an Instagram Reel or TikTok link. Remix fetches the video and plays it in your browser for this session.",
  },
  {
    title: "Read the format",
    body: "After Fetch, Remix sends the clip to a video-capable model (OpenRouter + Gemini) and shows a recreatability score for a simplified remake — accurate hook and beats, what you can drop, and what today’s AI can stitch together honestly.",
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
