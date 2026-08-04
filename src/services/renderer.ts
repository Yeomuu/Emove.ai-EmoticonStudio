import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { DESIGN_SIZE, EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { emotionMeta } from "../emotion-taxonomy";
import starIcon from "../assets/icons/star.svg";
import type { AnimationFormat, EditorLayer, LayerKind, LayerTransform, MotionBrief, TextBoxShape, TextFont } from "../types";

export interface RenderOptions {
  characterUrl: string;
  characterFrames?: string[];
  brief: MotionBrief;
  layers: EditorLayer[];
  transforms: Record<LayerKind, LayerTransform>;
  frameTransforms?: Array<Record<LayerKind, LayerTransform>>;
  textShape?: TextBoxShape;
  textFont?: TextFont;
  width?: number;
  height?: number;
  gifSafe?: boolean;
}

export interface TextBubbleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  bubbleHeight: number;
}

export interface ExportedAnimation {
  blob: Blob;
  format: AnimationFormat;
  extension: "apng" | "gif" | "webp";
  mimeType: "image/apng" | "image/gif" | "image/webp";
  label: string;
}

const imageCache = new Map<string, HTMLImageElement>();
const visibleBoundsCache = new Map<string, ImageBounds>();
const tintedIconCache = new Map<string, HTMLCanvasElement>();
const accentStarUrl = typeof starIcon === "string" ? starIcon : starIcon.src;
const GIF_ALPHA_THRESHOLD = 96;
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

interface ImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url); if (cached) return cached;
  const image = new Image(); image.decoding = "async"; image.crossOrigin = "anonymous"; image.src = url; await image.decode(); imageCache.set(url, image); return image;
}

export async function renderFrame(context: CanvasRenderingContext2D, options: RenderOptions, frameProgress = 0): Promise<void> {
  const width = options.width ?? context.canvas.width; const height = options.height ?? context.canvas.height;
  context.clearRect(0, 0, width, height);
  for (const layer of [...options.layers].reverse()) {
    if (!layer.visible) continue;
    await drawLayer(context, layer.id, options, width, height, frameProgress);
  }
  if (options.gifSafe) applyGifPalettePreview(context, width, height);
}

async function drawLayer(context: CanvasRenderingContext2D, id: LayerKind, options: RenderOptions, width: number, height: number, progress: number): Promise<void> {
  const transform = options.transforms[id]; const unit = width / DESIGN_SIZE;
  if (id === "text") {
    drawTextLayer(context, options, width, height, transform);
    return;
  }
  context.save();
  context.translate(width / 2 + transform.x * unit, height / 2 + transform.y * unit);
  context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scale, transform.scale); context.translate(-width / 2, -height / 2);
  if (id === "background-effects") {
    drawEmotionBackground(context, options.brief, width, height, progress);
  } else if (id === "character") {
    const frameIndex = Math.min((options.characterFrames?.length ?? 1) - 1, Math.max(0, Math.round(progress * ((options.characterFrames?.length ?? 1) - 1))));
    const source = options.characterFrames?.[frameIndex] ?? options.characterUrl;
    if (!source) {
      context.restore();
      return;
    }
    const image = await loadImage(source);
    const bounds = getVisibleImageBounds(image, source);
    const fit = Math.min((width * .66) / bounds.width, (height * .74) / bounds.height);
    const targetWidth = bounds.width * fit;
    const targetHeight = bounds.height * fit;
    context.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      (width - targetWidth) / 2,
      height * .82 - targetHeight / 2,
      targetWidth,
      targetHeight,
    );
  } else if (id === "accent-effects") {
    await drawAccentEffect(context, options.brief, width, height, progress, unit);
  }
  context.restore();
}

function getVisibleImageBounds(image: HTMLImageElement, cacheKey: string): ImageBounds {
  const cached = visibleBoundsCache.get(cacheKey);
  if (cached) return cached;

  const fallback = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  try {
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 256 / longestSide);
    const sampleWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const sampleHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let minX = sampleWidth;
    let minY = sampleHeight;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        if (pixels[(y * sampleWidth + x) * 4 + 3] <= 20) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return fallback;
    const padding = 2;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(sampleWidth - 1, maxX + padding);
    maxY = Math.min(sampleHeight - 1, maxY + padding);
    const bounds = {
      x: minX / scale,
      y: minY / scale,
      width: (maxX - minX + 1) / scale,
      height: (maxY - minY + 1) / scale,
    };
    visibleBoundsCache.set(cacheKey, bounds);
    return bounds;
  } catch {
    visibleBoundsCache.set(cacheKey, fallback);
    return fallback;
  }
}

function drawTextLayer(context: CanvasRenderingContext2D, options: RenderOptions, width: number, height: number, transform: LayerTransform): void {
  if (!options.brief.shortText.trim()) return;
  const bounds = measureTextBubble(options.brief, options.textShape, options.textFont, width, height);
  const unit = width / DESIGN_SIZE;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  context.save();
  context.translate(centerX + transform.x * unit, centerY + transform.y * unit);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.scale, transform.scale);
  context.translate(-centerX, -centerY);
  drawTextBubble(context, options, width, height, bounds);
  context.restore();
}

function drawTextBubble(context: CanvasRenderingContext2D, options: RenderOptions, width: number, _height: number, bounds: TextBubbleBounds): void {
  const unit = width / DESIGN_SIZE;
  const fontFamily = options.textFont === "Paperlogy" ? "Paperlogy" : "Pretendard";
  const shape = options.textShape ?? "pill";
  context.font = `700 ${Math.max(25, width * (fontFamily === "Paperlogy" ? .048 : .05))}px ${fontFamily}, Pretendard, sans-serif`;
  context.textAlign = "center"; context.textBaseline = "middle";
  const text = options.brief.shortText; const bubbleWidth = bounds.width; const bubbleHeight = bounds.bubbleHeight; const x = bounds.x; const y = bounds.y;
  const bubbleCenterX = x + bubbleWidth / 2;
  context.beginPath();
  if (shape === "caption") {
    context.roundRect(x, y, bubbleWidth, bubbleHeight, 14 * unit);
    context.moveTo(bubbleCenterX - 12 * unit, y + bubbleHeight - 1);
    context.lineTo(bubbleCenterX, y + bubbleHeight + 14 * unit);
    context.lineTo(bubbleCenterX + 12 * unit, y + bubbleHeight - 1);
    context.closePath();
  } else {
    context.roundRect(x, y, bubbleWidth, bubbleHeight, shape === "pill" ? bubbleHeight / 2 : 16 * unit);
  }
  context.fillStyle = "rgba(252,252,252,.96)"; context.fill();
  context.fillStyle = "#201E28"; context.fillText(text, bubbleCenterX, y + bubbleHeight / 2 + 1, bubbleWidth - 36 * unit);
}

export function measureTextBubble(brief: MotionBrief, shape: TextBoxShape = "pill", textFont: TextFont = "Pretendard", width = DESIGN_SIZE, height = DESIGN_SIZE): TextBubbleBounds {
  const unit = width / DESIGN_SIZE;
  const fontFamily = textFont === "Paperlogy" ? "Paperlogy" : "Pretendard";
  const fontSize = Math.max(25, width * (fontFamily === "Paperlogy" ? .048 : .05));
  const textWidth = measureTextWidth(brief.shortText, `700 ${fontSize}px ${fontFamily}, Pretendard, sans-serif`);
  const bubbleWidth = Math.min(width * .84, textWidth + 64 * unit);
  const bubbleHeight = Math.max(54 * unit, width * .098);
  const tail = shape === "caption" ? 14 * unit : 0;
  return { x: width / 2 - bubbleWidth / 2, y: height * .73, width: bubbleWidth, height: bubbleHeight + tail, bubbleHeight };
}

function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return Math.max(48, text.length * 15);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return Math.max(48, text.length * 15);
  context.font = font;
  return context.measureText(text).width;
}

function drawEmotionBackground(context: CanvasRenderingContext2D, brief: MotionBrief, width: number, height: number, progress: number): void {
  const meta = emotionMeta[brief.emotion];
  const color = meta.color;
  const unit = width / DESIGN_SIZE;
  const pulse = .82 + Math.sin(progress * Math.PI * 2) * .18;
  const radius = width * (.3 + brief.motionIntensity * .13) * pulse;
  const gradient = context.createRadialGradient(width * .5, height * .5, 4, width * .5, height * .51, radius);
  gradient.addColorStop(0, withAlpha(color, 0x72));
  gradient.addColorStop(.5, withAlpha(color, 0x26));
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  if (brief.emotion === "happiness") drawHeartGlow(context, color, width, height, progress, unit);
  else if (brief.emotion === "joy") drawBurst(context, color, width, height, progress, unit);
  else if (brief.emotion === "admiration") drawShineRays(context, color, width, height, progress, unit);
  else if (brief.emotion === "neutral") drawSoftGlow(context, color, width, height, progress, unit);
  else if (brief.emotion === "surprise") drawImpactLines(context, color, width, height, progress, unit);
  else if (brief.emotion === "tension") drawPulseWave(context, color, width, height, progress, unit);
  else if (brief.emotion === "sadness") drawRainDrops(context, color, width, height, progress, unit);
  else if (brief.emotion === "anger") drawFlameBursts(context, color, width, height, progress, unit);
  else drawNoiseWave(context, color, width, height, progress, unit);
}

async function drawAccentEffect(context: CanvasRenderingContext2D, brief: MotionBrief, width: number, height: number, progress: number, unit: number): Promise<void> {
  const preset = brief.accentEffect ?? "sparkles";
  if (preset === "none") return;
  const color = brief.accentColor ?? emotionMeta[brief.emotion].color;
  if (preset === "hearts") {
    context.save();
    context.fillStyle = withAlpha(color, 0xd4);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8 + progress * .08) * Math.PI * 2;
      const radius = width * (.22 + (index % 3) * .035);
      const size = (10 + (index % 3) * 4) * unit;
      context.globalAlpha = .6 + (index % 3) * .12;
      drawHeartPath(context, width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius * .72, size);
      context.fill();
    }
    context.restore();
    return;
  }
  if (preset === "motion-lines") {
    context.save();
    context.strokeStyle = withAlpha(color, 0xd8);
    context.lineCap = "round";
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2 + progress * .18;
      const inner = width * (.2 + (index % 2) * .02);
      const outer = width * (.28 + (index % 3) * .025);
      context.globalAlpha = .45 + (index % 4) * .1;
      context.lineWidth = (1.5 + index % 2) * unit;
      context.beginPath();
      context.moveTo(width / 2 + Math.cos(angle) * inner, height / 2 + Math.sin(angle) * inner * .72);
      context.lineTo(width / 2 + Math.cos(angle) * outer, height / 2 + Math.sin(angle) * outer * .72);
      context.stroke();
    }
    context.restore();
    return;
  }
  const star = await loadTintedIcon(accentStarUrl, color);
  const count = preset === "stars" ? 7 : 12;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count + progress * .05) * Math.PI * 2;
    const radius = width * (.22 + index % 3 * .035);
    const size = (preset === "stars" ? 18 : 11) + index % 4 * 4;
    context.globalAlpha = .58 + (index % 3) * .14;
    context.drawImage(star, width / 2 + Math.cos(angle) * radius - size * unit / 2, height / 2 + Math.sin(angle) * radius * .7 - size * unit / 2, size * unit, size * unit);
  }
}

function drawHeartGlow(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number): void {
  context.save();
  context.fillStyle = withAlpha(color, 0xc8);
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10 + progress * .1) * Math.PI * 2;
    const radius = width * (.15 + (index % 4) * .04);
    const size = (7 + (index % 3) * 4) * unit;
    context.globalAlpha = .3 + (index % 4) * .12;
    drawHeartPath(context, width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius * .72, size);
    context.fill();
  }
  context.restore();
}

function drawHeartPath(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.beginPath();
  context.moveTo(x, y + size * .35);
  context.bezierCurveTo(x - size * 1.15, y - size * .35, x - size * .55, y - size * 1.15, x, y - size * .48);
  context.bezierCurveTo(x + size * .55, y - size * 1.15, x + size * 1.15, y - size * .35, x, y + size * .35);
  context.closePath();
}

function drawBurst(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number): void {
  context.save();
  context.strokeStyle = withAlpha(color, 0xd0);
  context.lineCap = "round";
  const expansion = .92 + Math.sin(progress * Math.PI * 2) * .08;
  for (let index = 0; index < 18; index += 1) {
    const angle = index / 18 * Math.PI * 2;
    const inner = width * (.13 + (index % 3) * .012);
    const outer = width * (.25 + (index % 4) * .025) * expansion;
    context.globalAlpha = .25 + (index % 4) * .12;
    context.lineWidth = (1.4 + index % 3 * .5) * unit;
    context.beginPath();
    context.moveTo(width / 2 + Math.cos(angle) * inner, height / 2 + Math.sin(angle) * inner * .76);
    context.lineTo(width / 2 + Math.cos(angle) * outer, height / 2 + Math.sin(angle) * outer * .76);
    context.stroke();
  }
  context.restore();
  drawSoftParticles(context, color, width, height, progress, unit, 14);
}

function drawShineRays(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number): void {
  context.save();
  const rise = Math.sin(progress * Math.PI * 2) * height * .015;
  context.strokeStyle = withAlpha(color, 0xc8);
  context.lineCap = "round";
  for (let index = 0; index < 9; index += 1) {
    const x = width * (.2 + index * .075);
    const top = height * (.18 + (index % 4) * .055) + rise;
    const bottom = height * (.76 - (index % 3) * .035);
    context.globalAlpha = .18 + (index % 4) * .11;
    context.lineWidth = (1 + index % 3 * .7) * unit;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
    const y = top + (bottom - top) * ((progress + index * .13) % 1);
    context.globalAlpha = .75;
    context.beginPath();
    context.moveTo(x - 5 * unit, y); context.lineTo(x + 5 * unit, y);
    context.moveTo(x, y - 5 * unit); context.lineTo(x, y + 5 * unit);
    context.stroke();
  }
  context.restore();
}

function drawSoftGlow(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number): void {
  drawRings(context, color, width, height, progress * .35, unit, false, .6);
  drawSoftParticles(context, color, width, height, progress * .35, unit, 7, .7);
}

function drawImpactLines(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number): void {
  context.save();
  context.strokeStyle = withAlpha(color, 0xe0);
  context.lineCap = "round";
  const impact = .9 + Math.sin(progress * Math.PI * 2) * .1;
  for (let index = 0; index < 14; index += 1) {
    const angle = index / 14 * Math.PI * 2;
    const inner = width * (.18 + (index % 2) * .02);
    const outer = width * (.29 + (index % 4) * .022) * impact;
    context.globalAlpha = .3 + (index % 3) * .2;
    context.lineWidth = (1.5 + index % 2) * unit;
    context.beginPath();
    const x1 = width / 2 + Math.cos(angle) * inner;
    const y1 = height / 2 + Math.sin(angle) * inner * .75;
    const x2 = width / 2 + Math.cos(angle) * outer;
    const y2 = height / 2 + Math.sin(angle) * outer * .75;
    context.moveTo(x1, y1);
    context.lineTo((x1 + x2) / 2 + Math.sin(angle) * 3 * unit, (y1 + y2) / 2 - Math.cos(angle) * 3 * unit);
    context.lineTo(x2, y2);
    context.stroke();
  }
  context.restore();
}

function drawPulseWave(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number): void {
  drawRings(context, color, width, height, progress, unit, false, .75);
  context.save();
  context.strokeStyle = withAlpha(color, 0xc0);
  context.lineWidth = 2 * unit;
  context.lineCap = "round";
  for (let row = 0; row < 3; row += 1) {
    const y = height * (.4 + row * .1);
    context.globalAlpha = .2 + row * .12;
    context.beginPath();
    for (let step = 0; step <= 40; step += 1) {
      const x = width * (.18 + step / 40 * .64);
      const wave = Math.sin(step * .65 + progress * Math.PI * 2 + row) * (5 + row * 2) * unit;
      if (step === 0) context.moveTo(x, y + wave); else context.lineTo(x, y + wave);
    }
    context.stroke();
  }
  context.restore();
}

function drawNoiseWave(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number): void {
  context.save();
  context.strokeStyle = withAlpha(color, 0xb8);
  context.lineCap = "round";
  for (let row = 0; row < 5; row += 1) {
    const y = height * (.3 + row * .1);
    context.globalAlpha = .16 + row * .07;
    context.lineWidth = (1.3 + row % 2) * unit;
    context.beginPath();
    for (let step = 0; step <= 48; step += 1) {
      const x = width * (.17 + step / 48 * .66);
      const irregular = Math.sin(step * .72 + progress * Math.PI * 2 + row * 1.7) * 5 + Math.sin(step * 1.83 - progress * Math.PI * 4) * 2.5;
      if (step === 0) context.moveTo(x, y + irregular * unit); else context.lineTo(x, y + irregular * unit);
    }
    context.stroke();
  }
  context.restore();
  drawRings(context, color, width, height, progress, unit, true, .45);
}

function withAlpha(color: string, alpha: number): string {
  return `${color}${Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, "0")}`;
}

function drawSoftParticles(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number, count: number, opacity = 1): void {
  context.save();
  context.fillStyle = `${color}8c`;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count + progress * .24) * Math.PI * 2;
    const distance = width * (.2 + (index % 4) * .035);
    const x = width / 2 + Math.cos(angle) * distance;
    const y = height / 2 + Math.sin(angle) * distance * .68;
    const size = (2.8 + (index % 3) * 1.8) * unit;
    context.globalAlpha = (.38 + (index % 3) * .14) * opacity;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawRings(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number, nervous: boolean, opacity = 1): void {
  context.save();
  context.strokeStyle = `${color}a8`;
  context.lineWidth = 2 * unit;
  for (let index = 0; index < 3; index += 1) {
    const offset = (progress + index / 3) % 1;
    const radius = width * (.14 + offset * .28);
    context.globalAlpha = (nervous ? .36 * (1 - offset) : .58 * (1 - offset)) * opacity;
    context.beginPath();
    context.ellipse(width / 2, height / 2, radius, radius * .72, nervous ? Math.sin(progress * 8) * .12 : 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawRainDrops(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number, opacity = 1): void {
  context.save();
  context.strokeStyle = `${color}96`;
  context.lineCap = "round";
  context.lineWidth = 2 * unit;
  for (let index = 0; index < 8; index += 1) {
    const x = width * (.22 + (index % 4) * .16);
    const y = height * (.18 + ((progress + index * .13) % 1) * .56);
    context.globalAlpha = (.26 + (index % 3) * .1) * opacity;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 4 * unit, y + 16 * unit);
    context.stroke();
  }
  context.restore();
}

function drawFlameBursts(context: CanvasRenderingContext2D, color: string, width: number, height: number, progress: number, unit: number, opacity = 1): void {
  context.save();
  context.strokeStyle = `${color}a0`;
  context.lineWidth = 3 * unit;
  context.lineCap = "round";
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2 + progress * .6;
    const inner = width * .16;
    const outer = width * (.26 + (index % 3) * .035);
    context.globalAlpha = (.22 + (index % 4) * .08) * opacity;
    context.beginPath();
    context.moveTo(width / 2 + Math.cos(angle) * inner, height / 2 + Math.sin(angle) * inner * .75);
    context.lineTo(width / 2 + Math.cos(angle) * outer, height / 2 + Math.sin(angle) * outer * .75);
    context.stroke();
  }
  context.restore();
}

export async function exportGif(options: RenderOptions): Promise<Blob> {
  const width = options.width ?? EXPORT_SIZE; const height = options.height ?? EXPORT_SIZE; const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("Canvas 2D를 사용할 수 없습니다.");
  const frameCount = FRAME_COUNT; const frames: Uint8ClampedArray[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    await renderFrame(context, { ...options, transforms: options.frameTransforms?.[frame] ?? options.transforms, width, height }, frame / (frameCount - 1));
    frames.push(context.getImageData(0, 0, width, height).data.slice());
  }
  return encodeGifFrames(frames, width, height, options.brief.frameDelayMs);
}

export async function exportAnimation(options: RenderOptions, preferred: AnimationFormat = "APNG"): Promise<ExportedAnimation> {
  if (preferred === "APNG") {
    try {
      return { blob: await exportApng(options), format: "APNG", extension: "apng", mimeType: "image/apng", label: "투명 APNG" };
    } catch (error) {
      console.warn("APNG export failed, falling back to GIF.", error);
    }
  }
  return { blob: await exportGif(options), format: "GIF", extension: "gif", mimeType: "image/gif", label: "투명 GIF" };
}

export async function exportApng(options: RenderOptions): Promise<Blob> {
  const width = options.width ?? EXPORT_SIZE; const height = options.height ?? EXPORT_SIZE; const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("Canvas 2D를 사용할 수 없습니다.");
  const pngFrames: Uint8Array[] = [];
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    await renderFrame(context, { ...options, transforms: options.frameTransforms?.[frame] ?? options.transforms, width, height, gifSafe: false }, frame / (FRAME_COUNT - 1));
    const buffer = await canvasToBlob(canvas, "image/png").then((blob) => blob.arrayBuffer());
    pngFrames.push(new Uint8Array(buffer));
  }
  return encodeApngPngFrames(pngFrames, options.brief.frameDelayMs);
}

export async function renderFrameDataUrl(options: RenderOptions, frame = 0): Promise<string> {
  const width = options.width ?? EXPORT_SIZE; const height = options.height ?? EXPORT_SIZE; const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("Canvas 2D를 사용할 수 없습니다.");
  await renderFrame(context, { ...options, transforms: options.frameTransforms?.[frame] ?? options.transforms, width, height, gifSafe: options.gifSafe ?? false }, FRAME_COUNT > 1 ? frame / (FRAME_COUNT - 1) : 0);
  return canvas.toDataURL("image/png");
}

export function encodeGifFrames(frames: Uint8ClampedArray[], width: number, height: number, delay = 100): Blob {
  if (!frames.length) throw new Error("GIF 프레임이 없습니다.");
  const gif = GIFEncoder();
  frames.forEach((rgba) => {
    const frame = createGifPaletteFrame(rgba, width, height);
    gif.writeFrame(frame.indexed, width, height, { palette: frame.palette, delay, repeat: 0, transparent: frame.transparentIndex >= 0, transparentIndex: Math.max(0, frame.transparentIndex), dispose: 2 });
  });
  gif.finish(); const bytes = gif.bytesView(); const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return new Blob([toArrayBuffer(copy)], { type: "image/gif" });
}

export function downloadBlob(blob: Blob, filename: string): void { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

async function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("프레임 PNG를 만들 수 없습니다.")), type);
  });
}

type ParsedPngFrame = {
  ihdr: Uint8Array;
  idats: Uint8Array[];
  width: number;
  height: number;
};

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let crcTable: Uint32Array | null = null;

export function encodeApngPngFrames(frames: Uint8Array[], delayMs = 100): Blob {
  if (!frames.length) throw new Error("APNG 프레임이 없습니다.");
  const parsed = frames.map(parsePngFrame);
  const first = parsed[0];
  if (!first) throw new Error("APNG 첫 프레임을 읽을 수 없습니다.");
  parsed.forEach((frame) => {
    if (frame.width !== first.width || frame.height !== first.height) throw new Error("APNG 프레임 크기가 서로 다릅니다.");
  });

  const chunks: Uint8Array[] = [PNG_SIGNATURE, createPngChunk("IHDR", first.ihdr)];
  chunks.push(createPngChunk("acTL", createActlChunk(parsed.length, 0)));
  let sequence = 0;
  chunks.push(createPngChunk("fcTL", createFctlChunk(sequence, first.width, first.height, delayMs)));
  sequence += 1;
  first.idats.forEach((data) => chunks.push(createPngChunk("IDAT", data)));
  parsed.slice(1).forEach((frame) => {
    chunks.push(createPngChunk("fcTL", createFctlChunk(sequence, frame.width, frame.height, delayMs)));
    sequence += 1;
    frame.idats.forEach((data) => {
      const fdat = new Uint8Array(data.length + 4);
      writeUint32(fdat, 0, sequence);
      fdat.set(data, 4);
      chunks.push(createPngChunk("fdAT", fdat));
      sequence += 1;
    });
  });
  chunks.push(createPngChunk("IEND", new Uint8Array()));
  return new Blob([toArrayBuffer(concatUint8(chunks))], { type: "image/apng" });
}

function parsePngFrame(data: Uint8Array): ParsedPngFrame {
  if (data.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((value, index) => data[index] === value)) {
    throw new Error("PNG 프레임 형식이 아닙니다.");
  }
  let offset = PNG_SIGNATURE.length;
  let ihdr: Uint8Array | null = null;
  const idats: Uint8Array[] = [];
  while (offset + 12 <= data.length) {
    const length = readUint32(data, offset);
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > data.length) throw new Error("PNG 청크가 손상되었습니다.");
    const chunkData = data.slice(start, end);
    if (type === "IHDR") ihdr = chunkData;
    else if (type === "IDAT") idats.push(chunkData);
    else if (type === "IEND") break;
    offset = end + 4;
  }
  if (!ihdr || !idats.length) throw new Error("PNG 프레임에서 이미지 데이터를 찾지 못했습니다.");
  return { ihdr, idats, width: readUint32(ihdr, 0), height: readUint32(ihdr, 4) };
}

function createActlChunk(frameCount: number, playCount: number): Uint8Array {
  const data = new Uint8Array(8);
  writeUint32(data, 0, frameCount);
  writeUint32(data, 4, playCount);
  return data;
}

function createFctlChunk(sequence: number, width: number, height: number, delayMs: number): Uint8Array {
  const data = new Uint8Array(26);
  writeUint32(data, 0, sequence);
  writeUint32(data, 4, width);
  writeUint32(data, 8, height);
  writeUint32(data, 12, 0);
  writeUint32(data, 16, 0);
  writeUint16(data, 20, Math.max(1, Math.min(65535, Math.round(delayMs))));
  writeUint16(data, 22, 1000);
  data[24] = 0;
  data[25] = 0;
  return data;
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((char) => char.charCodeAt(0)));
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.length, crc32(concatUint8([typeBytes, data])));
  return chunk;
}

function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function writeUint32(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

function writeUint16(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 8) & 0xff;
  data[offset + 1] = value & 0xff;
}

function concatUint8(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = table[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

async function loadTintedIcon(url: string, color: string): Promise<HTMLCanvasElement> {
  const key = `${url}-${color}`; const cached = tintedIconCache.get(key); if (cached) return cached;
  const icon = await loadImage(url); const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const context = canvas.getContext("2d"); if (!context) throw new Error("아이콘을 합성할 수 없습니다.");
  context.drawImage(icon, 0, 0, 64, 64); context.globalCompositeOperation = "source-in"; context.fillStyle = color; context.fillRect(0, 0, 64, 64); tintedIconCache.set(key, canvas); return canvas;
}

function applyGifPalettePreview(context: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = context.getImageData(0, 0, width, height);
  imageData.data.set(createGifPaletteFrame(imageData.data, width, height).preview);
  context.putImageData(imageData, 0, 0);
}

function createGifPaletteFrame(source: Uint8ClampedArray, width: number, height: number): { indexed: Uint8Array; palette: number[][]; transparentIndex: number; preview: Uint8ClampedArray } {
  const prepared = normalizeGifAlpha(source, width, height);
  const hasTransparency = hasTransparentPixels(prepared);
  const palette = quantize(prepared, 256, { format: "rgba4444", oneBitAlpha: GIF_ALPHA_THRESHOLD, clearAlpha: true, clearAlphaThreshold: GIF_ALPHA_THRESHOLD, clearAlphaColor: 0 });
  let transparentIndex = hasTransparency ? palette.findIndex((color) => (color[3] ?? 255) === 0) : -1;
  if (hasTransparency && transparentIndex < 0) {
    transparentIndex = palette.length < 256 ? palette.push([0, 0, 0, 0]) - 1 : 0;
    palette[transparentIndex] = [0, 0, 0, 0];
  }
  const indexed = applyPalette(prepared, palette, "rgba4444");
  if (transparentIndex >= 0) forceTransparentIndex(prepared, indexed, transparentIndex);
  return { indexed, palette, transparentIndex, preview: indexedToRgba(indexed, palette) };
}

function normalizeGifAlpha(source: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cursor = (y * width + x) * 4;
      const alpha = output[cursor + 3];
      if (alpha <= GIF_ALPHA_THRESHOLD || (alpha < 255 && shouldDitherTransparent(alpha, x, y))) {
        output[cursor] = 0; output[cursor + 1] = 0; output[cursor + 2] = 0; output[cursor + 3] = 0;
      } else {
        output[cursor + 3] = 255;
      }
    }
  }
  return output;
}

function shouldDitherTransparent(alpha: number, x: number, y: number): boolean {
  const threshold = (BAYER_4X4[(y % 4) * 4 + (x % 4)] + .5) / 16;
  return alpha / 255 < threshold;
}

function hasTransparentPixels(frame: Uint8ClampedArray): boolean {
  for (let index = 3; index < frame.length; index += 4) if (frame[index] === 0) return true;
  return false;
}

function forceTransparentIndex(frame: Uint8ClampedArray, indexed: Uint8Array, transparentIndex: number): void {
  for (let pixel = 0; pixel < indexed.length; pixel += 1) if (frame[pixel * 4 + 3] === 0) indexed[pixel] = transparentIndex;
}

function indexedToRgba(indexed: Uint8Array, palette: number[][]): Uint8ClampedArray {
  const output = new Uint8ClampedArray(indexed.length * 4);
  indexed.forEach((paletteIndex, pixel) => {
    const color = palette[paletteIndex] ?? [0, 0, 0, 0];
    const cursor = pixel * 4;
    output[cursor] = color[0] ?? 0; output[cursor + 1] = color[1] ?? 0; output[cursor + 2] = color[2] ?? 0; output[cursor + 3] = color[3] ?? 255;
  });
  return output;
}
