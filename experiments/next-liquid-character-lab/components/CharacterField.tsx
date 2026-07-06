"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";

type CharacterSpec = {
  id: string;
  src: string;
  alt: string;
  homeX: number;
  homeY: number;
  size: number;
  depth: number;
};

type CharacterBody = CharacterSpec & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
};

type PointerState = {
  active: boolean;
  x: number;
  y: number;
};

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
} | null;

const CHARACTER_SPECS: CharacterSpec[] = [
  { id: "momo", src: "/assets/character-main.webp", alt: "Round yellow EMOVE character", homeX: .34, homeY: .52, size: 184, depth: 1.05 },
  { id: "spark", src: "/assets/input-character.webp", alt: "Small blue EMOVE character", homeX: .62, homeY: .38, size: 132, depth: .88 },
  { id: "loop", src: "/assets/edit-character.webp", alt: "Animated EMOVE character", homeX: .73, homeY: .67, size: 154, depth: .96 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function CharacterField() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const bodiesRef = useRef<CharacterBody[]>([]);
  const pointerRef = useRef<PointerState>({ active: false, x: 0, y: 0 });
  const dragRef = useRef<DragState>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const placeCharacters = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    bodiesRef.current = CHARACTER_SPECS.map((spec) => {
      const existing = bodiesRef.current.find((body) => body.id === spec.id);
      return {
        ...spec,
        x: existing?.x ?? rect.width * spec.homeX,
        y: existing?.y ?? rect.height * spec.homeY,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        rotation: existing?.rotation ?? 0,
      };
    });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    placeCharacters();
    const resizeObserver = new ResizeObserver(placeCharacters);
    resizeObserver.observe(stage);

    gsap.fromTo(
      ".hero-copy > *",
      { opacity: 0, y: 28, filter: "blur(10px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: .82, ease: "power3.out", stagger: .08 },
    );
    gsap.fromTo(
      ".floating-character",
      { opacity: 0, scale: .76, y: 26 },
      { opacity: 1, scale: 1, y: 0, duration: .9, ease: "elastic.out(1, 0.62)", stagger: .09, delay: .18 },
    );

    let frame = 0;
    const tick = () => {
      const currentStage = stageRef.current;
      if (!currentStage) return;
      const rect = currentStage.getBoundingClientRect();
      const pointer = pointerRef.current;
      const drag = dragRef.current;

      for (const body of bodiesRef.current) {
        const isDragging = drag?.id === body.id;
        if (isDragging) {
          const nextX = pointer.x - drag.offsetX;
          const nextY = pointer.y - drag.offsetY;
          body.vx = nextX - body.x;
          body.vy = nextY - body.y;
          body.x = nextX;
          body.y = nextY;
        } else {
          const homeX = rect.width * body.homeX;
          const homeY = rect.height * body.homeY;
          body.vx += (homeX - body.x) * .012;
          body.vy += (homeY - body.y) * .012;

          if (pointer.active) {
            const dx = body.x - pointer.x;
            const dy = body.y - pointer.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const radius = 148 * body.depth;
            if (distance < radius) {
              const force = ((radius - distance) / radius) ** 2 * 7.5;
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
          const minimumDistance = (first.size + second.size) * .42;
          if (distance >= minimumDistance) continue;

          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = (minimumDistance - distance) / minimumDistance;
          const impulse = overlap * 6.2;
          const firstDragging = drag?.id === first.id;
          const secondDragging = drag?.id === second.id;

          if (!firstDragging) {
            first.vx += nx * impulse * (secondDragging ? 1.55 : .82);
            first.vy += ny * impulse * (secondDragging ? 1.55 : .82);
          }
          if (!secondDragging) {
            second.vx -= nx * impulse * (firstDragging ? 1.55 : .82);
            second.vy -= ny * impulse * (firstDragging ? 1.55 : .82);
          }
        }
      }

      for (const body of bodiesRef.current) {
        const isDragging = drag?.id === body.id;
        body.vx *= isDragging ? .38 : .86;
        body.vy *= isDragging ? .38 : .86;
        body.x += clamp(body.vx, -28, 28);
        body.y += clamp(body.vy, -28, 28);
        body.x = clamp(body.x, body.size * .38, rect.width - body.size * .38);
        body.y = clamp(body.y, body.size * .38, rect.height - body.size * .38);
        body.rotation = clamp(body.vx * .9, -13, 13);

        const element = itemRefs.current.get(body.id);
        if (element) {
          element.style.width = `${body.size}px`;
          element.style.transform = `translate3d(${body.x - body.size / 2}px, ${body.y - body.size / 2}px, 0) rotate(${body.rotation}deg)`;
        }
      }

      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [placeCharacters]);

  const updatePointer = (clientX: number, clientY: number, active = true) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    pointerRef.current = { active, x, y };
    stageRef.current?.style.setProperty("--light-x", `${Math.round(x / rect.width * 100)}%`);
    stageRef.current?.style.setProperty("--light-y", `${Math.round(y / rect.height * 100)}%`);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    const body = bodiesRef.current.find((item) => item.id === id);
    if (!body) return;
    updatePointer(event.clientX, event.clientY);
    dragRef.current = {
      id,
      offsetX: pointerRef.current.x - body.x,
      offsetY: pointerRef.current.y - body.y,
    };
    setDraggingId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    setDraggingId(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className="character-stage glass-panel"
      ref={stageRef}
      onPointerMove={(event) => updatePointer(event.clientX, event.clientY)}
      onPointerLeave={() => {
        pointerRef.current.active = false;
        dragRef.current = null;
        setDraggingId(null);
      }}
    >
      <div className="stage-halo" aria-hidden="true" />
      <div className="stage-grid" aria-hidden="true" />
      {CHARACTER_SPECS.map((character) => (
        <button
          aria-label={character.alt}
          className={`floating-character${draggingId === character.id ? " is-dragging" : ""}`}
          data-id={character.id}
          key={character.id}
          onPointerDown={(event) => handlePointerDown(event, character.id)}
          onPointerMove={(event) => updatePointer(event.clientX, event.clientY)}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          ref={(node) => {
            if (node) itemRefs.current.set(character.id, node);
            else itemRefs.current.delete(character.id);
          }}
          type="button"
        >
          <img src={character.src} alt="" draggable={false} />
        </button>
      ))}
      <div
        className="render-chip glass-panel"
        onPointerEnter={() => {
          pointerRef.current.active = false;
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          pointerRef.current.active = false;
        }}
      >
        <span>LOCAL RENDER</span>
        <strong>10-15s path</strong>
      </div>
    </div>
  );
}
