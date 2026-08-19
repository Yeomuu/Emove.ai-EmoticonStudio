export const COLOR_PICKER_SWATCHES = [
  "#E3ABEC", "#C2DBF7", "#9FD6FF", "#9DE7DA", "#9DF0C0", "#FFF099", "#FED49A",
  "#D073E0", "#86BAF3", "#5EBBFF", "#44D8BE", "#3BE282", "#FFE654", "#FFB758",
  "#BD35BD", "#5779C1", "#3E8EDE", "#00AEA9", "#3CBA4C", "#F5BC25", "#F99221",
  "#580D8C", "#001970", "#0A2399", "#0B7477", "#0B6B50", "#B67E11", "#B85D0D",
] as const;

export const DEFAULT_TEXT_COLOR = "#201E28";
export const DEFAULT_TEXT_BACKGROUND_COLOR = "#FFC96F";
export const LEGACY_TEXT_BACKGROUND_COLOR = "#FCFCFC";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export function normalizePickerHex(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  const expanded = /^#[0-9A-F]{3}$/.test(normalized)
    ? `#${normalized.slice(1).split("").map((digit) => `${digit}${digit}`).join("")}`
    : normalized;
  return /^#[0-9A-F]{6}$/.test(expanded) ? expanded : null;
}

export function hexToRgb(value: string): RgbColor {
  const normalized = normalizePickerHex(value) ?? "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const channel = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

export function hexToHsv(value: string): HsvColor {
  const { r, g, b } = hexToRgb(value);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return {
    h: hue,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * saturation;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) [red, green, blue] = [chroma, x, 0];
  else if (section < 2) [red, green, blue] = [x, chroma, 0];
  else if (section < 3) [red, green, blue] = [0, chroma, x];
  else if (section < 4) [red, green, blue] = [0, x, chroma];
  else if (section < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return rgbToHex({
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255,
  });
}

export function buildPaletteSwatches(colors: readonly string[]): string[] {
  const normalized = colors
    .map((color) => normalizePickerHex(color))
    .filter((color): color is string => Boolean(color));
  if (!normalized.length) return [...COLOR_PICKER_SWATCHES];

  const columns = Array.from({ length: 7 }, (_, index) => {
    const position = normalized.length === 1 ? 0 : index * (normalized.length - 1) / 6;
    const lower = Math.floor(position);
    const upper = Math.min(normalized.length - 1, Math.ceil(position));
    const mix = position - lower;
    const from = hexToRgb(normalized[lower]);
    const to = hexToRgb(normalized[upper]);
    return rgbToHex({
      r: from.r + (to.r - from.r) * mix,
      g: from.g + (to.g - from.g) * mix,
      b: from.b + (to.b - from.b) * mix,
    });
  });

  const rows = [
    { saturation: .52, value: 1.08 },
    { saturation: .76, value: .98 },
    { saturation: .94, value: .82 },
    { saturation: 1.06, value: .62 },
  ];

  return rows.flatMap((row) => columns.map((color) => {
    const hsv = hexToHsv(color);
    return hsvToHex({ h: hsv.h, s: hsv.s * row.saturation, v: hsv.v * row.value });
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
