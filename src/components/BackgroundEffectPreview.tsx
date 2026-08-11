import { useEffect, useRef } from "react";
import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { backgroundEffectBlur, backgroundEffectOpacity, motionBrief } from "../store";
import { renderFrame } from "../services/renderer";
import type { EditorLayer, LayerKind, LayerTransform } from "../types";

const previewLayers: EditorLayer[] = [
  { id: "background-effects", label: "배경 이펙트", description: "분석 감정에 연결된 고정 배경 이펙트", visible: true, locked: true },
];

const previewTransforms: Record<LayerKind, LayerTransform> = {
  "background-effects": { x: 0, y: 0, scale: 1, rotation: 0 },
  character: { x: 0, y: 0, scale: 1, rotation: 0 },
  "accent-effects": { x: 0, y: 0, scale: 1, rotation: 0 },
  text: { x: 0, y: 0, scale: 1, rotation: 0 },
};

export function BackgroundEffectPreview({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = async (frameIndex: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context || cancelled) return;
      await renderFrame(context, {
        characterUrl: "",
        brief: motionBrief.value,
        layers: previewLayers,
        transforms: previewTransforms,
        backgroundEffectStyle: {
          blur: backgroundEffectBlur.value,
          opacity: backgroundEffectOpacity.value,
        },
        width: canvas.width,
        height: canvas.height,
        gifSafe: false,
      }, frameIndex / (FRAME_COUNT - 1));
      if (!reducedMotion && !cancelled) {
        timer = window.setTimeout(() => void draw((frameIndex + 1) % FRAME_COUNT), 180);
      }
    };

    void draw(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [motionBrief.value, backgroundEffectBlur.value, backgroundEffectOpacity.value]);

  return <canvas ref={canvasRef} className={`background-effect-preview ${className}`.trim()} width={EXPORT_SIZE} height={EXPORT_SIZE} aria-hidden="true" />;
}
