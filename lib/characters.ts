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
    statusLine: "Remix not connected yet.",
  },
] as const satisfies readonly Character[];
