import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { imageAssets } from "../data";
import { navigate } from "../router";

type LandingCharacterSpec = {
  id: string;
  src: string;
  label: string;
  homeX: number;
  homeY: number;
  size: number;
  depth: number;
};

type LandingCharacterBody = LandingCharacterSpec & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
};

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
} | null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const getFieldScale = (width: number) => {
  if (width < 560) return 0.64;
  if (width < 820) return 0.76;
  if (width < 1100) return 0.88;
  return 1;
};

const placementSlots = [
  [0.375, 0.218],
  [0.208, 0.704],
  [0.812, 0.738],
] as const;

function createLandingCharacters(): LandingCharacterSpec[] {
  const sources = [
    { id: "main", src: imageAssets.library[0], label: "인사하는 캐릭터", size: 214, depth: 1.04 },
    { id: "input", src: imageAssets.character, label: "펭귄 캐릭터", size: 242, depth: 1.08 },
    { id: "edit", src: imageAssets.library[1], label: "우주 비행사 캐릭터", size: 232, depth: 1 },
  ];

  return sources.map((source, index) => {
    const slot = placementSlots[index];
    return { ...source, homeX: slot[0], homeY: slot[1] };
  });
}

function isPointInsideCard(body: LandingCharacterBody, x: number, y: number, size: number): boolean {
  const dx = x - body.x;
  const dy = y - body.y;
  const rotation = -body.rotation * Math.PI / 180;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  const halfSize = size / 2;
  return Math.abs(localX) <= halfSize && Math.abs(localY) <= halfSize;
}

function getCardCollision(
  first: LandingCharacterBody,
  second: LandingCharacterBody,
  scale: number,
): { nx: number; ny: number; overlap: number } | null {
  const halfWidth = (first.size * scale + second.size * scale) * 0.5;
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const overlapX = halfWidth - Math.abs(dx);
  const overlapY = halfWidth - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return null;

  if (overlapX < overlapY) {
    return { nx: dx < 0 ? -1 : 1, ny: 0, overlap: overlapX / halfWidth };
  }
  return { nx: 0, ny: dy < 0 ? -1 : 1, overlap: overlapY / halfWidth };
}

function HomeCharacterField() {
  const characters = useMemo(createLandingCharacters, []);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLSpanElement>());
  const bodiesRef = useRef<LandingCharacterBody[]>([]);
  const pointerRef = useRef<{ active: boolean; x: number; y: number; hitId: string | null }>({ active: false, x: 0, y: 0, hitId: null });
  const dragRef = useRef<DragState>(null);
  const randomLayoutRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const reducedMotionRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const getRandomLayout = useCallback(() => {
    if (randomLayoutRef.current) return randomLayoutRef.current;

    const slots = placementSlots.map(([x, y]) => ({ x, y }));
    for (let index = slots.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [slots[index], slots[target]] = [slots[target], slots[index]];
    }

    randomLayoutRef.current = slots.map((slot) => {
      const rawX = clamp(slot.x + (Math.random() - 0.5) * 0.08, 0.1, 0.9);
      const rawY = clamp(slot.y + (Math.random() - 0.5) * 0.1, 0.24, 0.84);
      return { x: rawX, y: rawY };
    });
    return randomLayoutRef.current;
  }, []);

  const findCardBodyAt = useCallback((x: number, y: number, rect: DOMRect): LandingCharacterBody | null => {
    const sizeScale = getFieldScale(rect.width);

    for (let index = bodiesRef.current.length - 1; index >= 0; index -= 1) {
      const body = bodiesRef.current[index];
      const size = body.size * sizeScale;
      if (isPointInsideCard(body, x, y, size)) return body;
    }

    return null;
  }, []);

  const placeCharacters = useCallback((randomize = false) => {
    const field = fieldRef.current;
    if (!field) return;

    const rect = field.getBoundingClientRect();
    const layout = randomize ? getRandomLayout() : null;
    bodiesRef.current = characters.map((character, index) => {
      const existing = bodiesRef.current.find((body) => body.id === character.id);
      const homeX = existing?.homeX ?? layout?.[index]?.x ?? character.homeX;
      const homeY = existing?.homeY ?? layout?.[index]?.y ?? character.homeY;
      const size = character.size * getFieldScale(rect.width);

      return {
        ...character,
        homeX,
        homeY,
        x: clamp(rect.width * homeX, size * 0.36, rect.width - size * 0.36),
        y: clamp(rect.height * homeY, size * 0.36, rect.height - size * 0.36),
        vx: 0,
        vy: 0,
        rotation: existing?.rotation ?? 0,
      };
    });
  }, [characters, getRandomLayout]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return undefined;

    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    placeCharacters(true);

    const resizeObserver = new ResizeObserver(() => placeCharacters());
    resizeObserver.observe(field);

    let frame = 0;
    const tick = () => {
      const currentField = fieldRef.current;
      if (!currentField) return;

      const rect = currentField.getBoundingClientRect();
      const pointer = pointerRef.current;
      const drag = dragRef.current;
      const motionFactor = reducedMotionRef.current ? 0.48 : 1;
      const sizeScale = getFieldScale(rect.width);

      if (pointer.active && !drag) {
        pointer.hitId = findCardBodyAt(pointer.x, pointer.y, rect)?.id ?? null;
        currentField.style.cursor = pointer.hitId ? "grab" : "default";
      }

      for (const body of bodiesRef.current) {
        const isDragging = drag?.id === body.id;
        const size = body.size * sizeScale;

        if (isDragging) {
          const nextX = clamp(pointer.x - drag.offsetX, size * 0.34, rect.width - size * 0.34);
          const nextY = clamp(pointer.y - drag.offsetY, size * 0.34, rect.height - size * 0.34);
          body.vx = nextX - body.x;
          body.vy = nextY - body.y;
          body.x = nextX;
          body.y = nextY;
          body.homeX = clamp(nextX / rect.width, 0.06, 0.94);
          body.homeY = clamp(nextY / rect.height, 0.12, 0.9);
        } else {
          body.vx += (rect.width * body.homeX - body.x) * 0.012 * motionFactor;
          body.vy += (rect.height * body.homeY - body.y) * 0.012 * motionFactor;

          if (pointer.active && pointer.hitId === body.id) {
            const dx = body.x - pointer.x;
            const dy = body.y - pointer.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const radius = (reducedMotionRef.current ? 110 : 168) * body.depth;

            if (distance < radius) {
              const force = ((radius - distance) / radius) ** 2 * 8.2 * motionFactor;
              body.vx += (dx / distance) * force;
              body.vy += (dy / distance) * force;
            }
          }
        }
      }

      for (let index = 0; index < bodiesRef.current.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < bodiesRef.current.length; nextIndex += 1) {
          const first = bodiesRef.current[index];
          const second = bodiesRef.current[nextIndex];
          const collision = getCardCollision(first, second, sizeScale);
          if (!collision) continue;

          const impulse = collision.overlap * 6.6 * motionFactor;
          const firstDragging = drag?.id === first.id;
          const secondDragging = drag?.id === second.id;

          if (!firstDragging) {
            first.vx += collision.nx * impulse * (secondDragging ? 1.7 : 0.78);
            first.vy += collision.ny * impulse * (secondDragging ? 1.7 : 0.78);
          }

          if (!secondDragging) {
            second.vx -= collision.nx * impulse * (firstDragging ? 1.7 : 0.78);
            second.vy -= collision.ny * impulse * (firstDragging ? 1.7 : 0.78);
          }
        }
      }

      for (const body of bodiesRef.current) {
        const isDragging = drag?.id === body.id;
        const size = body.size * sizeScale;
        body.vx *= isDragging ? 0.36 : 0.84;
        body.vy *= isDragging ? 0.36 : 0.84;
        body.x = clamp(body.x + clamp(body.vx, -30, 30), size * 0.34, rect.width - size * 0.34);
        body.y = clamp(body.y + clamp(body.vy, -30, 30), size * 0.34, rect.height - size * 0.34);
        body.rotation = clamp(body.vx * 0.82, -12, 12);

        const element = itemRefs.current.get(body.id);
        if (element) {
          element.style.left = "0px";
          element.style.top = "0px";
          element.style.width = `${size}px`;
          element.style.height = `${size}px`;
          element.style.transform = `translate3d(${body.x - size / 2}px, ${body.y - size / 2}px, 0) rotate(${body.rotation}deg)`;
        }
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [findCardBodyAt, placeCharacters]);

  const updatePointer = useCallback((clientX: number, clientY: number, active = true, target?: EventTarget | null) => {
    const field = fieldRef.current;
    const rect = field?.getBoundingClientRect();
    if (!rect) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    const drag = dragRef.current;
    const interactiveTarget = target instanceof Element
      ? target.closest("button, a, input, select, textarea, [role='button'], .bottom-dock-text-nav")
      : null;
    const hitBody = drag ? bodiesRef.current.find((body) => body.id === drag.id) ?? null : findCardBodyAt(x, y, rect);

    pointerRef.current = {
      active: active && !interactiveTarget && (inside || Boolean(drag)),
      x,
      y,
      hitId: hitBody?.id ?? null,
    };

    if (field) field.style.cursor = drag ? "grabbing" : hitBody ? "grab" : "default";
  }, [findCardBodyAt]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => updatePointer(event.clientX, event.clientY, true, event.target);
    const handlePointerUp = () => {
      dragRef.current = null;
      setDraggingId(null);
      if (fieldRef.current) fieldRef.current.style.cursor = pointerRef.current.hitId ? "grab" : "default";
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [updatePointer]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    updatePointer(event.clientX, event.clientY, true, event.target);
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;

    const body = findCardBodyAt(pointerRef.current.x, pointerRef.current.y, rect);
    if (!body) return;

    dragRef.current = {
      id: body.id,
      offsetX: pointerRef.current.x - body.x,
      offsetY: pointerRef.current.y - body.y,
    };
    setDraggingId(body.id);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="home-character-field"
      ref={fieldRef}
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {characters.map((character) => (
        <span
          className={`home-character-token${draggingId === character.id ? " is-dragging" : ""}`}
          key={character.id}
          ref={(node) => {
            if (node) itemRefs.current.set(character.id, node);
            else itemRefs.current.delete(character.id);
          }}
          style={{
            "--home-x": `${character.homeX * 100}%`,
            "--home-y": `${character.homeY * 100}%`,
            "--token-size": `${character.size}px`,
          } as CSSProperties}
        >
          <img src={character.src} alt="" draggable={false} />
        </span>
      ))}
    </div>
  );
}

export function HomePage() {
  return (
    <section className="home-hero">
      <div className="hero-glow" />
      <div className="home-geometry" aria-hidden="true">
        <span className="geo-circle geo-a" />
        <span className="geo-circle geo-b" />
        <span className="geo-circle geo-c" />
        <span className="geo-circle geo-d" />
        <span className="geo-circle geo-e" />
        <span className="geo-circle geo-f" />
        <span className="geo-circle geo-g" />
        <span className="geo-line geo-line-a" />
        <span className="geo-line geo-line-b" />
        <span className="geo-line geo-line-c" />
        <span className="geo-line geo-line-d" />
        <span className="geo-line geo-line-e" />
        <span className="geo-line geo-line-f" />
        <span className="geo-line geo-line-g" />
        <span className="geo-line geo-line-h" />
        <span className="geo-line geo-line-i" />
      </div>
      <HomeCharacterField />
      <button className="home-logo-mark" type="button" onClick={() => navigate("/home")} aria-label="EMOVE 홈">
        <img src={imageAssets.logo} alt="" />
      </button>
      <div className="home-copy">
        <p className="hero-kicker">Move Your</p>
        <h1>Emotion</h1>
        <div className="hero-actions">
          <button className="hero-button" type="button" onClick={() => navigate("/library")}><span className="button-aura" aria-hidden="true" /><span>이모티콘 보관함으로 이동하기</span></button>
          <button className="hero-button" type="button" onClick={() => navigate("/character")}><span className="button-aura" aria-hidden="true" /><span>이모티콘 생성하기</span></button>
        </div>
      </div>
      <footer className="home-footer">© 2026. EMOVE. All rights reserved.</footer>
    </section>
  );
}
