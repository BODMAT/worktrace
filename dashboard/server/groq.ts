const GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS    = 60_000;

export class GroqAuthError extends Error {
  constructor() {
    super("Groq rejected the API key");
    this.name = "GroqAuthError";
  }
}

export class GroqUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqUpstreamError";
  }
}

export class GroqTimeoutError extends Error {
  constructor() {
    super("Groq request timed out");
    this.name = "GroqTimeoutError";
  }
}

type ChatMessage = { role: "system" | "user"; content: string };

export type GroqChatInput = {
  apiKey:       string;
  model?:       string;
  system:       string;
  user:         string;
  temperature?: number;
  maxTokens?:   number;
};

export async function groqChat(input: GroqChatInput): Promise<string> {
  const model = input.model ?? getDefaultModel();
  const messages: ChatMessage[] = [
    { role: "system", content: input.system },
    { role: "user",   content: input.user   },
  ];

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: input.temperature ?? 0.4,
        max_tokens:  input.maxTokens   ?? 2000,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "AbortError") throw new GroqTimeoutError();
    throw new GroqUpstreamError(err instanceof Error ? err.message : "network error");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw new GroqAuthError();
  if (!res.ok) {
    const body = await res.text();
    console.error("[groq] non-ok response", res.status, body);
    throw new GroqUpstreamError(`Groq returned ${res.status}`);
  }

  type Resp = { choices?: Array<{ message?: { content?: string } }> };
  const data = (await res.json()) as Resp;
  const text = data.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new GroqUpstreamError("Empty completion");
  return text;
}

export function getDefaultModel(): string {
  return process.env.GROQ_MODEL ?? DEFAULT_MODEL;
}
