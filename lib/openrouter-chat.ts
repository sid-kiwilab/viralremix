const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
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

export function getOpenRouterApiKey(): string | null {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  return key || null;
}

/** Text-only chat; default model matches analyze unless OPENROUTER_PLAN_MODEL is set. */
export function getOpenRouterPlanModel(): string {
  const fromEnv = (process.env.OPENROUTER_PLAN_MODEL ?? "").trim();
  if (fromEnv) return fromEnv;
  const video = (process.env.OPENROUTER_VIDEO_MODEL ?? "").trim();
  return video || "google/gemini-2.5-flash";
}

export async function openRouterChatJson(
  systemPrompt: string,
  userPrompt: string,
): Promise<
  | { ok: true; rawText: string }
  | { ok: false; error: string; status?: number }
> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "Missing OPENROUTER_API_KEY.",
      status: 503,
    };
  }

  const model = getOpenRouterPlanModel();
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
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const data = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const raw =
      data.error?.message?.trim() ||
      `OpenRouter request failed (${response.status})`;
    return { ok: false, error: raw, status: 502 };
  }

  const rawText = messageText(data.choices);
  if (!rawText.trim()) {
    return { ok: false, error: "Empty model response.", status: 502 };
  }

  return { ok: true, rawText };
}
