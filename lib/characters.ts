export type Character = {
  id: string;
  name: string;
  role: string;
  /** Public URL for UI (profile portrait only). */
  profileSrc: string;
  /** Reference assets for future Remix generation — not shown on Avatars page. */
  generation: {
    profile: string;
    face: string;
    turnaround: string;
  };
  consentLine: string;
  statusLine: string;
};

const DEFAULT_LUCA_GENERATION_REF_BASE =
  "https://raw.githubusercontent.com/sid-kiwilab/viralremix/main/public/avatars/luca";

/** Public URLs for EvoLink reference-to-video (override with REMIX_LUCA_REF_BASE). */
export function getLucaGenerationRefBase(): string {
  const fromEnv = (process.env.REMIX_LUCA_REF_BASE ?? "").trim();
  return (fromEnv || DEFAULT_LUCA_GENERATION_REF_BASE).replace(/\/$/, "");
}

export function getLucaGenerationRefUrls(): string[] {
  const base = getLucaGenerationRefBase();
  return [
    `${base}/profile.jpg`,
    `${base}/face.jpg`,
    `${base}/turnaround.jpg`,
  ];
}

export const CHARACTERS = [
  {
    id: "luca",
    name: "Luca",
    role: "House model",
    profileSrc: "/avatars/luca/profile-display.webp",
    generation: {
      profile: "/avatars/luca/profile.jpg",
      face: "/avatars/luca/face.jpg",
      turnaround: "/avatars/luca/turnaround.jpg",
    },
    consentLine:
      "Luca kindly agreed to be the model for all our videos.",
    statusLine: "Remix CLI uses his reference JPGs via EvoLink.",
  },
] as const satisfies readonly Character[];
