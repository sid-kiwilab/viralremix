import {
  parseRecreatabilityAnalysis,
  RECREATABILITY_SYSTEM_PROMPT,
  RECREATABILITY_USER_PROMPT,
  type RecreatabilityAnalysis,
} from "@/lib/recreatability";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Stable default; use OPENROUTER_VIDEO_MODEL only when a newer model is proven for video. */
const DEFAULT_VIDEO_MODEL = "google/gemini-2.5-flash";

export type AnalyzeUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AnalyzeRunMeta = {
  model: string;
  latencyMs: number;
  usage: AnalyzeUsage | null;
};

export function getConfiguredOpenRouterVideoModel(): string {
  const fromEnv = (process.env.OPENROUTER_VIDEO_MODEL ?? "").trim();
  return fromEnv || DEFAULT_VIDEO_MODEL;
}

function getOpenRouterVideoModel(): string {
  return getConfiguredOpenRouterVideoModel();
}

function getOpenRouterApiKey(): string | null {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  return key || null;
}

function bufferToVideoDataUrl(video: Buffer, mimeType: string): string {
  const base64 = video.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

function messageText(content: ChatCompletionResponse["choices"]): string {
  const first = content?.[0]?.message?.content;
  if (typeof first === "string") return first;
  if (Array.isArray(first)) {
    return first
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function parseUsage(data: ChatCompletionResponse): AnalyzeUsage | null {
  const usage = data.usage;
  if (!usage) return null;
  const inputTokens =
    typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null;
  const outputTokens =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : null;
  if (inputTokens === null && outputTokens === null) return null;
  return { inputTokens, outputTokens };
}

function meta(model: string, startedAt: number, usage: AnalyzeUsage | null): AnalyzeRunMeta {
  return {
    model,
    latencyMs: Math.max(0, Date.now() - startedAt),
    usage,
  };
}

export async function analyzeVideoRecreatability(
  video: Buffer,
  mimeType: string,
  signal: AbortSignal,
): Promise<
  | { ok: true; analysis: RecreatabilityAnalysis; meta: AnalyzeRunMeta }
  | { ok: false; error: string; status?: number; meta: AnalyzeRunMeta }
> {
  const model = getOpenRouterVideoModel();
  const startedAt = Date.now();

  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "Analysis is not configured (missing OPENROUTER_API_KEY).",
      status: 503,
      meta: meta(model, startedAt, null),
    };
  }

  const videoUrl = bufferToVideoDataUrl(video, mimeType);

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/sid-kiwilab/viralremix",
      "X-Title": "Viral Remix",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RECREATABILITY_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: RECREATABILITY_USER_PROMPT },
            {
              type: "video_url",
              video_url: {
                url: videoUrl,
                processing: "static",
              },
            },
          ],
        },
      ],
    }),
    signal,
  });

  const data = (await response.json()) as ChatCompletionResponse;
  const usage = parseUsage(data);
  const runMeta = meta(model, startedAt, usage);

  if (!response.ok) {
    const raw =
      data.error?.message?.trim() ||
      `OpenRouter request failed (${response.status})`;
    return { ok: false, error: raw, status: 502, meta: runMeta };
  }

  const rawText = messageText(data.choices);
  if (!rawText.trim()) {
    return { ok: false, error: "empty model response", status: 502, meta: runMeta };
  }

  const analysis = parseRecreatabilityAnalysis(rawText);
  if (!analysis) {
    return { ok: false, error: "invalid model json", status: 502, meta: runMeta };
  }

  return { ok: true, analysis, meta: runMeta };
}
