import { execFile } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Grab a reference frame from the source segment for @image4 set lock. */
export async function extractSetPlateJpg(
  videoPath: string,
  outJpg: string,
  atSec = 1.5,
): Promise<void> {
  await mkdir(path.dirname(outJpg), { recursive: true });
  await execFileAsync(
    (process.env.FFMPEG_PATH ?? "ffmpeg").trim(),
    [
      "-y",
      "-ss",
      String(atSec),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outJpg,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}

function publicOriginFromLucaBase(): string | null {
  const base = (process.env.REMIX_LUCA_REF_BASE ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return base.replace(/\/avatars\/luca\/?$/i, "");
}

export function recreatePlatePublicUrl(fileName: string): string | null {
  const origin = publicOriginFromLucaBase();
  if (!origin) return null;
  return `${origin}/recreate-plates/${fileName}`;
}

export async function publishRecreatePlate(
  localJpg: string,
  fileName: string,
): Promise<string | null> {
  const publicDir = path.join(process.cwd(), "public", "recreate-plates");
  await mkdir(publicDir, { recursive: true });
  const dest = path.join(publicDir, fileName);
  await copyFile(localJpg, dest);
  return recreatePlatePublicUrl(fileName);
}

/** Copies plate to public/recreate-plates/; URL works when REMIX_LUCA_REF_BASE origin serves public/. */
export async function publishSetPlateForEvoLink(
  localJpg: string,
  slug: string,
): Promise<string | null> {
  return publishRecreatePlate(localJpg, `${slug}-set.jpg`);
}
