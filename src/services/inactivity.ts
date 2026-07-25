export const SHOWCASE_IDLE_TIMEOUT_MS = 3 * 60 * 1000;

export const USER_ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "touchstart",
  "wheel",
] as const;

type InactivityWatcherOptions = {
  target?: EventTarget;
  timeoutMs?: number;
};

export function watchForInactivity(
  onIdle: () => void,
  {
    target = window,
    timeoutMs = SHOWCASE_IDLE_TIMEOUT_MS,
  }: InactivityWatcherOptions = {},
): () => void {
  let timerId: ReturnType<typeof globalThis.setTimeout> | undefined;

  const resetTimer = () => {
    if (timerId !== undefined) globalThis.clearTimeout(timerId);
    timerId = globalThis.setTimeout(onIdle, timeoutMs);
  };

  USER_ACTIVITY_EVENTS.forEach((eventName) => {
    target.addEventListener(eventName, resetTimer, { passive: true });
  });
  resetTimer();

  return () => {
    if (timerId !== undefined) {
      globalThis.clearTimeout(timerId);
      timerId = undefined;
    }
    USER_ACTIVITY_EVENTS.forEach((eventName) => {
      target.removeEventListener(eventName, resetTimer);
    });
  };
}
