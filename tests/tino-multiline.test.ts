import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createMotionBrief, defaultCharacterTokens } from "../src/data";
import { measureTextBubble, textBubbleLines } from "../src/services/renderer";
import { appearancePrompt } from "../src/services/character-editing";

describe("custom character types", () => {
  it("ships Tino as an RGBA PNG rather than an opaque JPEG", () => {
    const png = readFileSync(new URL("../src/assets/images/tino.png", import.meta.url));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png[25]).toBe(6);
    const tino = defaultCharacterTokens.find(item => item.id === "default-tino-2d")!;
    expect(tino.referenceImages).toEqual([tino.sourceAsset]);
  });
  it("adds Tino without changing the original default selection", () => {
    expect(defaultCharacterTokens[0].id).toBe("default-penguin-soft3d");
    expect(defaultCharacterTokens.find(item => item.id === "default-tino-2d")).toMatchObject({ name: "티노", category: "기타", subType: "공룡", styleMode: "2D" });
  });
  it("includes custom features in the appearance prompt", () => {
    expect(appearancePrompt("기타", "공룡, 파란 배", "2D", "일러스트")).toContain("공룡, 파란 배");
  });
});

describe("multiline text bubbles", () => {
  it("normalizes line endings and preserves blank lines", () => {
    expect(textBubbleLines("Hello\r\n\r\nWorld\r!")).toEqual(["Hello", "", "World", "!"]);
  });
  it("measures the longest line and grows both render and selection bounds", () => {
    const brief = createMotionBrief("neutral", "#fff", "", "Hello", .5, "test");
    const single = measureTextBubble(brief);
    const multiple = measureTextBubble({ ...brief, shortText: "Hello\nHi" });
    expect(multiple.width).toBe(single.width);
    expect(multiple.bubbleHeight).toBeGreaterThan(single.bubbleHeight);
    expect(multiple.height).toBe(multiple.bubbleHeight);
    const caption = measureTextBubble({ ...brief, shortText: "Hello\n\nWorld" }, "caption");
    expect(caption.height).toBeGreaterThan(caption.bubbleHeight);
    expect(caption.y + caption.height).toBeLessThanOrEqual(1024);
  });
});
