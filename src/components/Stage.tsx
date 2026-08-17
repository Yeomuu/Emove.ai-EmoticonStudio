import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DESIGN_SIZE, EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { accentEffectBlur, accentEffectOpacity, activeLayer, backgroundEffectBlur, backgroundEffectOpacity, frameImages, layerTransforms, layers, motionBrief, selectedFrame, textBoxShape, textColor, textFont, updateLayerTransform } from "../store";
import { measureCharacterRenderBounds, measureTextBubble, renderFrame, type LayerVisualBounds } from "../services/renderer";
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
  const currentCharacterUrl = frameImages.value[selectedFrame.value] ?? frameImages.value[0] ?? "";
  const [characterBounds, setCharacterBounds] = useState<LayerVisualBounds>(() => scaleRect(selectionRects.character));
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
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    void renderFrame(context, {
      characterUrl: frameImages.value[selectedFrame.value] ?? frameImages.value[0],
      brief: motionBrief.value,
      layers: activePreviewLayers(layers.value, activeLayer.value),
      transforms: layerTransforms.value,
      textShape: textBoxShape.value,
      textFont: textFont.value,
      textColor: textColor.value,
      backgroundEffectStyle: { blur: backgroundEffectBlur.value, opacity: backgroundEffectOpacity.value },
      accentEffectStyle: { blur: accentEffectBlur.value, opacity: accentEffectOpacity.value },
      width: canvas.width,
      height: canvas.height,
      gifSafe: false,
    }, selectedFrame.value / (FRAME_COUNT - 1));
  }, [motionBrief.value, layers.value, layerTransforms.value, frameImages.value, selectedFrame.value, textBoxShape.value, textFont.value, textColor.value, activeLayer.value, backgroundEffectBlur.value, backgroundEffectOpacity.value, accentEffectBlur.value, accentEffectOpacity.value, fontReadyVersion]);

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

  const beginScale = (event: ReactPointerEvent<HTMLElement>, id: LayerKind) => {
    event.preventDefault(); event.stopPropagation(); const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const startX = event.clientX; const startScale = layerTransforms.value[id].scale;
    const move = (next: PointerEvent) => updateLayerTransform(id, { scale: Math.max(.25, Math.min(2.4, startScale + (next.clientX - startX) / 150)) });
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end);
  };

  const beginRotate = (event: ReactPointerEvent<HTMLElement>, id: LayerKind) => {
    event.preventDefault(); event.stopPropagation(); const target = event.currentTarget as HTMLElement; const box = target.parentElement?.getBoundingClientRect(); if (!box) return; target.setPointerCapture(event.pointerId);
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const move = (next: PointerEvent) => updateLayerTransform(id, { rotation: Math.round(Math.atan2(next.clientY - center.y, next.clientX - center.x) * 180 / Math.PI + 90) });
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end);
  };

  return (
    <div className="canvas-artboard" ref={surfaceRef} onPointerDown={clearSelection} aria-label="직접 편집 가능한 이모티콘 캔버스">
      <canvas className="editor-render-canvas" ref={canvasRef} width={EXPORT_SIZE} height={EXPORT_SIZE} />
      {[...layers.value].reverse().map((layer, reverseIndex) => {
        if (!layer.visible) return null;
        if (layer.id === "background-effects") return null;
        if (layer.id === "text" && !motionBrief.value.shortText.trim()) return null;
        const rect = layer.id === "text"
          ? measureTextBubble(motionBrief.value, textBoxShape.value, textFont.value, EXPORT_SIZE, EXPORT_SIZE)
          : layer.id === "character"
            ? characterBounds
            : scaleRect(selectionRects[layer.id]);
        const transform = layerTransforms.value[layer.id];
        const unit = EXPORT_SIZE / DESIGN_SIZE;
        return (
        <div
          key={layer.id}
          data-canvas-layer-id={layer.id}
          className={`canvas-selection ${selectionClassName(layer.id)} ${activeLayer.value === layer.id ? "is-selected" : ""}`}
          style={{
            zIndex: activeLayer.value === layer.id ? 100 : reverseIndex + 2,
            left: `${((rect.x + rect.width / 2 + transform.x * unit) / EXPORT_SIZE) * 100}%`,
            top: `${((rect.y + rect.height / 2 + transform.y * unit) / EXPORT_SIZE) * 100}%`,
            width: `${(rect.width / EXPORT_SIZE) * 100}%`,
            height: `${(rect.height / EXPORT_SIZE) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale})`,
          }}
          onPointerDown={(event) => beginMove(event, layer.id)}
          role="button" tabIndex={0} aria-label={`${layer.label} 레이어 선택 및 이동`}
        >
          {activeLayer.value === layer.id && !layer.locked ? <><i className="selection-rotate" onPointerDown={(event) => beginRotate(event, layer.id)} /><i className="selection-resize" onPointerDown={(event) => beginScale(event, layer.id)} /></> : null}
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
