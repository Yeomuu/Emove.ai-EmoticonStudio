import { describe, expect, it } from "vitest";
import { buildPaletteSwatches, hexToHsv, hexToRgb, hsvToHex, normalizePickerHex, rgbToHex } from "./color-picker";

describe("color picker conversions", () => {
  it("normalizes three and six digit hex colors", () => {
    expect(normalizePickerHex("#abc")).toBe("#AABBCC");
    expect(normalizePickerHex("#12ef90")).toBe("#12EF90");
    expect(normalizePickerHex("not-a-color")).toBeNull();
  });

  it("round-trips RGB and HEX values", () => {
    expect(hexToRgb("#44D8BE")).toEqual({ r: 68, g: 216, b: 190 });
    expect(rgbToHex({ r: 68, g: 216, b: 190 })).toBe("#44D8BE");
  });

  it("round-trips representative HSV colors", () => {
    for (const color of ["#FF0000", "#44D8BE", "#580D8C", "#FFFFFF", "#000000"]) {
      expect(hsvToHex(hexToHsv(color))).toBe(color);
    }
  });

  it("builds a 7 by 4 tone grid from the selected character palette", () => {
    const colors = buildPaletteSwatches(["#BDB2FF", "#9FF3DC", "#FFC8D2", "#FFF0A8", "#B8D8FF"]);
    expect(colors).toHaveLength(28);
    expect(new Set(colors).size).toBeGreaterThan(14);
    expect(colors.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
  });
});
