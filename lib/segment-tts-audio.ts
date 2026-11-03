import path from "node:path";
import { downloadToFile, submitTtsTask, waitForTaskResult } from "@/lib/evolink";
import type { ResolvedRemixVo } from "@/lib/remix-spec";
import type { TranscriptSegment } from "@/lib/segment-transcribe";

/** EvoLink Qwen TTS — one track per ASR phrase, synced to transcript startSec. */
export async function generateTtsVoTracksFromSegments(
  segments: TranscriptSegment[],
  assetsDir: string,
): Promise<ResolvedRemixVo[]> {
  const tracks: ResolvedRemixVo[] = [];
  let index = 0;

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text || seg.endSec <= seg.startSec) continue;

    const taskId = await submitTtsTask(text);
    const url = await waitForTaskResult(taskId);
    const localPath = path.join(assetsDir, `tts-${index}.mp3`);
    await downloadToFile(url, localPath);

    tracks.push({
      type: "vo",
      text,
      startSec: seg.startSec,
      localPath,
    });
    index++;
  }

  return tracks;
}
