"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { GenerationDemo } from "./GenerationDemo";
import { PageTransitionLink } from "./PageTransitionLink";

type SavedItem = {
  id: string;
  type: "emoticon" | "character";
  title: string;
  emotion: string;
  category: string;
  character: string;
  phrase: string;
  image: string;
  favorite: boolean;
};

type LayerId = "background" | "character" | "accent" | "text";

type LayerState = {
  id: LayerId;
  label: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  text?: string;
};

const variations = [
  { id: "soft", label: "Soft 3D", image: "/assets/character-main.webp" },
  { id: "motion", label: "Motion Blue", image: "/assets/input-character.webp" },
  { id: "loop", label: "Loop Ready", image: "/assets/edit-character.webp" },
] as const;

const savedItems: SavedItem[] = [
  {
    id: "spark-thanks",
    type: "emoticon",
    title: "Spark Thanks",
    emotion: "happy",
    category: "감사",
    character: "Momo",
    phrase: "고마워!",
    image: "/assets/character-main.webp",
    favorite: true,
  },
  {
    id: "sorry-loop",
    type: "emoticon",
    title: "Soft Sorry",
    emotion: "sad",
    category: "사과",
    character: "Loop",
    phrase: "미안해",
    image: "/assets/edit-character.webp",
    favorite: false,
  },
  {
    id: "momo-token",
    type: "character",
    title: "Momo Token",
    emotion: "neutral",
    category: "캐릭터",
    character: "Momo",
    phrase: "3D default",
    image: "/assets/character-main.webp",
    favorite: false,
  },
  {
    id: "surprise-pop",
    type: "emoticon",
    title: "Surprise Pop",
    emotion: "surprised",
    category: "놀람",
    character: "Spark",
    phrase: "헉!",
    image: "/assets/input-character.webp",
    favorite: true,
  },
];

const emotionOptions = ["happy", "sad", "angry", "surprised", "neutral", "fearful", "disgusted", "other", "unknown"];
const categories = ["전체", "축하", "감사", "사과", "거절", "놀람"];
const inputDepths = ["Capture", "Voice", "Brief", "Generate"] as const;

export function CharacterCreatorLab() {
  const [palette, setPalette] = useState("Aurora mint");
  const [accent, setAccent] = useState("#7bf0d8");
  const [personality, setPersonality] = useState("calm");
  const [styleMode, setStyleMode] = useState("3D");
  const [selectedVariation, setSelectedVariation] = useState<(typeof variations)[number]>(variations[0]);
  const [prompt, setPrompt] = useState("작고 부드러운 우주 탐험가 캐릭터");
  const [generated, setGenerated] = useState(false);

  const summary = `${styleMode} ${personality} character with ${palette} palette and ${accent} point color.`;

  return (
    <section className="page-pane feature-page character-feature">
      <FeatureHeading eyebrow="CHARACTER PAGE" title="Character token playground" body="캐릭터 생성 화면의 설정, variation 선택, 저장 흐름을 API 없이 검증합니다." />
      <div className="feature-layout three-column">
        <aside className="glass-panel feature-card">
          <p className="eyebrow">SETTINGS</p>
          <FieldLabel label="Palette preset">
            <select value={palette} onChange={(event) => setPalette(event.target.value)}>
              <option>Aurora mint</option>
              <option>Lavender night</option>
              <option>Coral signal</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Point color">
            <input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} />
          </FieldLabel>
          <Segmented value={personality} values={["calm", "playful", "bold"]} onChange={setPersonality} />
          <FieldLabel label="Style mode">
            <select value={styleMode} onChange={(event) => setStyleMode(event.target.value)}>
              <option>2D</option>
              <option>3D</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Character brief">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />
          </FieldLabel>
          <button className="glass-button primary" onClick={() => setGenerated(true)} type="button">캐릭터 생성하기</button>
        </aside>

        <article className="glass-panel character-preview-card" style={{ "--accent": accent } as CSSProperties}>
          <p className="eyebrow">PREVIEW</p>
          <input className="title-input" defaultValue="Momo draft" aria-label="Character name" />
          <div className="character-preview-stage">
            {generated ? <img src={selectedVariation.image} alt="" /> : <span>Empty character state</span>}
          </div>
          <div className="toolbar-row">
            <button type="button" aria-label="Undo">↶</button>
            <button type="button" aria-label="Redo">↷</button>
            <PageTransitionLink className="glass-button" href="/library">캐릭터 저장하기</PageTransitionLink>
          </div>
        </article>

        <aside className="glass-panel feature-card">
          <p className="eyebrow">VARIATIONS</p>
          <div className="variation-grid">
            {variations.map((variation) => (
              <button className={variation.id === selectedVariation.id ? "is-selected" : ""} key={variation.id} onClick={() => {
                setSelectedVariation(variation);
                setGenerated(true);
              }} type="button">
                <img src={variation.image} alt="" />
                <span>{variation.label}</span>
              </button>
            ))}
          </div>
          <div className="summary-box">
            <span>Token summary</span>
            <strong>{summary}</strong>
            <small>{prompt}</small>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function InputDepthLab() {
  const [depth, setDepth] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [captured, setCaptured] = useState(false);
  const [voiceDone, setVoiceDone] = useState(false);
  const [emotion, setEmotion] = useState("happy");
  const [effectColor, setEffectColor] = useState("#7bf0d8");
  const [frameDelay, setFrameDelay] = useState(120);
  const [sentence, setSentence] = useState("고마워, 진짜 힘이 됐어");
  const canGenerate = captured && voiceDone && sentence.trim().length > 0;

  useEffect(() => {
    if (captureProgress <= 0 || captureProgress >= 100) return undefined;
    const timer = window.setTimeout(() => setCaptureProgress((value) => Math.min(100, value + 20)), 280);
    return () => window.clearTimeout(timer);
  }, [captureProgress]);

  useEffect(() => {
    if (voiceProgress <= 0 || voiceProgress >= 100) return undefined;
    const timer = window.setTimeout(() => setVoiceProgress((value) => Math.min(100, value + 25)), 260);
    return () => window.clearTimeout(timer);
  }, [voiceProgress]);

  useEffect(() => {
    if (captureProgress === 100) setCaptured(true);
  }, [captureProgress]);

  useEffect(() => {
    if (voiceProgress === 100) setVoiceDone(true);
  }, [voiceProgress]);

  return (
    <section className="page-pane feature-page input-feature">
      <FeatureHeading eyebrow="INPUT PAGE" title="Depth without global curtain" body="입력 화면의 많은 정보를 내부 depth로 나누고, depth 이동 중 전역 로더가 뜨지 않는지 검증합니다." />
      <div className="depth-tabs glass-panel">
        {inputDepths.map((label, index) => (
          <button className={depth === index ? "is-selected" : ""} key={label} onClick={() => setDepth(index)} type="button">
            <span>{String(index + 1).padStart(2, "0")}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="feature-layout input-grid">
        <article className="glass-panel feature-card input-stage-card">
          <p className="eyebrow">{inputDepths[depth]} DEPTH</p>
          {depth === 0 ? (
            <div className="input-depth-panel">
              <div className="camera-preview">
                <img src="/assets/input-character.webp" alt="" />
                <span>{captured ? "MediaPipe mock: smile + raised hands" : "Camera closed preview"}</span>
              </div>
              <button className="glass-button primary" onClick={() => {
                setCaptured(false);
                setCaptureProgress(20);
              }} type="button">카메라+음성 5초 입력</button>
              <ProgressMeter label="capture" value={captureProgress} />
              <Segmented value={captured ? "높음" : "중간"} values={["낮음", "중간", "높음"]} onChange={() => undefined} />
            </div>
          ) : null}
          {depth === 1 ? (
            <div className="input-depth-panel">
              <Waveform active={voiceProgress > 0 && voiceProgress < 100} />
              <button className="glass-button primary" onClick={() => {
                setVoiceDone(false);
                setVoiceProgress(25);
              }} type="button">5초 녹음</button>
              <ProgressMeter label="voice" value={voiceProgress} />
              <FieldLabel label="이모티콘 문장">
                <input value={sentence} onChange={(event) => setSentence(event.target.value)} />
              </FieldLabel>
            </div>
          ) : null}
          {depth === 2 ? (
            <div className="input-depth-panel brief-grid">
              <Readout title="행동" value={captured ? "만세 포즈 / 움직임 강도 높음" : "아직 입력 전"} />
              <Readout title="표정" value={captured ? "웃는 표정 / face mock" : "아직 입력 전"} />
              <Readout title="목소리" value={voiceDone ? `${sentence} / 음량은 모션 강도에 사용` : "아직 녹음 전"} />
              <Readout title="배경 효과" value={`${emotion} emotion, ${effectColor}`} />
            </div>
          ) : null}
          {depth === 3 ? (
            <div className="input-depth-panel">
              <Readout title="조건 확인" value={canGenerate ? "생성 가능" : "캐릭터, 행동 분석, 음성 전사가 필요합니다"} />
              <div className="generate-actions">
                <GenerationDemo />
                <PageTransitionLink className={`glass-button${canGenerate ? " primary" : ""}`} href="/edit">생성 후 Edit로 이동</PageTransitionLink>
              </div>
            </div>
          ) : null}
        </article>

        <aside className="glass-panel feature-card settings-stack">
          <p className="eyebrow">EMOTICON SETTINGS</p>
          <Readout title="Selected character" value="Momo Token / user generated" />
          <FieldLabel label="Frame delay">
            <input min={80} max={220} type="range" value={frameDelay} onChange={(event) => setFrameDelay(Number(event.target.value))} />
          </FieldLabel>
          <strong>{frameDelay}ms per frame</strong>
          <FieldLabel label="Emotion">
            <select value={emotion} onChange={(event) => setEmotion(event.target.value)}>
              {emotionOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Effect color">
            <input type="color" value={effectColor} onChange={(event) => setEffectColor(event.target.value)} />
          </FieldLabel>
          <p className="privacy-note">원본 영상/음성은 저장하지 않고, 테스트에서는 분석 summary만 mock으로 유지합니다.</p>
        </aside>
      </div>
    </section>
  );
}

export function EditWorkbenchLab() {
  const [frameIndex, setFrameIndex] = useState(0);
  const [activeLayer, setActiveLayer] = useState<LayerId>("character");
  const [layers, setLayers] = useState<LayerState[]>([
    { id: "background", label: "Background effects", x: 0, y: 0, scale: 1, rotation: 0, visible: true, locked: false },
    { id: "character", label: "Character", x: 8, y: 0, scale: 1, rotation: 0, visible: true, locked: false },
    { id: "accent", label: "Accent effects", x: -12, y: 8, scale: .82, rotation: 8, visible: true, locked: false },
    { id: "text", label: "Text", x: 0, y: 34, scale: 1, rotation: 0, visible: true, locked: false, text: "고마워!" },
  ]);
  const selected = layers.find((layer) => layer.id === activeLayer) ?? layers[0];

  const updateLayer = (patch: Partial<LayerState>) => {
    setLayers((items) => items.map((item) => item.id === activeLayer ? { ...item, ...patch } : item));
  };

  const moveLayer = (direction: -1 | 1) => {
    setLayers((items) => {
      const index = items.findIndex((item) => item.id === activeLayer);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const copy = [...items];
      const [removed] = copy.splice(index, 1);
      copy.splice(target, 0, removed);
      return copy;
    });
  };

  return (
    <section className="page-pane feature-page edit-feature">
      <FeatureHeading eyebrow="EDIT PAGE" title="4-layer and 5-frame workbench" body="레이어, 프레임, 텍스트, live preview가 route/loader/glass와 충돌하지 않는지 확인합니다." />
      <div className="edit-toolbar glass-panel">
        <input className="title-input" defaultValue="Spark Thanks loop" aria-label="Sticker save name" />
        <span>Saved locally 12s ago</span>
        <button className="glass-button" type="button">저장</button>
        <button className="glass-button primary" type="button">내보내기</button>
      </div>

      <div className="feature-layout edit-grid">
        <aside className="glass-panel feature-card">
          <p className="eyebrow">CORE EFFECT</p>
          <Segmented value="sparkle" values={["sparkle", "cloud", "pop"]} onChange={() => undefined} />
          <FieldLabel label="Effect color">
            <input type="color" defaultValue="#7bf0d8" />
          </FieldLabel>
          <FieldLabel label="Density">
            <input type="range" min="1" max="10" defaultValue="6" />
          </FieldLabel>
          <button className="glass-button" type="button">코어 이펙트 생성</button>
        </aside>

        <article className="glass-panel edit-stage-card">
          <div className="export-boundary" onClick={() => setActiveLayer("character")} role="presentation">
            {layers.map((layer) => layer.visible ? (
              <button
                className={`stage-layer layer-${layer.id}${activeLayer === layer.id ? " is-active" : ""}`}
                key={layer.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveLayer(layer.id);
                }}
                style={{
                  transform: `translate(${layer.x}px, ${layer.y}px) scale(${layer.scale}) rotate(${layer.rotation}deg)`,
                  zIndex: activeLayer === layer.id ? 8 : 2 + layers.findIndex((item) => item.id === layer.id),
                }}
                type="button"
              >
                {layer.id === "character" ? <img src="/assets/character-main.webp" alt="" /> : null}
                {layer.id === "text" ? <span>{layer.text}</span> : null}
              </button>
            ) : null)}
          </div>
          <div className="loop-preview">
            <span>Live loop preview</span>
            {[0, 1, 2, 3, 4].map((frame) => <button className={frame === frameIndex ? "is-selected" : ""} key={frame} onClick={() => setFrameIndex(frame)} type="button">{frame + 1}</button>)}
          </div>
        </article>

        <aside className="glass-panel feature-card property-panel">
          <p className="eyebrow">LAYER PROPERTIES</p>
          <strong>{selected.label}</strong>
          <FieldLabel label="X">
            <input type="number" value={selected.x} onChange={(event) => updateLayer({ x: Number(event.target.value) })} />
          </FieldLabel>
          <FieldLabel label="Y">
            <input type="number" value={selected.y} onChange={(event) => updateLayer({ y: Number(event.target.value) })} />
          </FieldLabel>
          <FieldLabel label="Scale">
            <input min=".5" max="1.8" step=".05" type="range" value={selected.scale} onChange={(event) => updateLayer({ scale: Number(event.target.value) })} />
          </FieldLabel>
          <FieldLabel label="Rotation">
            <input min="-35" max="35" type="range" value={selected.rotation} onChange={(event) => updateLayer({ rotation: Number(event.target.value) })} />
          </FieldLabel>
          {selected.id === "text" ? (
            <FieldLabel label="Text">
              <textarea value={selected.text} onChange={(event) => updateLayer({ text: event.target.value })} />
            </FieldLabel>
          ) : null}
          <div className="toggle-row">
            <button onClick={() => updateLayer({ visible: !selected.visible })} type="button">{selected.visible ? "Hide" : "Show"}</button>
            <button onClick={() => updateLayer({ locked: !selected.locked })} type="button">{selected.locked ? "Unlock" : "Lock"}</button>
          </div>
        </aside>
      </div>

      <div className="timeline-panel glass-panel">
        <div>
          <p className="eyebrow">4-LAYER & 5-FRAME EDITOR</p>
          <h2>Frame {frameIndex + 1}</h2>
        </div>
        <div className="layer-stack">
          {layers.map((layer) => (
            <button className={activeLayer === layer.id ? "is-selected" : ""} key={layer.id} onClick={() => setActiveLayer(layer.id)} type="button">
              <span aria-hidden="true" className="layer-dot" />
              {layer.label}
            </button>
          ))}
        </div>
        <div className="timeline-actions">
          <button type="button" onClick={() => setFrameIndex((value) => Math.max(0, value - 1))}>Prev frame</button>
          <button type="button" onClick={() => setFrameIndex((value) => Math.min(4, value + 1))}>Next frame</button>
          <button type="button" onClick={() => moveLayer(-1)}>Layer up</button>
          <button type="button" onClick={() => moveLayer(1)}>Layer down</button>
        </div>
      </div>
    </section>
  );
}

export function LibraryLab() {
  const [view, setView] = useState<"all" | "emoticon" | "character">("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [favorites, setFavorites] = useState(() => new Set(savedItems.filter((item) => item.favorite).map((item) => item.id)));

  const filtered = useMemo(() => savedItems.filter((item) => {
    const matchesView = view === "all" || item.type === view;
    const matchesQuery = `${item.title} ${item.character} ${item.phrase} ${item.category}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "전체" || item.category === category;
    return matchesView && matchesQuery && matchesCategory;
  }), [category, query, view]);

  return (
    <section className="page-pane feature-page library-feature">
      <FeatureHeading eyebrow="LIBRARY PAGE" title="Filter, favorite, detail, reuse" body="좌측 사이드바 디자인보다 실제 필터/카드 동작과 route 충돌을 검증합니다." />
      <div className="library-controls glass-panel">
        <Segmented value={view} values={["all", "emoticon", "character"]} onChange={(value) => setView(value as typeof view)} />
        <input placeholder="Search phrase, emotion, character" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="category-rail glass-panel">
        {categories.map((item) => (
          <button className={category === item ? "is-selected" : ""} key={item} onClick={() => setCategory(item)} type="button">{item}</button>
        ))}
      </div>
      <div className="library-grid">
        {filtered.map((item) => (
          <article className="glass-panel library-card" key={item.id}>
            <img src={item.image} alt="" />
            <span>{item.type}</span>
            <h2>{item.title}</h2>
            <p>{item.phrase} · {item.category}</p>
            <div className="card-actions">
              <button onClick={() => setFavorites((set) => {
                const next = new Set(set);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                return next;
              })} type="button">{favorites.has(item.id) ? "Favorited" : "Favorite"}</button>
              {item.type === "character" ? <PageTransitionLink href="/input">Select</PageTransitionLink> : <PageTransitionLink href={`/library/${item.id}`}>Detail</PageTransitionLink>}
              <PageTransitionLink href={item.type === "character" ? "/character" : "/edit"}>{item.type === "character" ? "Variant" : "Edit"}</PageTransitionLink>
            </div>
          </article>
        ))}
        {filtered.length === 0 ? <div className="glass-panel empty-state">조건에 맞는 항목이 없습니다. 검색어나 카테고리를 바꿔보세요.</div> : null}
      </div>
    </section>
  );
}

export function LibraryDetailLab({ itemId }: { itemId: string }) {
  const [index, setIndex] = useState(Math.max(0, savedItems.findIndex((item) => item.id === itemId)));
  const [favorite, setFavorite] = useState(savedItems[index]?.favorite ?? false);
  const item = savedItems[index] ?? savedItems[0];
  const previous = savedItems[(index - 1 + savedItems.length) % savedItems.length];
  const next = savedItems[(index + 1) % savedItems.length];

  return (
    <section className="page-pane feature-page detail-feature">
      <FeatureHeading eyebrow="LIBRARY DETAIL" title={item.title} body="상세 stage, 이전/다음 탐색, 수정/다운로드 action이 route 전환과 충돌하지 않는지 확인합니다." />
      <div className="detail-grid">
        <article className="glass-panel detail-stage">
          <button className="peek previous" onClick={() => setIndex((value) => (value - 1 + savedItems.length) % savedItems.length)} type="button">{previous.title}</button>
          <img src={item.image} alt="" />
          <button className="peek next" onClick={() => setIndex((value) => (value + 1) % savedItems.length)} type="button">{next.title}</button>
          <div className="carousel-dots">
            {savedItems.map((dot, dotIndex) => <button className={dotIndex === index ? "is-selected" : ""} key={dot.id} onClick={() => setIndex(dotIndex)} type="button" aria-label={dot.title} />)}
          </div>
        </article>
        <aside className="glass-panel feature-card detail-sidebar">
          <PageTransitionLink className="glass-button" href="/library">보관함으로 돌아가기</PageTransitionLink>
          <h2>{item.title}</h2>
          <Readout title="Format" value={item.type === "emoticon" ? "GIF / 5 frames / 1024 export" : "Character token"} />
          <Readout title="Tags" value={`${item.emotion}, ${item.category}, ${item.character}`} />
          <Readout title="Phrase" value={item.phrase} />
          <button className="glass-button" onClick={() => setFavorite((value) => !value)} type="button">{favorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
          <button className="glass-button" type="button">다운로드</button>
          <PageTransitionLink className="glass-button primary" href="/edit">수정하기</PageTransitionLink>
        </aside>
      </div>
    </section>
  );
}

function FeatureHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="page-heading feature-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{body}</p>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Segmented({ value, values, onChange }: { value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return (
    <div className="segmented-control">
      {values.map((item) => (
        <button className={value === item ? "is-selected" : ""} key={item} onClick={() => onChange(item)} type="button">{item}</button>
      ))}
    </div>
  );
}

function ProgressMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="mini-progress">
      <span>{label}</span>
      <strong>{value}%</strong>
      <i style={{ transform: `scaleX(${value / 100})` }} />
    </div>
  );
}

function Readout({ title, value }: { title: string; value: string }) {
  return (
    <div className="readout-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  return (
    <div className={`waveform${active ? " is-active" : ""}`} aria-label="Voice waveform">
      {Array.from({ length: 24 }, (_, index) => <span key={index} style={{ "--bar": `${18 + index % 7 * 9}%` } as CSSProperties} />)}
    </div>
  );
}
