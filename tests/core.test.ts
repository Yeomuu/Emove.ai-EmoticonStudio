import { describe, expect, it } from "vitest";
import { createMotionBrief, emotionMeta, initialLayers } from "../src/data";
import { normalizePath } from "../src/router";
import { encodeGifFrames } from "../src/services/renderer";
import { previewLayerOrder } from "../src/store";

describe("clean route normalization", () => {
  it("keeps public clean paths and never produces a hash route", () => {
    expect(normalizePath("/edit?frame=2")).toBe("/edit");
    expect(normalizePath("/library/joy-pop")).toBe("/library/joy-pop");
    expect(normalizePath("/#home")).toBe("/home");
    expect(normalizePath("/unknown")).toBe("/home");
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
