import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { imageAssets } from "../data";
import { navigate } from "../router";
import {
  SHOWCASE_BATCH_SIZE,
  SHOWCASE_INTERVAL_MS,
  circularBatch,
  loadAnimatedStickerCollection,
  shuffled,
} from "../services/animated-library";
import {
  advanceShowcaseBodies,
  createShowcaseBodies,
  moveDraggedShowcaseBody,
  releaseDraggedShowcaseBody,
  type ShowcasePhysicsBody,
} from "../services/showcase-physics";
import type { StickerItem } from "../types";

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
} | null;

function ShowcaseFloatingField({ items, paused }: { items: StickerItem[]; paused: boolean }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const bodiesRef = useRef<ShowcasePhysicsBody[]>([]);
  const boundsRef = useRef({ width: 0, height: 0 });
  const pointerRef = useRef({ active: false, x: 0, y: 0 });
  const dragRef = useRef<DragState>(null);
  const reducedMotionRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const itemKey = items.map((item) => item.id).join("|");

  const placeBodies = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const nextBounds = { width: rect.width, height: rect.height };
    const previousBounds = boundsRef.current;
    const sameItems = bodiesRef.current.length === items.length
      && bodiesRef.current.every((body, index) => body.id === items[index]?.id);

    if (!sameItems || !previousBounds.width || !previousBounds.height) {
      bodiesRef.current = createShowcaseBodies(items.map((item) => item.id), nextBounds);
    } else {
      const scaleX = nextBounds.width / previousBounds.width;
      const scaleY = nextBounds.height / previousBounds.height;
      bodiesRef.current.forEach((body) => {
        body.x *= scaleX;
        body.y *= scaleY;
      });
    }
    boundsRef.current = nextBounds;
  }, [itemKey, items]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return undefined;

    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    placeBodies();
    const resizeObserver = new ResizeObserver(placeBodies);
    resizeObserver.observe(field);

    let frame = 0;
    let previousTime = performance.now();
    const startedAt = previousTime;

    const tick = (time: number) => {
      const bounds = boundsRef.current;
      const deltaSeconds = Math.min(0.05, Math.max(1 / 240, (time - previousTime) / 1000));
      previousTime = time;
      const drag = dragRef.current;

      if (drag) {
        const body = bodiesRef.current.find((candidate) => candidate.id === drag.id);
        if (body) {
          moveDraggedShowcaseBody(
            body,
            bounds,
            pointerRef.current.x - drag.offsetX,
            pointerRef.current.y - drag.offsetY,
            deltaSeconds,
          );
        }
      }

      if (!paused) {
        advanceShowcaseBodies(
          bodiesRef.current,
          bounds,
          pointerRef.current,
          deltaSeconds,
          (time - startedAt) / 1000,
          drag?.id ?? null,
          reducedMotionRef.current,
        );
      }

      bodiesRef.current.forEach((body) => {
        const element = itemRefs.current.get(body.id);
        if (!element) return;
        element.style.width = `${body.size}px`;
        element.style.height = `${body.size}px`;
        element.style.zIndex = String(10 + body.depth + (drag?.id === body.id ? 20 : 0));
        element.style.transform = `translate3d(${body.x - body.size / 2}px, ${body.y - body.size / 2}px, 0) rotate(${body.rotation}deg)`;
      });

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [itemKey, paused, placeBodies]);

  const updatePointer = useCallback((clientX: number, clientY: number, active = true) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    pointerRef.current = { active: active && (inside || Boolean(dragRef.current)), x, y };
  }, []);

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    if (drag) {
      const body = bodiesRef.current.find((candidate) => candidate.id === drag.id);
      if (body) releaseDraggedShowcaseBody(body);
    }
    dragRef.current = null;
    setDraggingId(null);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => updatePointer(event.clientX, event.clientY);
    const handlePointerLeave = (event: globalThis.PointerEvent) => {
      if (!dragRef.current) updatePointer(event.clientX, event.clientY, false);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [endDrag, updatePointer]);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    updatePointer(event.clientX, event.clientY);
    const body = bodiesRef.current.find((candidate) => candidate.id === id);
    if (!body) return;
    dragRef.current = {
      id,
      offsetX: pointerRef.current.x - body.x,
      offsetY: pointerRef.current.y - body.y,
    };
    setDraggingId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="floating-emoticon-field" ref={fieldRef}>
      {items.map((item) => (
        <button
          className={`floating-emoticon${draggingId === item.id ? " is-dragging" : ""}`}
          key={item.id}
          type="button"
          ref={(node) => {
            if (node) itemRefs.current.set(item.id, node);
            else itemRefs.current.delete(item.id);
          }}
          aria-label={`${item.title} 위치 옮기기`}
          onPointerDown={(event) => startDrag(event, item.id)}
          onClick={(event) => event.preventDefault()}
        >
          <span className="floating-emoticon-bob">
            <img src={item.animatedImage} alt={item.title} decoding="async" draggable={false} />
          </span>
        </button>
      ))}
    </div>
  );
}

export function ShowcasePage() {
  const [deck, setDeck] = useState<StickerItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let release: () => void = () => undefined;
    loadAnimatedStickerCollection()
      .then((collection) => {
        release = collection.release;
        if (!active) {
          release();
          return;
        }
        setDeck(shuffled(collection.items));
        setLoading(false);
        void collection.refresh.then((items) => {
          if (active) setDeck(shuffled(items));
        });
      })
      .catch(() => active && setDeck([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      release();
    };
  }, []);

  useEffect(() => {
    if (paused || deck.length <= SHOWCASE_BATCH_SIZE) return;
    const timer = window.setInterval(() => {
      setCursor((current) => (current + SHOWCASE_BATCH_SIZE) % deck.length);
      setCycle((current) => current + 1);
    }, SHOWCASE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [deck.length, paused]);

  const visibleItems = useMemo(() => circularBatch(deck, cursor), [deck, cursor]);
  const returnToPrevious = () => {
    if (window.history.length > 1) window.history.back();
    else navigate("/home", true);
  };

  return (
    <section className="showcase-page" aria-label="움직이는 이모티콘 쇼케이스">
      <div className="showcase-adjusted-content">
        <header className="showcase-header">
          <button className="showcase-logo" type="button" onClick={returnToPrevious} aria-label="EMOVE 로고, 이전 화면으로 돌아가기">
            <img src={imageAssets.logo} alt="" />
          </button>
          <p>ANIMATED EMOTICON ARCHIVE</p>
          <div className="showcase-header-actions">
            <span>EMOVE / GENERATED MOTION</span>
          </div>
        </header>

        <div className="showcase-glass-word" data-word="EMOVE" aria-hidden="true">EMOVE</div>
        {visibleItems.length ? (
          <div className="showcase-title" aria-hidden="true">
            <span>ANIMATED /</span>
            <strong>ARCHIVE</strong>
            <strong>IN MOTION</strong>
          </div>
        ) : null}

        {loading ? (
          <div className="showcase-state" role="status">움직이는 이모티콘을 불러오는 중</div>
        ) : visibleItems.length ? (
          <ShowcaseFloatingField key={cycle} items={visibleItems} paused={paused} />
        ) : (
          <div className="showcase-empty">
            <span>아직 움직이는 이모티콘이 없어요.</span>
            <p>이모티콘을 생성해 보세요.</p>
          </div>
        )}

        <footer className="showcase-footer">
          <span>{visibleItems.length.toString().padStart(2, "0")} / {deck.length.toString().padStart(2, "0")}</span>
          <div className={`showcase-cycle-track${paused ? " is-paused" : ""}${deck.length <= SHOWCASE_BATCH_SIZE ? " is-static" : ""}`} aria-hidden="true"><span key={cycle} /></div>
          <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "자동 전환 재생" : "자동 전환 일시 정지"}>
            <Icon name={paused ? "play" : "pause"} size={16} />
          </button>
          <small>© 2026. EMOVE. All rights reserved.</small>
        </footer>
      </div>
    </section>
  );
}
