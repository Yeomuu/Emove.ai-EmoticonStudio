import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DESIGN_SIZE, EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { accentEffectBlur, accentEffectOpacity, activeLayer, backgroundEffectBlur, backgroundEffectOpacity, frameImages, layerTransforms, layers, motionBrief, selectedFrame, textBackgroundColor, textBoxShape, textColor, textFont, updateLayerTransform } from "../store";
import { measureCharacterRenderBounds, measureLayerRenderBounds, measureTextBubble, renderFrame, type LayerVisualBounds } from "../services/renderer";
import type { EditorLayer, LayerKind } from "../types";

const selectionRects: Record<LayerKind, { x: number; y: number; width: number; height: number }> = {
  "background-effects": { x: 18, y: 18, width: 324, height: 324 },
  character: { x: 72, y: 83, width: 216, height: 252 },
  "accent-effects": { x: 42, y: 50, width: 276, height: 260 },
  text: { x: 82, y: 262, width: 196, height: 54 },
};

function scaleRect(rect: { x: number; y: number; width: number; height: number }) {
  const scale = EXPORT_SIZE / DESIGN_SIZE;
  return { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
}

function selectionClassName(id: LayerKind): string {
  return id === "text" ? "selection-text-layer" : `selection-${id}`;
}

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const renderVersionRef = useRef(0);
  const currentCharacterUrl = frameImages.value[selectedFrame.value] ?? frameImages.value[0] ?? "";
  const currentBrief = motionBrief.value;
  const currentBriefKey = JSON.stringify(currentBrief);
  const [characterBounds, setCharacterBounds] = useState<LayerVisualBounds>(() => scaleRect(selectionRects.character));
  const [accentBounds, setAccentBounds] = useState<LayerVisualBounds | null>(() => scaleRect(selectionRects["accent-effects"]));
  const [fontReadyVersion, setFontReadyVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void measureCharacterRenderBounds(currentCharacterUrl, EXPORT_SIZE, EXPORT_SIZE)
      .then((bounds) => {
        if (!cancelled) setCharacterBounds(bounds);
      })
      .catch(() => {
        if (!cancelled) setCharacterBounds(scaleRect(selectionRects.character));
      });
    return () => { cancelled = true; };
  }, [currentCharacterUrl]);

  useEffect(() => {
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) setFontReadyVersion((value) => value + 1);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const progress = selectedFrame.value / (FRAME_COUNT - 1);
    void measureLayerRenderBounds("accent-effects", {
      characterUrl: currentCharacterUrl,
      characterFrames: frameImages.value,
      brief: currentBrief,
      layers: layers.value,
      transforms: layerTransforms.value,
      textShape: textBoxShape.value,
      textFont: textFont.value,
      textColor: textColor.value,
      textBackgroundColor: textBackgroundColor.value,
      backgroundEffectStyle: { blur: backgroundEffectBlur.value, opacity: backgroundEffectOpacity.value },
      accentEffectStyle: { blur: accentEffectBlur.value, opacity: accentEffectOpacity.value },
      width: EXPORT_SIZE,
      height: EXPORT_SIZE,
      gifSafe: false,
    }, progress).then((bounds) => {
      if (!cancelled) setAccentBounds((current) => sameBounds(current, bounds) ? current : bounds);
    }).catch(() => {
      if (!cancelled) setAccentBounds(scaleRect(selectionRects["accent-effects"]));
    });
    return () => { cancelled = true; };
  }, [currentCharacterUrl, currentBriefKey, layers.value, selectedFrame.value, accentEffectBlur.value, accentEffectOpacity.value, fontReadyVersion]);

  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    const version = ++renderVersionRef.current;
    const buffer = document.createElement("canvas");
    buffer.width = canvas.width;
    buffer.height = canvas.height;
    const bufferContext = buffer.getContext("2d");
    if (!bufferContext) return;
    void renderFrame(bufferContext, {
      characterUrl: frameImages.value[selectedFrame.value] ?? frameImages.value[0],
      brief: currentBrief,
      layers: activePreviewLayers(layers.value, activeLayer.value),
      transforms: layerTransforms.value,
      textShape: textBoxShape.value,
      textFont: textFont.value,
      textColor: textColor.value,
      textBackgroundColor: textBackgroundColor.value,
      backgroundEffectStyle: { blur: backgroundEffectBlur.value, opacity: backgroundEffectOpacity.value },
      accentEffectStyle: { blur: accentEffectBlur.value, opacity: accentEffectOpacity.value },
      width: canvas.width,
      height: canvas.height,
      gifSafe: false,
    }, selectedFrame.value / (FRAME_COUNT - 1)).then(() => {
      if (renderVersionRef.current !== version) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(buffer, 0, 0);
    }).catch(() => undefined);
  }, [currentBriefKey, layers.value, layerTransforms.value, frameImages.value, selectedFrame.value, textBoxShape.value, textFont.value, textColor.value, textBackgroundColor.value, activeLayer.value, backgroundEffectBlur.value, backgroundEffectOpacity.value, accentEffectBlur.value, accentEffectOpacity.value, fontReadyVersion]);

  const beginMove = (event: ReactPointerEvent<HTMLElement>, id: LayerKind) => {
    if (layers.value.find((layer) => layer.id === id)?.locked) return;
    event.preventDefault(); event.stopPropagation(); activeLayer.value = id;
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const start = { clientX: event.clientX, clientY: event.clientY, transform: { ...layerTransforms.value[id] } };
    const move = (next: PointerEvent) => {
      const width = surfaceRef.current?.getBoundingClientRect().width ?? DESIGN_SIZE;
      updateLayerTransform(id, { x: start.transform.x + (next.clientX - start.clientX) * DESIGN_SIZE / width, y: start.transform.y + (next.clientY - start.clientY) * DESIGN_SIZE / width });
    };
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
  };

  const clearSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget || event.target === canvasRef.current) activeLayer.value = null;
  };

  const interactionCenter = (id: LayerKind, fallback: DOMRect): { x: number; y: number } => {
    if (id === "text") return { x: fallback.left + fallback.width / 2, y: fallback.top + fallback.height / 2 };
    const surface = surfaceRef.current?.getBoundingClientRect();
    if (!surface) return { x: fallback.left + fallback.width / 2, y: fallback.top + fallback.height / 2 };
    const transform = layerTransforms.value[id];
    return {
      x: surface.left + surface.width / 2 + transform.x * surface.width / DESIGN_SIZE,
      y: surface.top + surface.height / 2 + transform.y * surface.height / DESIGN_SIZE,
    };
  };

  const beginScale = (event: ReactPointerEvent<HTMLElement>, id: LayerKind) => {
    event.preventDefault(); event.stopPropagation(); const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const box = target.parentElement?.getBoundingClientRect();
    if (!box) return;
    const center = interactionCenter(id, box);
    const startDistance = Math.max(12, Math.hypot(event.clientX - center.x, event.clientY - center.y));
    const startScale = layerTransforms.value[id].scale;
    const move = (next: PointerEvent) => {
      const distance = Math.hypot(next.clientX - center.x, next.clientY - center.y);
      updateLayerTransform(id, { scale: Math.max(.25, Math.min(2.4, startScale * distance / startDistance)) });
    };
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
  };

  const beginRotate = (event: ReactPointerEvent<HTMLElement>, id: LayerKind) => {
    event.preventDefault(); event.stopPropagation(); const target = event.currentTarget as HTMLElement; const box = target.parentElement?.getBoundingClientRect(); if (!box) return; target.setPointerCapture(event.pointerId);
    const center = interactionCenter(id, box);
    const move = (next: PointerEvent) => updateLayerTransform(id, { rotation: Math.round(Math.atan2(next.clientY - center.y, next.clientX - center.x) * 180 / Math.PI + 90) });
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
  };

  const handleLayerKey = (event: ReactKeyboardEvent<HTMLDivElement>, id: LayerKind) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activeLayer.value = id;
      return;
    }
    if (!event.key.startsWith("Arrow") || layers.value.find((layer) => layer.id === id)?.locked) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    updateLayerTransform(id, {
      x: layerTransforms.value[id].x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      y: layerTransforms.value[id].y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
    });
  };

  const handleScaleKey = (event: ReactKeyboardEvent<HTMLButtonElement>, id: LayerKind) => {
    if (event.key === "Home") {
      event.preventDefault(); event.stopPropagation(); updateLayerTransform(id, { scale: 1 }); return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1;
    const step = event.shiftKey ? .1 : .025;
    updateLayerTransform(id, { scale: Math.max(.25, Math.min(2.4, layerTransforms.value[id].scale + direction * step)) });
  };

  const handleRotateKey = (event: ReactKeyboardEvent<HTMLButtonElement>, id: LayerKind) => {
    if (event.key === "Home") {
      event.preventDefault(); event.stopPropagation(); updateLayerTransform(id, { rotation: 0 }); return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 15 : 3;
    updateLayerTransform(id, { rotation: layerTransforms.value[id].rotation + (event.key === "ArrowLeft" ? -step : step) });
  };

  return (
    <div className="canvas-artboard" ref={surfaceRef} onPointerDown={clearSelection} aria-label="직접 편집 가능한 이모티콘 캔버스">
      <canvas className="editor-render-canvas" ref={canvasRef} width={EXPORT_SIZE} height={EXPORT_SIZE} />
      {[...layers.value].reverse().map((layer, reverseIndex) => {
        if (!layer.visible) return null;
        if (layer.id === "background-effects") return null;
        if (layer.id === "text" && !currentBrief.shortText.trim()) return null;
        const rect = layer.id === "text"
          ? measureTextBubble(currentBrief, textBoxShape.value, textFont.value, EXPORT_SIZE, EXPORT_SIZE)
          : layer.id === "character"
            ? characterBounds
            : accentBounds;
        if (!rect) return null;
        const transform = layerTransforms.value[layer.id];
        const unit = EXPORT_SIZE / DESIGN_SIZE;
        const usesCanvasPivot = layer.id !== "text";
        const transformOriginX = usesCanvasPivot ? ((EXPORT_SIZE / 2 - rect.x) / rect.width) * 100 : 50;
        const transformOriginY = usesCanvasPivot ? ((EXPORT_SIZE / 2 - rect.y) / rect.height) * 100 : 50;
        return (
        <div
          key={layer.id}
          data-canvas-layer-id={layer.id}
          className={`canvas-selection ${selectionClassName(layer.id)} ${activeLayer.value === layer.id ? "is-selected" : ""}`}
          style={{
            zIndex: activeLayer.value === layer.id ? 100 : reverseIndex + 2,
            left: `${((rect.x + transform.x * unit) / EXPORT_SIZE) * 100}%`,
            top: `${((rect.y + transform.y * unit) / EXPORT_SIZE) * 100}%`,
            width: `${(rect.width / EXPORT_SIZE) * 100}%`,
            height: `${(rect.height / EXPORT_SIZE) * 100}%`,
            transformOrigin: `${transformOriginX}% ${transformOriginY}%`,
            transform: `rotate(${transform.rotation}deg) scale(${transform.scale})`,
            "--selection-handle-inverse-scale": 1 / transform.scale,
            "--selection-rotate-offset": `${31 / transform.scale}px`,
          } as CSSProperties}
          onPointerDown={(event) => beginMove(event, layer.id)}
          onKeyDown={(event) => handleLayerKey(event, layer.id)}
          role="group" tabIndex={0} aria-label={`${layer.label} 레이어 선택 및 이동`}
        >
          {activeLayer.value === layer.id && !layer.locked ? (
            <>
              <button type="button" className="selection-rotate" aria-label={`${layer.label} 레이어 회전`} onPointerDown={(event) => beginRotate(event, layer.id)} onKeyDown={(event) => handleRotateKey(event, layer.id)} />
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  className={`selection-resize is-${corner}`}
                  aria-label={`${layer.label} 레이어 크기 조절`}
                  onPointerDown={(event) => beginScale(event, layer.id)}
                  onKeyDown={(event) => handleScaleKey(event, layer.id)}
                />
              ))}
            </>
          ) : null}
        </div>
      ); })}
    </div>
  );
}

function activePreviewLayers(items: EditorLayer[], active: LayerKind | null): EditorLayer[] {
  if (!active || active === "background-effects") return items;
  const target = items.find((layer) => layer.id === active);
  if (!target) return items;
  return [target, ...items.filter((layer) => layer.id !== active)];
}

function sameBounds(left: LayerVisualBounds | null, right: LayerVisualBounds | null): boolean {
  if (!left || !right) return left === right;
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}
