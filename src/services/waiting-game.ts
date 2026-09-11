export interface WaitingGame {
  status: "idle" | "playing" | "paused" | "over";
  score: number;
  combo: number;
  hits: number;
  target: number;
  remainingMs: number;
  endsAt: number;
  targetEndsAt: number;
}

export const ROUND_MS = 30_000;
export function idleWaitingGame(): WaitingGame {
  return { status: "idle", score: 0, combo: 0, hits: 0, target: 4, remainingMs: ROUND_MS, endsAt: 0, targetEndsAt: 0 };
}

function nextTarget(current: number, random: number): number {
  return (current + 1 + Math.floor(Math.max(0, Math.min(.999999, random)) * 8)) % 9;
}

export function startWaitingGame(now: number): WaitingGame {
  return { ...idleWaitingGame(), status: "playing", endsAt: now + ROUND_MS, targetEndsAt: now + 1500 };
}

export function tickWaitingGame(state: WaitingGame, now: number, random: number): WaitingGame {
  if (state.status !== "playing") return state;
  const remainingMs = Math.max(0, state.endsAt - now);
  if (!remainingMs) return { ...state, status: "over", remainingMs: 0, combo: 0 };
  if (now >= state.targetEndsAt) return { ...state, remainingMs, target: nextTarget(state.target, random), targetEndsAt: now + 1500, combo: 0 };
  return { ...state, remainingMs };
}

export function hitWaitingTarget(state: WaitingGame, index: number, now: number, random: number): WaitingGame {
  if (state.status !== "playing") return state;
  const current = tickWaitingGame(state, now, random);
  if (current.status !== "playing" || now >= state.targetEndsAt) return current;
  if (index !== current.target) return { ...current, combo: 0 };
  const combo = current.combo + 1;
  return { ...current, hits: current.hits + 1, combo, score: current.score + 10 + Math.min(combo - 1, 5) * 2, target: nextTarget(current.target, random), targetEndsAt: now + Math.max(750, 1500 - combo * 50) };
}

export function pauseWaitingGame(state: WaitingGame, now: number): WaitingGame {
  if (state.status !== "playing") return state;
  const remainingMs = Math.max(0, state.endsAt - now);
  return { ...state, remainingMs, status: remainingMs ? "paused" : "over" };
}

export function resumeWaitingGame(state: WaitingGame, now: number): WaitingGame {
  return state.status === "paused" ? { ...state, status: "playing", endsAt: now + state.remainingMs, targetEndsAt: now + 1500 } : state;
}
