import { useEffect, useState } from "react";
import { boundedStageProgress } from "../services/stage-progress";

export function useStageProgress(completed: number, boundary: number, active = true) {
  const [clock, setClock] = useState({ base: completed, boundary, elapsed: 0 });
  useEffect(() => {
    setClock({ base: completed, boundary, elapsed: 0 });
    if (!active || completed >= 100) return;
    const start = performance.now();
    const timer = window.setInterval(() => setClock({ base: completed, boundary, elapsed: performance.now() - start }), 2000);
    return () => window.clearInterval(timer);
  }, [completed, boundary, active]);
  const elapsed = clock.base === completed && clock.boundary === boundary ? clock.elapsed : 0;
  const percent = boundedStageProgress(completed, boundary, elapsed);
  return { percent, estimated: percent > completed };
}
