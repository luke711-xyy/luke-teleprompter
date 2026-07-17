const MAX_AUDIO_BYTES = 384 * 1024;
const MAX_PROMPT_LENGTH = 1_000;
const LOCAL_ORIGINS = new Set(["http://127.0.0.1:1420", "http://localhost:1420"]);

export interface AiRunner {
  run(model: string, input: {
    audio: string;
    language?: "zh" | "en";
    task: "transcribe";
    initial_prompt?: string;
  }): Promise<{ text?: string }>;
}

export interface TranscriptionConfig {
  pagesOriginSuffix: string;
}

function isAllowedOrigin(origin: string | null, config: TranscriptionConfig): origin is string {
  if (!origin) return false;
  if (LOCAL_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(config.pagesOriginSuffix);
  } catch {
    return false;
  }
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: Record<string, unknown>, status: number, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

async function readLimitedBody(request: Request): Promise<ArrayBuffer> {
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_AUDIO_BYTES) throw new RangeError("音频片段超过 384 KB 限制。");
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUDIO_BYTES) throw new RangeError("音频片段超过 384 KB 限制。");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const audio = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio.buffer;
}

function base64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8_192));
  }
  return btoa(binary);
}

function languageFrom(value: string | null): "zh" | "en" | undefined {
  if (value === "chinese" || value === "zh-CN" || value === "zh") return "zh";
  if (value === "english" || value === "en-US" || value === "en") return "en";
  return undefined;
}

export async function handleTranscriptionRequest(
  request: Request,
  ai: AiRunner,
  config: TranscriptionConfig,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method === "GET" && new URL(request.url).pathname === "/health") {
    return json({ state: "ready", engine: "Cloudflare Workers AI Whisper" }, 200, isAllowedOrigin(origin, config) ? origin : undefined);
  }
  if (!isAllowedOrigin(origin, config)) return json({ message: "不允许该来源访问转写服务。" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/transcribe") {
    return json({ message: "未找到请求的接口。" }, 404, origin);
  }
  if (!request.headers.get("content-type")?.startsWith("audio/wav")) {
    return json({ message: "音频格式必须为 16 kHz 单声道 WAV。" }, 415, origin);
  }

  try {
    const audio = await readLimitedBody(request);
    if (audio.byteLength < 3_200) return json({ message: "音频片段过短。" }, 400, origin);
    const url = new URL(request.url);
    const prompt = (url.searchParams.get("prompt") ?? "").slice(-MAX_PROMPT_LENGTH);
    const response = await ai.run("@cf/openai/whisper-large-v3-turbo", {
      audio: base64Encode(audio),
      language: languageFrom(url.searchParams.get("language")),
      task: "transcribe",
      initial_prompt: prompt || undefined,
    });
    return json({ text: response.text?.trim() ?? "", language: url.searchParams.get("language") ?? "auto", confidence: 0.8 }, 200, origin);
  } catch (error) {
    if (error instanceof RangeError) return json({ message: error.message }, 413, origin);
    // Audio is intentionally never logged: it can contain private speech.
    console.error("Workers AI transcription failed", error instanceof Error ? error.message : String(error));
    return json({ message: "Cloudflare 转写暂时不可用，请稍后重试。" }, 502, origin);
  }
}
