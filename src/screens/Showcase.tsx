import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon } from "../components/Icon";
import { LiquidRippleCanvas } from "../components/LiquidRippleCanvas";
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

export function ShowcasePage() {
  const pageRef = useRef<HTMLElement>(null);
  const refractionLensRef = useRef<HTMLDivElement>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement>(null);
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

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    let frame = 0;
    let targetX = window.innerWidth * 0.5;
    let targetY = window.innerHeight * 0.5;
    let currentX = targetX;
    let currentY = targetY;
    let previousX = currentX;
    let previousY = currentY;
    let rippleEnergy = 0;
    let visible = false;
    let lastPointerMoveAt = 0;

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = page.getBoundingClientRect();
      const nextX = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
      const nextY = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
      rippleEnergy = Math.max(
        rippleEnergy,
        Math.min(1, Math.hypot(nextX - targetX, nextY - targetY) / 140),
      );
      targetX = nextX;
      targetY = nextY;
      visible = true;
      lastPointerMoveAt = performance.now();
      page.classList.add("has-water-pointer");
    };

    const renderPointerLens = () => {
      currentX += (targetX - currentX) * 0.26;
      currentY += (targetY - currentY) * 0.26;
      const shiftX = Math.max(-12, Math.min(12, (currentX - previousX) * 0.72));
      const shiftY = Math.max(-12, Math.min(12, (currentY - previousY) * 0.72));
      const speed = Math.max(
        Math.min(1, Math.hypot(shiftX, shiftY) / 12),
        rippleEnergy,
      );
      rippleEnergy *= 0.985;
      previousX = currentX;
      previousY = currentY;

      page.style.setProperty("--water-x", `${currentX}px`);
      page.style.setProperty("--water-y", `${currentY}px`);
      page.style.setProperty("--water-shift-x", `${shiftX}px`);
      page.style.setProperty("--water-shift-y", `${shiftY}px`);
      page.style.setProperty("--water-speed", speed.toFixed(3));
      page.style.setProperty("--water-hue", `${(speed * 8).toFixed(2)}deg`);
      page.style.setProperty("--water-lens-scale", (0.96 + speed * 0.04).toFixed(3));
      page.style.setProperty("--water-channel-opacity", (0.1 + speed * 0.8).toFixed(3));
      page.style.setProperty("--water-red-x", `${shiftX * 0.72}px`);
      page.style.setProperty("--water-red-y", `${shiftY * 0.32}px`);
      page.style.setProperty("--water-green-x", `${shiftX * -0.25}px`);
      page.style.setProperty("--water-green-y", `${shiftY * 0.55}px`);
      page.style.setProperty("--water-blue-x", `${shiftX * -0.62}px`);
      page.style.setProperty("--water-blue-y", `${shiftY * -0.45}px`);
      const displacementStrength = window.innerWidth < 760 ? 0.34 : 0.68;
      displacementRef.current?.setAttribute("scale", (0.08 + speed * displacementStrength).toFixed(2));
      if (visible && performance.now() - lastPointerMoveAt > 3_600) visible = false;
      page.style.setProperty(
        "--water-lens-opacity",
        visible ? (0.38 + speed * 0.62).toFixed(3) : "0",
      );
      if (refractionLensRef.current) {
        refractionLensRef.current.style.setProperty(
          "opacity",
          visible ? (0.38 + speed * 0.62).toFixed(3) : "0",
          "important",
        );
      }
      if (visible) page.classList.add("has-water-pointer");
      else page.classList.remove("has-water-pointer");
      frame = window.requestAnimationFrame(renderPointerLens);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    frame = window.requestAnimationFrame(renderPointerLens);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  const visibleItems = useMemo(() => circularBatch(deck, cursor), [deck, cursor]);
  const returnToPrevious = () => {
    if (window.history.length > 1) window.history.back();
    else navigate("/home", true);
  };

  return (
    <section ref={pageRef} className="showcase-page" aria-label="움직이는 이모티콘 쇼케이스">
      <svg className="showcase-water-filter" aria-hidden="true">
        <defs>
          <filter id="showcase-water-distortion" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.009 0.018"
              numOctaves="2"
              seed="7"
              stitchTiles="stitch"
              result="waterNoise"
            />
            <feDisplacementMap
              ref={displacementRef}
              in="SourceGraphic"
              in2="waterNoise"
              scale="0.08"
              xChannelSelector="R"
              yChannelSelector="B"
            />
          </filter>
        </defs>
      </svg>
      <button className="showcase-return-surface" type="button" onClick={returnToPrevious} aria-hidden="true" tabIndex={-1} />

      <div className="showcase-adjusted-content">
        <header className="showcase-header">
          <button className="showcase-logo" type="button" onClick={returnToPrevious} aria-label="EMOVE 로고, 이전 화면으로 돌아가기">
            <img src={imageAssets.logo} alt="" />
          </button>
          <p>ANIMATED EMOTICON ARCHIVE</p>
          <div className="showcase-header-actions">
            <span>화면을 클릭하면 이전 화면으로 돌아갑니다</span>
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
          <div className="floating-emoticon-field">
            {visibleItems.map((item, index) => {
              const [left, top, scale] = FLOATING_SLOTS[index];
              const seed = hash(`${item.id}-${cycle}-${index}`);
              const isBehind = index === 0 || (index > 1 && seed % 2 === 0);
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
                  className={`floating-emoticon ${isBehind ? "is-behind" : "is-front"}`}
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
      </div>

      <div className="showcase-adjustment-layer" aria-hidden="true">
        <LiquidRippleCanvas />
        <div ref={refractionLensRef} className="showcase-refraction-lens">
          <i className="refraction-channel refraction-red" />
          <i className="refraction-channel refraction-green" />
          <i className="refraction-channel refraction-blue" />
        </div>
      </div>
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
