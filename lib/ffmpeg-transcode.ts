import { execFile } from "node:child_process";
import { rename, unlink } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runFfmpeg(args: string[], _opts?: undefined): Promise<void> {
  const bin = (process.env.FFMPEG_PATH ?? "ffmpeg").trim();
  await execFileAsync(bin, args, { maxBuffer: 16 * 1024 * 1024 });
}

export async function probeVideoDurationSec(
  filePath: string,
): Promise<number | null> {
  const bin = (process.env.FFPROBE_PATH ?? "ffprobe").trim();
  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        filePath,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const n = parseFloat(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function probeHasAudio(filePath: string): Promise<boolean> {
  const bin = (process.env.FFPROBE_PATH ?? "ffprobe").trim();
  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "default=nw=1:nk=1",
        filePath,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    return stdout.trim() === "audio";
  } catch {
    return false;
  }
}

async function videoFrameRate(filePath: string): Promise<number | null> {
  const bin = (process.env.FFPROBE_PATH ?? "ffprobe").trim();
  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate",
        "-of",
        "default=nw=1:nk=1",
        filePath,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const raw = stdout.trim();
    const [num, den] = raw.split("/").map((x) => parseInt(x, 10));
    if (!num || !den) return null;
    const fps = num / den;
    return Number.isFinite(fps) && fps > 0 ? fps : null;
  } catch {
    return null;
  }
}

async function videoCodec(filePath: string): Promise<string | null> {
  const bin = (process.env.FFPROBE_PATH ?? "ffprobe").trim();
  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "default=nw=1:nk=1",
        filePath,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    return stdout.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Exact-length H.264 @ 30fps for Remotion (avoids Windows compositor seek past EOF). */
export async function exportRemotionSafeClip(
  inputPath: string,
  outputPath: string,
  durationSec: number,
  keepAudio: boolean,
): Promise<void> {
  const t = Math.max(0.1, durationSec).toFixed(3);
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-t",
    t,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-vsync",
    "cfr",
    "-movflags",
    "+faststart",
    ...(keepAudio ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]),
    outputPath,
  ]);
}

/** Remotion on Windows often fails on HEVC from EvoLink; normalize to H.264. */
export async function ensureH264Mp4(
  filePath: string,
  options?: { keepAudio?: boolean },
): Promise<void> {
  const codec = await videoCodec(filePath);
  const fps = await videoFrameRate(filePath);
  const keepAudio = options?.keepAudio === true;
  const remotionFps = 30;
  const fpsOk = fps !== null && Math.abs(fps - remotionFps) < 0.5;
  if (codec === "h264" && fpsOk && !keepAudio) return;
  if (codec === "h264" && fpsOk && keepAudio) {
    const hasAudio = await probeHasAudio(filePath);
    if (hasAudio) return;
  }

  const tmp = `${filePath}.h264.mp4`;
  try {
    await runFfmpeg([
      "-y",
      "-i",
      filePath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(remotionFps),
      "-movflags",
      "+faststart",
      ...(keepAudio ? ["-c:a", "aac"] : ["-an"]),
      tmp,
    ]);
    await unlink(filePath);
    await rename(tmp, filePath);
  } catch (err) {
    console.warn(
      `[remix] Could not transcode ${codec} to H.264 (install ffmpeg on PATH):`,
      err instanceof Error ? err.message : err,
    );
  }
}
