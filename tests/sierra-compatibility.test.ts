import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { roundedRect } from "../src/services/canvas-path";
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve("tailwindcss"))("postcss");
const viewport = require("../scripts/postcss-sierra.cjs");

describe("Sierra rendering compatibility", () => {
  it("renders narrow waveform bars without native roundRect or overlapping corners", () => {
    const context = { moveTo: vi.fn(), lineTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn() };
    roundedRect(context as unknown as CanvasRenderingContext2D, 10, 20, 4, 40, 6);
    expect(context.moveTo).toHaveBeenCalledWith(12, 20);
    expect(context.arcTo).toHaveBeenCalledTimes(4);
    for (const call of context.arcTo.mock.calls) expect(call[4]).toBe(2);
    expect(context.closePath).toHaveBeenCalledOnce();
  });
  it("converts viewport units in declarations AND custom properties without rewriting native definitions", async () => {
    const input = ':root{--emove-svh:1vh;--panel:min(100svh,50dvw)}@supports(height:1svh){:root{--emove-svh:1svh}}.panel{height:calc(100svh - 20px);width:30svw}';
    const result = await postcss([viewport()]).process(input, { from: undefined });
    expect(result.css).toContain('--panel:min(calc(100 * var(--emove-svh)),calc(50 * var(--emove-dvw)))');
    expect(result.css).toContain('height:calc(calc(100 * var(--emove-svh)) - 20px)');
    expect(result.css).toContain('--emove-svh:1svh');
    expect(result.css).not.toContain('--emove-svh:calc');
    const twice = await postcss([viewport()]).process(result.css, { from: undefined });
    expect(twice.css).toBe(result.css);
  });
});
