import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Original segment audio for Remotion (exact timing + pronunciation). */
export async function extractSegmentAudioAac(
  videoPath: string,
  outAac: string,
): Promise<void> {
  await mkdir(path.dirname(outAac), { recursive: true });
  await execFileAsync(
    (process.env.FFMPEG_PATH ?? "ffmpeg").trim(),
    ["-y", "-i", videoPath, "-vn", "-c:a", "aac", "-b:a", "192k", outAac],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}
