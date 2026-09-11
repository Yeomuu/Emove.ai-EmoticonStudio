import { afterEach, describe, expect, it, vi } from "vitest";
import { handleOpenAIRequest } from "../server/openai-api";
import { ServerOpenAIProvider } from "../src/services/ai-provider";
import { transcriptionFileName } from "../src/services/audio-format";
import { buildCharacterPrompt, buildFramePrompts } from "../src/services/prompt-builder";
import { createMotionBrief, defaultCharacterTokens } from "../src/data";

const env = { OPENAI_API_KEY: "sk-test-not-a-real-key" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const recordingRequest = (bytes = 20) => {
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/webm" }), "emotion.webm");
  return new Request("http://localhost/api/openai/transcribe", { method: "POST", body });
};

afterEach(() => vi.unstubAllGlobals());

describe("recording transcription", () => {
  it.each([
    ["audio/webm;codecs=opus", "emotion.webm"],
    ["audio/mp4", "emotion.m4a"],
    ["audio/wav", "emotion.wav"],
    ["audio/mpeg", "emotion.mp3"],
  ])("uploads %s with its actual container extension", async (type, name) => {
    const fetchMock = vi.fn().mockResolvedValue(json({ text: "안녕하세요", shortText: "안녕!" }));
    vi.stubGlobal("fetch", fetchMock);
    await new ServerOpenAIProvider().transcribe(new Blob(["audio"], { type }));
    const form = fetchMock.mock.calls[0][1].body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe(name);
    expect(file.type).toBe(type);
  });

  it("rejects empty and unsupported recordings without an API call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new ServerOpenAIProvider().transcribe(new Blob([]))).rejects.toThrow(/비어/);
    expect(() => transcriptionFileName("audio/aac")).toThrow(/지원되지/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await handleOpenAIRequest(recordingRequest(0), env))?.status).toBe(400);
  });

  it("normalizes copied model values and preserves the full transcript", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ text: "안녕하세요 반갑습니다" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleOpenAIRequest(recordingRequest(), { ...env, OPENAI_TRANSCRIBE_MODEL: "\uFEFFgpt-transcribe \n" });
    expect((fetchMock.mock.calls[0][1].body as FormData).get("model")).toBe("gpt-transcribe");
    expect(await response?.json()).toMatchObject({ text: "안녕하세요 반갑습니다" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 429, 503])("preserves provider status %s and request ID", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "provider error", code: "test_code" } }), { status, headers: { "x-request-id": "req-test" } })));
    const response = await handleOpenAIRequest(recordingRequest(), env);
    expect(response?.status).toBe(status);
    expect(await response?.json()).toMatchObject({ error: "provider error", code: "test_code", requestId: "req-test" });
  });

  it("handles non-JSON upstream errors and empty transcripts explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })));
    expect((await handleOpenAIRequest(recordingRequest(), env))?.status).toBe(502);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ text: " " })));
    expect((await handleOpenAIRequest(recordingRequest(), env))?.status).toBe(422);
  });

  it("bounds server waits without retrying the paid request", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    expect((await handleOpenAIRequest(recordingRequest(), env))?.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("native transparent generation", () => {
  it("requests alpha for character and all action prompts, without chroma instructions", () => {
    const token = defaultCharacterTokens[0];
    const brief = createMotionBrief("joy", "#ffffff", "안녕", "안녕", .5, token.id, 120);
    const prompts = [buildCharacterPrompt(token), ...buildFramePrompts(brief, token)];
    expect(prompts).toHaveLength(6);
    for (const prompt of prompts) {
      expect(prompt).toContain("transparent background");
      expect(prompt).not.toMatch(/#00FF00|chroma-key/);
    }
  });

  it("enforces alpha for reference edits even with old auto env values", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(new Blob(["reference"], { type: "image/png" })))
      .mockResolvedValueOnce(json({ data: [{ b64_json: "AA==" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleOpenAIRequest(new Request("http://localhost/api/openai/frame", { method: "POST", body: JSON.stringify({ prompt: "character", referenceImages: ["data:image/png;base64,AA=="] }) }), { ...env, OPENAI_IMAGE_BACKGROUND: "auto" });
    const form = fetchMock.mock.calls[1][1].body as FormData;
    expect(form.get("background")).toBe("transparent");
    expect(form.get("model")).toBe("gpt-image-2");
    expect(form.get("output_format")).toBe("webp");
    expect(response?.status).toBe(200);
  });

  it("rejects JPEG before a paid generation request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleOpenAIRequest(new Request("http://localhost/api/openai/character", { method: "POST", body: JSON.stringify({ prompt: "character" }) }), { ...env, OPENAI_IMAGE_OUTPUT_FORMAT: "jpeg" });
    expect(response?.status).toBe(500);
    expect(await response?.json()).toMatchObject({ error: expect.stringContaining("JPEG") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch arbitrary reference URLs on the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleOpenAIRequest(new Request("http://localhost/api/openai/frame", { method: "POST", body: JSON.stringify({ prompt: "character", referenceImages: ["http://127.0.0.1/private"] }) }), env);
    expect(response?.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
