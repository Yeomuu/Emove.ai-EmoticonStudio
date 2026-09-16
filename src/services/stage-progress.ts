export function boundedStageProgress(completed: number, boundary: number, elapsedMs: number): number {
  const base = Math.max(0, Math.min(100, completed));
  if (base === 100) return 100;
  const end = Math.max(base, Math.min(100, boundary));
  const ticks = Math.max(0, Math.floor(elapsedMs / 2000));
  return Math.floor((base + (end - base) * .9 * (1 - Math.pow(.8, ticks))) * 10) / 10;
}

export function nextStageBoundary(percent: number, boundaries: readonly number[]): number {
  return boundaries.find((value) => value > percent) ?? 100;
}
