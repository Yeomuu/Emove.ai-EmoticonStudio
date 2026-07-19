import { describe, expect, it } from "vitest";
import { createMotionBrief, emotionMeta, initialLayers } from "../src/data";
import { normalizePath } from "../src/router";
import { keyOutConnectedGreen } from "../src/services/image-processing";
import { encodeApngPngFrames, encodeGifFrames } from "../src/services/renderer";
import { circularBatch, isAnimatedSticker, shuffled } from "../src/services/animated-library";
import { persistGeneratedAsset } from "../src/services/asset-storage";
import { normalizeImentivEmotionScores } from "../server/imentiv-emotion";
import { isSameOriginRequest } from "../src/app/api/openai/[...path]/route";
import { previewLayerOrder } from "../src/store";
import type { StickerItem } from "../src/types";

describe("clean route normalization", () => {
  it("keeps public clean paths and never produces a hash route", () => {
    expect(normalizePath("/edit?frame=2")).toBe("/edit");
    expect(normalizePath("/library/joy-pop")).toBe("/library/joy-pop");
    expect(normalizePath("/showcase")).toBe("/showcase");
    expect(normalizePath("/#home")).toBe("/home");
    expect(normalizePath("/unknown")).toBe("/home");
  });
});

describe("OpenAI proxy origin validation", () => {
  it("accepts a browser origin preserved by the forwarded host", () => {
    const request = new Request("http://localhost:3008/api/openai/frame", {
      headers: {
        origin: "http://127.0.0.1:3008",
        host: "localhost:3008",
        "x-forwarded-host": "127.0.0.1:3008",
        "x-forwarded-proto": "http",
      },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects an unrelated browser origin", () => {
    const request = new Request("https://emove-emoticonstudio.vercel.app/api/openai/frame", {
      headers: {
        origin: "https://attacker.example",
        host: "emove-emoticonstudio.vercel.app",
        "x-forwarded-host": "emove-emoticonstudio.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });
});

describe("animated showcase rotation", () => {
  it("shows at most twelve items and wraps without skipping the end of the deck", () => {
    const deck = Array.from({ length: 15 }, (_, index) => index);
    expect(circularBatch(deck, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(circularBatch(deck, 12)).toEqual([12, 13, 14, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("does not mutate the source while shuffling", () => {
    const source = [1, 2, 3, 4];
    expect(shuffled(source, () => 0)).toEqual([2, 3, 4, 1]);
    expect(source).toEqual([1, 2, 3, 4]);
  });

  it("accepts only non-default animated sticker assets", () => {
    const base: StickerItem = {
      id: "animated-1", title: "움직이는 테스트", phrase: "", emotion: "happy", image: "thumb.png",
      animatedImage: "https://assets.example.test/emove.apng", animationFormat: "APNG", color: "#BBB6FF",
      favorite: false, ownerId: null, isDefault: false, isPublished: false, characterTokenId: "character-1",
      createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
    };
    expect(isAnimatedSticker(base)).toBe(true);
    expect(isAnimatedSticker({ ...base, isDefault: true })).toBe(false);
    expect(isAnimatedSticker({ ...base, animatedImage: undefined, animationFormat: undefined })).toBe(false);
  });
});

describe("generated asset persistence", () => {
  it("keeps an existing remote URL without uploading it again", async () => {
    const source = "https://storage.googleapis.com/emove-test/assets/characters/example.png";
    await expect(persistGeneratedAsset(source, { fileName: "example.png", kind: "characters" })).resolves.toEqual({
      enabled: true,
      url: source,
    });
  });
});

describe("four layer edit contract", () => {
  it("contains the required layers in top-to-bottom editor order", () => {
    expect(initialLayers.map((layer) => layer.id)).toEqual([
      "text",
      "accent-effects",
      "character",
      "background-effects",
    ]);
    expect(new Set(initialLayers.map((layer) => layer.id)).size).toBe(4);
  });

  it("previews before and after insertion without losing a layer", () => {
    expect(previewLayerOrder(initialLayers, "background-effects", "text", "before").map((layer) => layer.id)).toEqual([
      "background-effects", "text", "accent-effects", "character",
    ]);
    expect(previewLayerOrder(initialLayers, "text", "background-effects", "after").map((layer) => layer.id)).toEqual([
      "accent-effects", "character", "background-effects", "text",
    ]);
  });
});

describe("emotion motion brief", () => {
  it("keeps the generated core effect while accepting a user color", () => {
    const brief = createMotionBrief("happy", "#112233", "오늘 진짜 너무 좋아", "완전 좋아!", .72, "default-penguin-soft3d");
    expect(brief.coreEffect).toBe(emotionMeta.happy.effect);
    expect(brief.effectColor).toBe("#112233");
    expect(brief.frameDelayMs).toBe(120);
    expect(brief.duration).toBe(0.6);
    expect(brief.confidence).toBeGreaterThan(0.8);
  });

  it("exposes the exact nine emotion2vec+ output labels", () => {
    expect(Object.keys(emotionMeta)).toEqual(["angry", "disgusted", "fearful", "happy", "neutral", "other", "sad", "surprised", "unknown"]);
  });

  it("normalizes Imentiv nuanced voice labels into the EMOVE emotion contract", () => {
    const scores = normalizeImentivEmotionScores({
      joy: 44,
      excitement: { score: 16 },
      sadness: 20,
      surprise: 10,
      curiosity: 10,
    });
    expect(scores).not.toBeNull();
    expect(scores?.happy).toBeCloseTo(.6);
    expect(scores?.sad).toBeCloseTo(.2);
    expect(scores?.surprised).toBeCloseTo(.2);
    expect(Object.values(scores ?? {}).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });
});

describe("GIF export encoder", () => {
  it("encodes multiple RGBA frames into a valid GIF89a blob", async () => {
    const width = 12;
    const height = 12;
    const makeFrame = (red: number) => {
      const frame = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < frame.length; index += 4) {
        frame[index] = red;
        frame[index + 1] = 96;
        frame[index + 2] = 210;
        frame[index + 3] = 255;
      }
      return frame;
    };
    const blob = encodeGifFrames([makeFrame(80), makeFrame(180)], width, height, 100);
    const header = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 6));
    expect(blob.type).toBe("image/gif");
    expect(header).toBe("GIF89a");
    expect(blob.size).toBeGreaterThan(40);
  });
});

describe("transparent animation pipeline", () => {
  it("removes connected chroma green while preserving the character-colored center pixel", () => {
    const width = 3;
    const height = 3;
    const pixels = new Uint8ClampedArray([
      0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      0, 255, 0, 255, 184, 178, 255, 255, 0, 255, 0, 255,
      0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
    ]);

    keyOutConnectedGreen(pixels, width, height);

    expect(Array.from({ length: 9 }, (_, index) => pixels[index * 4 + 3])).toEqual([
      0, 0, 0,
      0, 255, 0,
      0, 0, 0,
    ]);
    expect(Array.from(pixels.slice(16, 20))).toEqual([184, 178, 255, 255]);
  });

  it("packages multiple PNG frames into a looping APNG container", async () => {
    const transparentPng = Uint8Array.from(
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwW5WQAAAABJRU5ErkJggg==", "base64"),
    );
    const blob = encodeApngPngFrames([transparentPng, transparentPng], 120);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ascii = new TextDecoder("latin1").decode(bytes);

    expect(blob.type).toBe("image/apng");
    expect(ascii).toContain("acTL");
    expect(ascii.match(/fcTL/g)).toHaveLength(2);
    expect(ascii).toContain("fdAT");
  });
});
