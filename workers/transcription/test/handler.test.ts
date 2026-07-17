import { describe, expect, it, vi } from "vitest";
import { handleTranscriptionRequest, type AiRunner } from "../src/handler";

const config = { pagesOriginSuffix: ".luke-teleprompter.pages.dev" };
const origin = "https://remote-whisper-tunnel.luke-teleprompter.pages.dev";

function transcriptionRequest(body = new Uint8Array(3_200)): Request {
  return new Request("https://luke-teleprompter-transcription-test.workers.dev/v1/transcribe?language=zh-CN&prompt=hello", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "audio/wav" },
    body,
  });
}

describe("Cloudflare transcription handler", () => {
  it("limits access to the Pages preview origin and returns normalized transcription", async () => {
    const ai: AiRunner = { run: vi.fn(async () => ({ text: "  你好 Luke  " })) };
    const response = await handleTranscriptionRequest(transcriptionRequest(), ai, config);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(await response.json()).toEqual({ text: "你好 Luke", language: "zh-CN", confidence: 0.8 });
    expect(ai.run).toHaveBeenCalledWith("@cf/openai/whisper-large-v3-turbo", expect.objectContaining({ language: "zh", task: "transcribe" }));
  });

  it("rejects untrusted origins and oversized audio before invoking the model", async () => {
    const ai: AiRunner = { run: vi.fn() };
    const rejected = await handleTranscriptionRequest(new Request("https://worker.example/v1/transcribe", {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "audio/wav" },
      body: new Uint8Array(3_200),
    }), ai, config);
    const oversized = await handleTranscriptionRequest(transcriptionRequest(new Uint8Array(385 * 1024)), ai, config);

    expect(rejected.status).toBe(403);
    expect(oversized.status).toBe(413);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("exposes a non-sensitive health endpoint", async () => {
    const response = await handleTranscriptionRequest(new Request("https://worker.example/health"), { run: vi.fn() }, config);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "ready", engine: "Cloudflare Workers AI Whisper" });
  });
});
