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

type AlphaMap = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const alphaHitThreshold = 24;
const alphaMapMaxSize = 220;
const getFieldScale = (width: number) => {
  if (width < 560) return 0.64;
  if (width < 820) return 0.76;
  if (width < 1100) return 0.88;
  return 1;
};

const placementSlots = [
  [0.13, 0.46],
  [0.24, 0.75],
  [0.36, 0.32],
  [0.62, 0.28],
  [0.73, 0.66],
  [0.86, 0.43],
  [0.54, 0.78],
] as const;

function createLandingCharacters(): LandingCharacterSpec[] {
  const sources = [
    { id: "main", src: imageAssets.character, label: "메인 캐릭터", size: 184, depth: 1.08 },
    { id: "input", src: imageAssets.inputCharacter, label: "입력 캐릭터", size: 136, depth: 0.94 },
    { id: "edit", src: imageAssets.editCharacterSheet, label: "편집 캐릭터", size: 158, depth: 1 },
    { id: "library-1", src: imageAssets.library[0], label: "라이브러리 캐릭터 1", size: 144, depth: 0.92 },
    { id: "library-2", src: imageAssets.library[1], label: "라이브러리 캐릭터 2", size: 150, depth: 0.98 },
    { id: "library-4", src: imageAssets.library[3], label: "라이브러리 캐릭터 3", size: 128, depth: 0.88 },
    { id: "detail", src: imageAssets.detailSticker, label: "완성 이모티콘", size: 168, depth: 1.02 },
  ];

  return sources.map((source, index) => {
    const slot = placementSlots[index];
    return { ...source, homeX: slot[0], homeY: slot[1] };
  });
}

function loadAlphaMap(src: string): Promise<AlphaMap | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const scale = Math.min(1, alphaMapMaxSize / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve({ width, height, data: context.getImageData(0, 0, width, height).data });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function isOpaqueAlphaPixel(map: AlphaMap, localX: number, localY: number, size: number): boolean {
  if (localX < 0 || localY < 0 || localX > size || localY > size) return false;
  const sampleX = clamp(Math.floor((localX / size) * map.width), 0, map.width - 1);
  const sampleY = clamp(Math.floor((localY / size) * map.height), 0, map.height - 1);
  return map.data[(sampleY * map.width + sampleX) * 4 + 3] > alphaHitThreshold;
}

function HomeCharacterField() {
  const characters = useMemo(createLandingCharacters, []);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLSpanElement>());
  const bodiesRef = useRef<LandingCharacterBody[]>([]);
  const pointerRef = useRef<{ active: boolean; x: number; y: number; hitId: string | null }>({ active: false, x: 0, y: 0, hitId: null });
  const dragRef = useRef<DragState>(null);
  const alphaMapsRef = useRef(new Map<string, AlphaMap | null>());
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

    const avoidTextOverlap = (x: number, y: number): { x: number; y: number } => {
      const minX = 0.18;
      const maxX = 0.72;
      const minY = 0.30;
      const maxY = 0.58;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        const distToLeft = x - minX;
        const distToRight = maxX - x;
        const distToTop = y - minY;
        const distToBottom = maxY - y;
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        if (minDist === distToLeft) return { x: minX - 0.05, y };
        if (minDist === distToRight) return { x: maxX + 0.05, y };
        if (minDist === distToTop) return { x, y: minY - 0.05 };
        return { x, y: maxY + 0.05 };
      }
      return { x, y };
    };

    randomLayoutRef.current = slots.map((slot) => {
      const rawX = clamp(slot.x + (Math.random() - 0.5) * 0.08, 0.1, 0.9);
      const rawY = clamp(slot.y + (Math.random() - 0.5) * 0.1, 0.24, 0.84);
      return avoidTextOverlap(rawX, rawY);
    });
    return randomLayoutRef.current;
  }, []);

  const findOpaqueBodyAt = useCallback((x: number, y: number, rect: DOMRect): LandingCharacterBody | null => {
    const sizeScale = getFieldScale(rect.width);

    for (let index = bodiesRef.current.length - 1; index >= 0; index -= 1) {
      const body = bodiesRef.current[index];
      const alphaMap = alphaMapsRef.current.get(body.src);
      if (!alphaMap) continue;

      const size = body.size * sizeScale;
      const dx = x - body.x;
      const dy = y - body.y;
      const rotation = -body.rotation * Math.PI / 180;
      const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation) + size / 2;
      const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation) + size / 2;

      if (isOpaqueAlphaPixel(alphaMap, localX, localY, size)) return body;
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
    let cancelled = false;
    const uniqueSources = [...new Set(characters.map((character) => character.src))];

    uniqueSources.forEach((src) => {
      void loadAlphaMap(src).then((alphaMap) => {
        if (!cancelled) alphaMapsRef.current.set(src, alphaMap);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [characters]);

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
        pointer.hitId = findOpaqueBodyAt(pointer.x, pointer.y, rect)?.id ?? null;
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
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const minimumDistance = (first.size * sizeScale + second.size * sizeScale) * 0.44;

          if (distance >= minimumDistance) continue;

          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = (minimumDistance - distance) / minimumDistance;
          const impulse = overlap * 6.6 * motionFactor;
          const firstDragging = drag?.id === first.id;
          const secondDragging = drag?.id === second.id;

          if (!firstDragging) {
            first.vx += nx * impulse * (secondDragging ? 1.7 : 0.78);
            first.vy += ny * impulse * (secondDragging ? 1.7 : 0.78);
          }

          if (!secondDragging) {
            second.vx -= nx * impulse * (firstDragging ? 1.7 : 0.78);
            second.vy -= ny * impulse * (firstDragging ? 1.7 : 0.78);
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
  }, [findOpaqueBodyAt, placeCharacters]);

  const updatePointer = useCallback((clientX: number, clientY: number, active = true) => {
    const field = fieldRef.current;
    const rect = field?.getBoundingClientRect();
    if (!rect) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    const drag = dragRef.current;
    const hitBody = drag ? bodiesRef.current.find((body) => body.id === drag.id) ?? null : findOpaqueBodyAt(x, y, rect);

    pointerRef.current = {
      active: active && (inside || Boolean(drag)),
      x,
      y,
      hitId: hitBody?.id ?? null,
    };

    if (field) field.style.cursor = drag ? "grabbing" : hitBody ? "grab" : "default";
  }, [findOpaqueBodyAt]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => updatePointer(event.clientX, event.clientY);
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
    updatePointer(event.clientX, event.clientY);
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;

    const body = findOpaqueBodyAt(pointerRef.current.x, pointerRef.current.y, rect);
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
        <span className="geo-line geo-line-a" />
        <span className="geo-line geo-line-b" />
      </div>
      <HomeCharacterField />
      <button className="home-logo-mark" type="button" onClick={() => navigate("/home")} aria-label="EMOVE 홈">
        <img src={imageAssets.logo} alt="" />
      </button>
      <div className="home-copy">
        <p className="hero-kicker">MOVE YOUR</p>
        <h1>
          <span style={{ position: "relative", display: "inline-block" }}>
            EMOTION
            <span className="hero-underline" aria-hidden="true" />
          </span>
          <span className="hero-arrow" aria-hidden="true">→</span>
        </h1>
        <div className="hero-actions">
          <button className="hero-button" type="button" onClick={() => navigate("/mypage")}><span className="button-aura" aria-hidden="true" /><span>이모티콘 구경가기</span></button>
          <button className="hero-button" type="button" onClick={() => navigate("/character")}><span className="button-aura" aria-hidden="true" /><span>이모티콘 제작하기</span></button>
        </div>
      </div>
      <footer className="home-footer">© 2026. Capstone Design. All rights reserved.</footer>
    </section>
  );
}
