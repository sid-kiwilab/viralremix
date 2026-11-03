import { getLucaGenerationRefUrls } from "@/lib/characters";
import { startPublicRefTunnel } from "@/lib/evolink-public-refs";
import { publishSetPlateForEvoLink } from "@/lib/segment-set-plate";

export type EvoLinkImageUrlsSession = {
  imageUrls: string[];
  close: () => Promise<void>;
};

/**
 * Public URLs for EvoLink image_urls (@image1–4).
 * Prefer REMIX_LUCA_REF_BASE (GitHub raw after push); else ephemeral cloudflared + local public/.
 */
export async function resolveEvoLinkImageUrls(options: {
  setPlateLocal: string;
  slug: string;
}): Promise<EvoLinkImageUrlsSession> {
  const lucaBase = (process.env.REMIX_LUCA_REF_BASE ?? "").trim();
  if (lucaBase) {
    const setPlateUrl = await publishSetPlateForEvoLink(
      options.setPlateLocal,
      options.slug,
    );
    return {
      imageUrls: [
        ...getLucaGenerationRefUrls(),
        ...(setPlateUrl ? [setPlateUrl] : []),
      ],
      close: async () => undefined,
    };
  }

  const setPlateFileName = `${options.slug}-set.jpg`;
  const tunnel = await startPublicRefTunnel({
    setPlateLocal: options.setPlateLocal,
    setPlateFileName,
  });
  const origin = tunnel.lucaRefBase.replace(/\/avatars\/luca\/?$/i, "");
  return {
    imageUrls: [
      `${tunnel.lucaRefBase}/profile.jpg`,
      `${tunnel.lucaRefBase}/face.jpg`,
      `${tunnel.lucaRefBase}/turnaround.jpg`,
      `${origin}/recreate-plates/${setPlateFileName}`,
    ],
    close: () => tunnel.close(),
  };
}

export function evolinkRefHelpText(): string {
  return (
    "EvoLink needs public Luca JPG URLs. Push public/avatars/luca/*.jpg to GitHub main, " +
    "or set REMIX_LUCA_REF_BASE=https://raw.githubusercontent.com/<you>/viralremix/main/public/avatars/luca " +
    "(or run with cloudflared serving public/)."
  );
}
