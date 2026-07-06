"use client";

import { useEffect, useMemo, useState } from "react";

type GenerationDemoProps = {
  compact?: boolean;
};

const STEPS = [
  "Capture analysis",
  "Character token",
  "Local frame blend",
  "GIF-safe export",
] as const;

export function GenerationDemo({ compact = false }: GenerationDemoProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const stepIndex = useMemo(() => Math.min(STEPS.length - 1, Math.floor(progress / (100 / STEPS.length))), [progress]);

  useEffect(() => {
    if (!running) return undefined;
    const duration = 10000;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const elapsed = time - startedAt;
      const eased = 1 - (1 - Math.min(1, elapsed / duration)) ** 2.25;
      setProgress(Math.min(100, Math.round(eased * 100)));
      if (elapsed < duration) frame = window.requestAnimationFrame(tick);
      else window.setTimeout(() => setRunning(false), 520);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [running]);

  const start = () => {
    setProgress(0);
    setRunning(true);
  };

  return (
    <>
      <button className={`glass-button${compact ? "" : " render-button"}`} onClick={start} type="button">
        Run Render Estimate
      </button>
      <div className={`creation-loader${running ? " is-active" : ""}`} role="status" aria-live="polite" aria-hidden={!running}>
        <div className="creation-card glass-panel">
          <div className="creation-card-head">
            <span>ESTIMATED RENDER</span>
            <strong>{progress}%</strong>
          </div>
          <p className="creation-note">Prototype timer only. Production should bind this to real capture, render, upload, and job-polling states.</p>
          <div className="creation-progress">
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <ol className="creation-steps">
            {STEPS.map((step, index) => (
              <li className={index <= stepIndex ? "is-on" : ""} key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}
