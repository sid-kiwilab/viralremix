import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type LipsyncClipManifestEntry = {
  fileName: string;
  timelineStartSec: number;
  text: string;
};

const MANIFEST_NAME = "lipsync-manifest.json";

export async function writeLipsyncClipManifest(
  assetsDir: string,
  entries: LipsyncClipManifestEntry[],
): Promise<void> {
  await writeFile(
    path.join(assetsDir, MANIFEST_NAME),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
}

export async function readLipsyncClipManifest(
  assetsDir: string,
): Promise<LipsyncClipManifestEntry[] | null> {
  const p = path.join(assetsDir, MANIFEST_NAME);
  try {
    await access(p);
    const raw = JSON.parse(await readFile(p, "utf8")) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.filter(
      (e): e is LipsyncClipManifestEntry =>
        typeof e?.fileName === "string" &&
        typeof e.timelineStartSec === "number" &&
        typeof e.text === "string",
    );
  } catch {
    return null;
  }
}
