export interface WaitingGame {
  status: "idle" | "playing" | "paused" | "over";
  score: number;
  combo: number;
  hits: number;
  mistakes: number;
  level: number;
  feedback: { id: number; kind: "hit" | "miss" | "level"; cell: number } | null;
  target: number;
  remainingMs: number;
  endsAt: number;
  targetEndsAt: number;
}

export const ROUND_MS = 30_000;
export function idleWaitingGame(): WaitingGame {
  return { status: "idle", score: 0, combo: 0, hits: 0, mistakes: 0, level: 0, feedback: null, target: 4, remainingMs: ROUND_MS, endsAt: 0, targetEndsAt: 0 };
}

export function targetDuration(level: number): number {
  return Math.max(600, 2000 - level * 500);
}

export function rankWaitingScores(scores: number[], score: number): number[] {
  return [...scores, score].filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => b - a).slice(0, 5);
}

function nextTarget(current: number, random: number): number {
  return (current + 1 + Math.floor(Math.max(0, Math.min(.999999, random)) * 8)) % 9;
}

export function startWaitingGame(now: number): WaitingGame {
  return { ...idleWaitingGame(), status: "playing", endsAt: now + ROUND_MS, targetEndsAt: now + targetDuration(0) };
}

export function tickWaitingGame(state: WaitingGame, now: number, random: number): WaitingGame {
  if (state.status !== "playing") return state;
  const remainingMs = Math.max(0, state.endsAt - now);
  if (!remainingMs) return { ...state, status: "over", remainingMs: 0 };
  if (now >= state.targetEndsAt) return { ...state, remainingMs, target: nextTarget(state.target, random), targetEndsAt: now + targetDuration(state.level), combo: 0 };
  return { ...state, remainingMs };
}

export function hitWaitingTarget(state: WaitingGame, index: number, now: number, random: number): WaitingGame {
  if (state.status !== "playing") return state;
  const current = tickWaitingGame(state, now, random);
  if (current.status !== "playing" || now >= state.targetEndsAt) return current;
  if (index !== current.target) {
    const mistakes = current.mistakes + 1;
    return { ...current, combo: 0, mistakes, status: mistakes >= 3 ? "over" : "playing", feedback: { id: (current.feedback?.id ?? 0) + 1, kind: "miss", cell: index } };
  }
  const combo = current.combo + 1;
  const level = Math.max(current.level, Math.floor(combo / 5));
  return { ...current, hits: current.hits + 1, combo, level, score: current.score + 10 + Math.min(combo - 1, 5) * 2, target: nextTarget(current.target, random), targetEndsAt: now + targetDuration(level), feedback: { id: (current.feedback?.id ?? 0) + 1, kind: level > current.level ? "level" : "hit", cell: index } };
}

export function pauseWaitingGame(state: WaitingGame, now: number): WaitingGame {
  if (state.status !== "playing") return state;
  const remainingMs = Math.max(0, state.endsAt - now);
  return { ...state, remainingMs, targetEndsAt: Math.max(0, state.targetEndsAt - now), status: remainingMs ? "paused" : "over" };
}

export function resumeWaitingGame(state: WaitingGame, now: number): WaitingGame {
  return state.status === "paused" ? { ...state, status: "playing", endsAt: now + state.remainingMs, targetEndsAt: now + state.targetEndsAt } : state;
}
