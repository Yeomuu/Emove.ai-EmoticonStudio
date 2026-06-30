import { useEffect, useRef } from "preact/hooks";
import { DESIGN_SIZE, EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { activeLayer, coreEffectImage, frameImages, layerTransforms, layers, motionBrief, selectedFrame, textBoxShape, textFont, updateLayerTransform } from "../store";
import { measureTextBubble, renderFrame } from "../services/renderer";
import type { LayerKind } from "../types";

const selectionRects: Record<LayerKind, { x: number; y: number; width: number; height: number }> = {
  "background-effects": { x: 18, y: 18, width: 324, height: 324 },
  character: { x: 72, y: 66, width: 216, height: 224 },
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

  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    void renderFrame(context, { characterUrl: frameImages.value[selectedFrame.value] ?? frameImages.value[0], coreEffectUrl: coreEffectImage.value, brief: motionBrief.value, layers: layers.value, transforms: layerTransforms.value, textShape: textBoxShape.value, textFont: textFont.value, width: canvas.width, height: canvas.height, gifSafe: true }, selectedFrame.value / (FRAME_COUNT - 1));
  }, [motionBrief.value, layers.value, layerTransforms.value, frameImages.value, selectedFrame.value, textBoxShape.value, textFont.value, coreEffectImage.value]);

  const beginMove = (event: PointerEvent, id: LayerKind) => {
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

  const beginScale = (event: PointerEvent, id: LayerKind) => {
    event.preventDefault(); event.stopPropagation(); const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const startX = event.clientX; const startScale = layerTransforms.value[id].scale;
    const move = (next: PointerEvent) => updateLayerTransform(id, { scale: Math.max(.25, Math.min(2.4, startScale + (next.clientX - startX) / 150)) });
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end);
  };

  const beginRotate = (event: PointerEvent, id: LayerKind) => {
    event.preventDefault(); event.stopPropagation(); const target = event.currentTarget as HTMLElement; const box = target.parentElement?.getBoundingClientRect(); if (!box) return; target.setPointerCapture(event.pointerId);
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const move = (next: PointerEvent) => updateLayerTransform(id, { rotation: Math.round(Math.atan2(next.clientY - center.y, next.clientX - center.x) * 180 / Math.PI + 90) });
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end);
  };

  return (
    <div class="canvas-artboard" ref={surfaceRef} aria-label="직접 편집 가능한 이모티콘 캔버스">
      <canvas class="stage-canvas" ref={canvasRef} width={EXPORT_SIZE} height={EXPORT_SIZE} />
      {[...layers.value].reverse().map((layer, reverseIndex) => {
        if (!layer.visible) return null;
        const rect = layer.id === "text" ? measureTextBubble(motionBrief.value, textBoxShape.value, textFont.value, EXPORT_SIZE, EXPORT_SIZE) : scaleRect(selectionRects[layer.id]);
        const transform = layerTransforms.value[layer.id];
        const unit = EXPORT_SIZE / DESIGN_SIZE;
        return (
        <div
          key={layer.id}
          class={`canvas-selection ${selectionClassName(layer.id)} ${activeLayer.value === layer.id ? "is-selected" : ""}`}
          style={{
            zIndex: reverseIndex + 2,
            left: `${((rect.x + rect.width / 2 + transform.x * unit) / EXPORT_SIZE) * 100}%`,
            top: `${((rect.y + rect.height / 2 + transform.y * unit) / EXPORT_SIZE) * 100}%`,
            width: `${(rect.width / EXPORT_SIZE) * 100}%`,
            height: `${(rect.height / EXPORT_SIZE) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale})`,
          }}
          onPointerDown={(event) => beginMove(event, layer.id)}
          role="button" tabIndex={0} aria-label={`${layer.label} 레이어 선택 및 이동`}
        >
          {activeLayer.value === layer.id && !layer.locked ? <><i class="selection-rotate" onPointerDown={(event) => beginRotate(event, layer.id)} /><i class="selection-resize" onPointerDown={(event) => beginScale(event, layer.id)} /></> : null}
        </div>
      ); })}
    </div>
  );
}
