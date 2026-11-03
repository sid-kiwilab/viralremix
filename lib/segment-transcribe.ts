import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getOpenRouterApiKey } from "@/lib/openrouter-chat";
import {
  resolveTranscribeBackend,
  transcribeMp3WithWhisper,
} from "@/lib/transcribe-whisper-api";

const execFileAsync = promisify(execFile);
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export type TranscriptWord = {
  word: string;
  startSec: number;
  endSec: number;
};

export type TranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export type SegmentTranscript = {
  fullText: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  model: string;
};

const TRANSCRIBE_SYSTEM = `You transcribe speech from a short social video clip with precise timing.
Return ONLY valid JSON (no markdown):
{
  "fullText": string,
  "words": [
    { "word": string, "startSec": number, "endSec": number }
  ],
  "segments": [
    { "startSec": number, "endSec": number, "text": string }
  ]
}
Rules:
- List EVERY spoken word in "words" in order. One token per word/punctuation (e.g. "Merhaba." as one word or "Merhaba" + "." — be consistent).
- Times in seconds with millisecond precision (3 decimal places, e.g. 1.234).
- startSec/endSec of each word must fit within the clip; endSec > startSec; words must not overlap.
- segments are optional phrase groups derived from words (for captions); must not duplicate content.
- Include foreign words as spoken (Turkish etc.); do NOT translate.
- Do NOT repeat or hallucinate words not heard.
- fullText must equal words joined in order (single spaces).`;

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function roundMs(sec: number): number {
  return Math.round(sec * 1000) / 1000;
}

export function normalizeTranscriptWords(raw: TranscriptWord[]): TranscriptWord[] {
  return raw
    .map((w) => ({
      word: String(w.word ?? "").trim(),
      startSec: roundMs(Number(w.startSec)),
      endSec: roundMs(Number(w.endSec)),
    }))
    .filter((w) => w.word && w.endSec > w.startSec)
    .sort((a, b) => a.startSec - b.startSec);
}

export function spokenFromWords(
  words: TranscriptWord[],
  rangeStartSec: number,
  rangeEndSec: number,
): string {
  const picked = words.filter(
    (w) => w.startSec >= rangeStartSec - 0.0005 && w.startSec < rangeEndSec - 0.0005,
  );
  return picked.map((w) => w.word).join(" ").trim();
}

export async function extractAudioMp3(
  videoPath: string,
  outMp3: string,
): Promise<void> {
  await execFileAsync(
    (process.env.FFMPEG_PATH ?? "ffmpeg").trim(),
    [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "4",
      "-ar",
      "44100",
      "-ac",
      "1",
      outMp3,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}

function getTranscribeModel(): string {
  const fromEnv = (process.env.OPENROUTER_TRANSCRIBE_MODEL ?? "").trim();
  return fromEnv || "google/gemini-2.5-flash";
}

async function transcribeWithOpenRouter(
  tmpMp3: string,
  segmentSec: number,
  signal?: AbortSignal,
): Promise<
  | { ok: true; transcript: SegmentTranscript }
  | { ok: false; error: string }
> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return { ok: false, error: "Missing OPENROUTER_API_KEY." };
  }

  const audioBytes = await readFile(tmpMp3);
    const data = audioBytes.toString("base64");
    const model = getTranscribeModel();

    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/sid-kiwilab/viralremix",
        "X-Title": "Viral Remix Transcribe",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TRANSCRIBE_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe all speech in this ${segmentSec}s clip with word-level timestamps. JSON only.`,
              },
              {
                type: "input_audio",
                input_audio: { data, format: "mp3" },
              },
            ],
          },
        ],
      }),
      signal: signal ?? AbortSignal.timeout(180_000),
    });

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        error:
          body.error?.message?.trim() ||
          `Transcription failed (${response.status}).`,
      };
    }

    const rawText = body.choices?.[0]?.message?.content ?? "";
    if (typeof rawText !== "string" || !rawText.trim()) {
      return { ok: false, error: "Empty transcription response." };
    }

    let parsed: {
      fullText?: string;
      segments?: TranscriptSegment[];
      words?: TranscriptWord[];
    };
    try {
      parsed = JSON.parse(extractJsonObject(rawText)) as typeof parsed;
    } catch {
      return { ok: false, error: "Invalid transcription JSON." };
    }

    const words = normalizeTranscriptWords(parsed.words ?? []);
    const segments = (parsed.segments ?? [])
      .map((s) => ({
        startSec: roundMs(Number(s.startSec)),
        endSec: roundMs(Number(s.endSec)),
        text: String(s.text ?? "").trim(),
      }))
      .filter((s) => s.text && s.endSec > s.startSec);

    const fullText =
      (parsed.fullText ?? "").trim() ||
      (words.length ? spokenFromWords(words, 0, segmentSec + 1) : "") ||
      segments.map((s) => s.text).join(" ").trim();

    if (!fullText) {
      return { ok: false, error: "No speech detected in transcript." };
    }

    return {
      ok: true,
      transcript: { fullText, segments, words, model },
    };
}

export async function transcribeSegmentVideo(
  videoPath: string,
  segmentSec: number,
  signal?: AbortSignal,
): Promise<
  | { ok: true; transcript: SegmentTranscript }
  | { ok: false; error: string }
> {
  const tmpMp3 = path.join(
    path.dirname(videoPath),
    `.transcribe-${Date.now()}.mp3`,
  );

  try {
    await extractAudioMp3(videoPath, tmpMp3);
    const backend = resolveTranscribeBackend();
    if (backend !== "openrouter") {
      return transcribeMp3WithWhisper(tmpMp3, segmentSec, signal);
    }
    return transcribeWithOpenRouter(tmpMp3, segmentSec, signal);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Transcription failed.",
    };
  } finally {
    await unlink(tmpMp3).catch(() => undefined);
  }
}

export function textForTimeRange(
  segments: TranscriptSegment[],
  startSec: number,
  endSec: number,
): string {
  const parts: string[] = [];
  for (const s of segments) {
    if (s.endSec <= startSec || s.startSec >= endSec) continue;
    parts.push(s.text);
  }
  return parts.join(" ").trim();
}

export type ClipSpeechSlice = {
  durationSec: number;
  spoken: string;
  rangeStartSec: number;
  rangeEndSec: number;
};

/** Equal-duration clips (e.g. 16s → 8+8) with non-overlapping speech from word timestamps. */
export function splitTranscriptForClips(
  segments: TranscriptSegment[],
  totalDurationSec: number,
  maxClipSec: number,
  words?: TranscriptWord[],
): { clips: ClipSpeechSlice[] } {
  const clipCount = Math.max(1, Math.ceil(totalDurationSec / maxClipSec));
  const clips: ClipSpeechSlice[] = [];

  for (let i = 0; i < clipCount; i++) {
    const rangeStartSec = i * maxClipSec;
    const rangeEndSec = Math.min((i + 1) * maxClipSec, totalDurationSec);
    const durationSec = rangeEndSec - rangeStartSec;

    let spoken =
      words && words.length > 0
        ? spokenFromWords(words, rangeStartSec, rangeEndSec)
        : textForTimeRange(segments, rangeStartSec, rangeEndSec);

    if (!spoken.trim()) {
      spoken = textForTimeRange(segments, rangeStartSec, rangeEndSec);
    }
    if (!spoken.trim()) {
      spoken = "...";
    }

    clips.push({
      durationSec,
      spoken,
      rangeStartSec,
      rangeEndSec,
    });
  }

  return { clips };
}

export function applyTranscriptToPlan(
  plan: import("@/lib/segment-analyze").SegmentRemakePlan,
  transcript: SegmentTranscript,
  segmentSec: number,
): import("@/lib/segment-analyze").SegmentRemakePlan {
  return {
    ...plan,
    durationSec: segmentSec,
    spokenPhrase: transcript.fullText,
    transcriptSegments: transcript.segments,
    transcriptWords: transcript.words,
    spokenPhraseSource: "asr",
  };
}
