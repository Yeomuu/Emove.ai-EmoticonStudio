import { useEffect, useMemo, useRef } from "react";

export function Waveform({ levels, active = false }: { levels?: number[]; active?: boolean }) {
  const fallback = useMemo(() => Array.from({ length: 34 }, (_, index) => 0.18 + Math.abs(Math.sin(index * 0.72)) * 0.54), []);
  const idle = !active && !levels?.length;
  const values = idle ? Array.from({ length: 34 }, () => 0.035) : levels?.length ? levels : fallback;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, rect.width, rect.height);
    const step = rect.width / values.length;
    values.forEach((level, index) => {
      const height = idle ? 4 : Math.max(4, level * rect.height * (active ? 0.96 : 0.68));
      const width = idle ? 4 : Math.max(2, step - 3);
      const gradient = context.createLinearGradient(0, rect.height / 2 - height / 2, 0, rect.height / 2 + height / 2);
      gradient.addColorStop(0, idle ? "rgba(201,191,255,.7)" : "#c9bfff");
      gradient.addColorStop(1, idle ? "rgba(123,109,255,.5)" : "#7b6dff");
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(index * step + (step - width) / 2, rect.height / 2 - height / 2, width, height, 6);
      context.fill();
    });
  }, [values, active, idle]);

  return <canvas className={`waveform ${idle ? "is-idle" : ""}`} ref={canvasRef} aria-label={active ? "실시간 음성 FFT 파형" : "입력 대기 음성 파형"} />;
}
