import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import type { StickerItem } from "../types";

const FLOATING_SLOTS = [
  [7, 18, 0.84], [25, 8, 1.08], [48, 13, 0.76], [72, 7, 1.02], [87, 23, 0.72],
  [13, 47, 1.12], [36, 39, 0.82], [63, 44, 1.18], [81, 50, 0.92],
  [5, 72, 0.74], [43, 70, 1.02], [75, 73, 0.8],
] as const;

type FloatStyle = CSSProperties & Record<`--${string}`, string | number>;

function LiquidBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const pointer = { x: .5, y: .5, targetX: .5, targetY: .5 };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 1;
    let height = 1;
    let frame = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const trackPointer = (event: PointerEvent) => {
      pointer.targetX = Math.min(1, Math.max(0, event.clientX / window.innerWidth));
      pointer.targetY = Math.min(1, Math.max(0, event.clientY / window.innerHeight));
    };

    const drawWave = (time: number, y: number, amplitude: number, color: string, phase: number) => {
      context.beginPath();
      context.moveTo(-80, height + 80);
      context.lineTo(-80, y);
      const segments = 8;
      for (let index = 0; index <= segments; index += 1) {
        const x = (width / segments) * index;
        const distance = Math.abs(x / width - pointer.x);
        const lens = Math.max(0, 1 - distance * 3.2);
        const wave = Math.sin(index * .82 + time * .00042 + phase) * amplitude;
        const displacement = lens * (pointer.y - .5) * height * .19;
        context.lineTo(x, y + wave + displacement);
      }
      context.lineTo(width + 80, height + 80);
      context.closePath();
      context.fillStyle = color;
      context.fill();
    };

    const render = (time: number) => {
      pointer.x += (pointer.targetX - pointer.x) * (reducedMotion ? 1 : .065);
      pointer.y += (pointer.targetY - pointer.y) * (reducedMotion ? 1 : .065);
      const light = document.documentElement.dataset.theme === "light";
      context.fillStyle = light ? "#e8f2ff" : "#080914";
      context.fillRect(0, 0, width, height);

      context.strokeStyle = light ? "rgba(42,72,104,.055)" : "rgba(183,202,255,.045)";
      context.lineWidth = 1;
      const grid = Math.max(48, Math.min(76, width / 18));
      const offsetX = (pointer.x - .5) * 14;
      const offsetY = (pointer.y - .5) * 14;
      context.beginPath();
      for (let x = -grid + offsetX; x < width + grid; x += grid) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let y = -grid + offsetY; y < height + grid; y += grid) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();

      if (light) {
        drawWave(time, height * .38, height * .055, "rgba(116,185,255,.18)", .3);
        drawWave(time, height * .57, height * .07, "rgba(151,125,255,.14)", 1.8);
        drawWave(time, height * .76, height * .045, "rgba(255,174,222,.12)", 3.1);
      } else {
        drawWave(time, height * .38, height * .055, "rgba(68,117,181,.16)", .3);
        drawWave(time, height * .57, height * .07, "rgba(95,74,190,.15)", 1.8);
        drawWave(time, height * .76, height * .045, "rgba(159,81,139,.1)", 3.1);
      }

      const lensX = pointer.x * width;
      const lensY = pointer.y * height;
      const lens = context.createRadialGradient(lensX, lensY, 0, lensX, lensY, Math.min(width, height) * .28);
      lens.addColorStop(0, light ? "rgba(255,255,255,.34)" : "rgba(187,203,255,.13)");
      lens.addColorStop(.28, light ? "rgba(128,188,255,.12)" : "rgba(112,96,230,.1)");
      lens.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = lens;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = light ? "rgba(255,255,255,.5)" : "rgba(226,230,255,.2)";
      context.lineWidth = 1.2;
      for (let ring = 0; ring < 3; ring += 1) {
        context.beginPath();
        context.ellipse(lensX, lensY, 72 + ring * 46, 28 + ring * 18, 0, 0, Math.PI * 2);
        context.stroke();
      }

      if (!reducedMotion) frame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", trackPointer, { passive: true });
    render(performance.now());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", trackPointer);
    };
  }, []);

  return <canvas ref={canvasRef} className="showcase-liquid-canvas" aria-hidden="true" />;
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
      <LiquidBackdrop />
      <button className="showcase-return-surface" type="button" onClick={returnToPrevious} aria-label="이전 화면으로 돌아가기" />

      <header className="showcase-header">
        <button className="showcase-logo" type="button" onClick={returnToPrevious} aria-label="이전 화면으로 돌아가기">
          <img src={imageAssets.logo} alt="" />
        </button>
        <p>ANIMATED EMOTICON ARCHIVE</p>
        <div className="showcase-header-actions">
          <span>화면을 클릭하면 이전 화면으로 돌아갑니다</span>
        </div>
      </header>

      <div className="showcase-glass-word" aria-hidden="true">EMOVE</div>
      <div className="showcase-title" aria-hidden="true">
        <span>{visibleItems.length ? "ANIMATED /" : "EMPTY /"}</span>
        <strong>{visibleItems.length ? "ARCHIVE" : "CREATE"}</strong>
        <strong>{visibleItems.length ? "IN MOTION" : "EMOTICON"}</strong>
      </div>

      {loading ? (
        <div className="showcase-state" role="status">움직이는 이모티콘을 불러오는 중</div>
      ) : visibleItems.length ? (
        <div className="floating-emoticon-field">
          {visibleItems.map((item, index) => {
            const [left, top, scale] = FLOATING_SLOTS[index];
            const seed = hash(`${item.id}-${cycle}-${index}`);
            const style: FloatStyle = {
              left: `${left}%`,
              top: `${top}%`,
              "--float-scale": scale,
              "--float-x": `${10 + seed % 19}px`,
              "--float-y": `${8 + seed % 14}px`,
              "--float-duration": `${7 + (seed % 50) / 10}s`,
              "--float-delay": `${-(seed % 60) / 10}s`,
              "--float-tilt": `${(seed % 9) - 4}deg`,
              "--float-depth": `${10 + Math.round(scale * 10)}`,
            };
            return (
              <button
                className={`floating-emoticon ${seed % 3 === 0 ? "is-behind" : "is-front"}`}
                key={`${cycle}-${item.id}`}
                type="button"
                style={style}
                aria-label={`${item.title}, 이전 화면으로 돌아가기`}
                onClick={returnToPrevious}
              >
                <span className="floating-emoticon-bob">
                  <img src={item.animatedImage} alt={item.title} decoding="async" draggable={false} />
                </span>
              </button>
            );
          })}
        </div>
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
    </section>
  );
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
