export type ShowcasePhysicsBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  driftX: number;
  driftY: number;
  size: number;
  rotation: number;
  phase: number;
  depth: number;
};

export type ShowcasePointer = {
  active: boolean;
  x: number;
  y: number;
};

type ShowcaseBounds = {
  width: number;
  height: number;
};

const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createShowcaseBodies(
  ids: readonly string[],
  bounds: ShowcaseBounds,
  random: () => number = Math.random,
): ShowcasePhysicsBody[] {
  if (!ids.length || bounds.width <= 0 || bounds.height <= 0) return [];

  const aspect = bounds.width / Math.max(1, bounds.height);
  const columns = Math.max(1, Math.ceil(Math.sqrt(ids.length * aspect)));
  const rows = Math.max(1, Math.ceil(ids.length / columns));
  const cellWidth = bounds.width / columns;
  const cellHeight = bounds.height / rows;
  const slots = Array.from({ length: columns * rows }, (_, index) => index);

  for (let index = slots.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [slots[index], slots[target]] = [slots[target], slots[index]];
  }

  return ids.map((id, index) => {
    const slot = slots[index];
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const size = clamp(Math.min(cellWidth, cellHeight) * (0.48 + random() * 0.18), 76, 164);
    const x = clamp(
      (column + 0.5 + (random() - 0.5) * 0.44) * cellWidth,
      size * 0.55,
      bounds.width - size * 0.55,
    );
    const y = clamp(
      (row + 0.5 + (random() - 0.5) * 0.38) * cellHeight,
      size * 0.55,
      bounds.height - size * 0.55,
    );
    const driftX = 14 + random() * 16;
    const driftY = 8 + random() * 12;

    return {
      id,
      x,
      y,
      vx: driftX,
      vy: driftY,
      driftX,
      driftY,
      size,
      rotation: (random() - 0.5) * 7,
      phase: random() * TAU,
      depth: Math.round(random() * 4),
    };
  });
}

export function advanceShowcaseBodies(
  bodies: ShowcasePhysicsBody[],
  bounds: ShowcaseBounds,
  pointer: ShowcasePointer,
  deltaSeconds: number,
  elapsedSeconds: number,
  draggingId: string | null = null,
  reducedMotion = false,
): void {
  const delta = clamp(deltaSeconds, 0, 0.05);
  if (!delta || bounds.width <= 0 || bounds.height <= 0) return;

  for (const body of bodies) {
    if (body.id === draggingId) continue;

    const targetVx = reducedMotion ? 0 : body.driftX;
    const targetVy = reducedMotion ? 0 : body.driftY;
    const recovery = Math.min(1, delta * 1.35);
    body.vx += (targetVx - body.vx) * recovery;
    body.vy += (targetVy - body.vy) * recovery;

    if (pointer.active) {
      const dx = body.x - pointer.x;
      const dy = body.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      const halfSize = body.size * 0.5;
      const pointerTouchesBody = Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize;
      const radius = body.size * 0.72;

      if (pointerTouchesBody) {
        const fallbackAngle = body.phase + Math.PI;
        const nx = distance > 0.5 ? dx / distance : Math.cos(fallbackAngle);
        const ny = distance > 0.5 ? dy / distance : Math.sin(fallbackAngle);
        const impulse = ((radius - distance) / radius) ** 1.4 * 420 * delta;
        body.vx += nx * impulse;
        body.vy += ny * impulse;
      }
    }

    body.vx = clamp(body.vx, -150, 190);
    body.vy = clamp(body.vy, -130, 170);

    const waterX = reducedMotion ? 0 : Math.sin(elapsedSeconds * 0.78 + body.phase) * 5;
    const waterY = reducedMotion ? 0 : Math.cos(elapsedSeconds * 0.64 + body.phase) * 3.5;
    body.x += (body.vx + waterX) * delta;
    body.y += (body.vy + waterY) * delta;

    const targetRotation = clamp((body.vx - body.driftX) * 0.055 + Math.sin(elapsedSeconds * 0.7 + body.phase) * 3, -13, 13);
    body.rotation += (targetRotation - body.rotation) * Math.min(1, delta * 3.2);

    wrapShowcaseBody(body, bounds);
  }
}

export function moveDraggedShowcaseBody(
  body: ShowcasePhysicsBody,
  bounds: ShowcaseBounds,
  targetX: number,
  targetY: number,
  deltaSeconds: number,
): void {
  const margin = body.size * 0.45;
  const nextX = clamp(targetX, margin, bounds.width - margin);
  const nextY = clamp(targetY, margin, bounds.height - margin);
  const delta = clamp(deltaSeconds, 1 / 240, 0.05);

  body.vx = clamp((nextX - body.x) / delta, -320, 320);
  body.vy = clamp((nextY - body.y) / delta, -320, 320);
  body.x = nextX;
  body.y = nextY;
  body.rotation = clamp(body.vx * 0.035, -14, 14);
}

export function releaseDraggedShowcaseBody(body: ShowcasePhysicsBody): void {
  body.vx = clamp(Math.abs(body.vx) * 0.34 + body.driftX * 0.66, body.driftX * 0.55, 150);
  body.vy = clamp(Math.abs(body.vy) * 0.3 + body.driftY * 0.7, body.driftY * 0.55, 130);
}

function wrapShowcaseBody(body: ShowcasePhysicsBody, bounds: ShowcaseBounds): void {
  const margin = body.size * 0.62;

  if (body.x - margin > bounds.width) body.x = -margin;
  else if (body.x < -margin * 1.35) body.x = -margin;

  if (body.y - margin > bounds.height) body.y = -margin;
  else if (body.y < -margin * 1.35) body.y = -margin;
}
