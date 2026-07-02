import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { emotionMeta, emotionOrder } from "../data";
import { navigate, route } from "../router";
import { downloadBlob } from "../services/renderer";
import { loadProjects, loadStickers } from "../services/repository";
import { loadRemoteCharacters, loadRemoteStickers } from "../services/remote-store";
import { characters, loadProjectForEditing, notify, selectCharacter, stickers, toggleFavorite } from "../store";
import type { CharacterToken, EmoticonProject, Emotion, StickerItem } from "../types";

type Filter = "all" | "favorite" | Emotion;
type LibraryMode = "all" | "emoticons" | "characters";
type MixedLibraryItem = { kind: "emoticon"; item: StickerItem; createdAt: string } | { kind: "character"; item: CharacterToken; createdAt: string };
const categories: Array<{ id: string; title: string; copy: string; filter: Filter }> = [
  { id: "celebration", title: "축하", copy: "기쁨, 기쁜 순간", filter: "happy" },
  { id: "gratitude", title: "감사", copy: "고마움, 감사의 순간", filter: "happy" },
  { id: "apology", title: "사과", copy: "미안함, 미안한 순간", filter: "sad" },
  { id: "decline", title: "거절", copy: "난감함, 정중한 거절", filter: "neutral" },
  { id: "surprise", title: "놀람", copy: "새로운 소식", filter: "surprised" },
];

export function LibraryPage() {
  const railRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<LibraryMode>("all");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<EmoticonProject[]>([]);
  const [customGroups, setCustomGroups] = useState<Array<{ id: string; name: string; filter: Filter }>>([]);
  const detailId = route.value.startsWith("/library/") ? route.value.split("/")[2] : undefined;

  useEffect(() => {
    Promise.all([loadStickers(), loadProjects(), loadRemoteStickers(), loadRemoteCharacters()]).then(([saved, savedProjects, remoteStickers, remoteCharacters]) => {
      const projectById = new Map(savedProjects.map((project) => [project.id, project]));
      const hydrated = saved.filter((item) => !item.isDefault).map((item) => {
        const project = projectById.get(item.projectId ?? item.id);
        if (!project?.gifBlob) return item;
        const animatedImage = item.animatedImage?.startsWith("http") ? item.animatedImage : URL.createObjectURL(project.gifBlob);
        return { ...item, image: item.thumbnail ?? item.image, thumbnail: item.thumbnail ?? item.image, animatedImage };
      });
      const known = new Set(stickers.value.map((item) => item.id));
      const localOnly = hydrated.filter((item) => !known.has(item.id));
      const visibleIds = new Set([...known, ...localOnly.map((item) => item.id)]);
      const mergedRemoteStickers = remoteStickers.enabled ? remoteStickers.stickers.filter((item) => !visibleIds.has(item.id)) : [];
      stickers.value = [...mergedRemoteStickers, ...localOnly, ...stickers.value];
      if (remoteCharacters.enabled) {
        const knownCharacters = new Set(characters.value.map((item) => item.id));
        characters.value = [...remoteCharacters.characters.filter((item) => !knownCharacters.has(item.id)), ...characters.value];
      }
      setProjects(savedProjects);
    }).catch(() => undefined);
  }, []);

  const visible = useMemo(() => stickers.value.filter((item) =>
    (filter === "all" || (filter === "favorite" ? item.favorite : item.emotion === filter))
    && (!query.trim() || `${item.title} ${item.phrase}`.toLowerCase().includes(query.toLowerCase()))
  ), [stickers.value, filter, query]);
  const visibleCharacters = useMemo(() => characters.value.filter((item) =>
    !query.trim() || `${item.name} ${item.prompt} ${item.personalityTags.join(" ")}`.toLowerCase().includes(query.toLowerCase())
  ), [characters.value, query]);
  const mixedItems = useMemo<MixedLibraryItem[]>(() => [
    ...visible.map((item) => ({ kind: "emoticon" as const, item, createdAt: item.createdAt })),
    ...visibleCharacters.map((item) => ({ kind: "character" as const, item, createdAt: item.createdAt })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [visible, visibleCharacters]);
  const selected = detailId ? stickers.value.find((item) => item.id === detailId) ?? stickers.value[0] : undefined;
  const beginEditSticker = async (item: StickerItem, project?: EmoticonProject) => {
    const source = project ?? (await loadProjects()).find((candidate) => candidate.id === (item.projectId ?? item.id));
    if (!source) {
      notify("원본 프로젝트가 없어 이 항목은 덮어쓰기 수정이 어렵습니다.");
      return;
    }
    loadProjectForEditing(source);
    navigate("/edit");
  };
  const createGroup = () => {
    const name = window.prompt("새 그룹 이름을 입력하세요.", "새 이모티콘 그룹")?.trim();
    if (!name) return;
    const id = `group-${Date.now()}`;
    setCustomGroups((groups) => [...groups, { id, name, filter: emotionOrder.includes(filter as Emotion) ? filter : "all" }]);
    notify(`${name} 그룹을 만들었어요. 현재 필터 조건이 적용됩니다.`);
  };
  const beginRailDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current; if (!rail) return;
    const startX = event.clientX; const startScroll = rail.scrollLeft; let dragged = false;
    const move = (next: PointerEvent) => {
      const delta = next.clientX - startX;
      if (Math.abs(delta) > 4) dragged = true;
      rail.scrollLeft = startScroll - delta;
      if (dragged) next.preventDefault();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (dragged) rail.classList.add("was-dragged");
      window.setTimeout(() => rail.classList.remove("was-dragged"), 80);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { once: true });
  };

  return (
    <>
      {selected ? <LibraryDetail item={selected} project={projects.find((item) => item.id === (selected.projectId ?? selected.id))} onEdit={beginEditSticker} /> : (
        <div className="workspace-page library-page">
          <aside className="library-sidebar glass-panel">
            <h1>이모티콘 그룹</h1>
            <label className="library-search"><Icon name="search" /><input type="search" placeholder="문장이나 감정 검색" value={query} onInput={(event) => setQuery(event.currentTarget.value)} /></label>
            <nav aria-label="이모티콘 보관함 메뉴">
              <button type="button" className={mode === "all" && filter === "all" ? "active" : ""} onClick={() => { setMode("all"); setFilter("all"); setActiveCategoryId(null); }}><Icon name="layers" />전체</button>
              <button type="button" className={filter === "favorite" ? "active" : ""} onClick={() => { setMode("emoticons"); setFilter("favorite"); setActiveCategoryId(null); }}><Icon name="star" />자주쓰는 이모티콘</button>
              <button type="button" className={mode === "emoticons" && filter === "all" ? "active" : ""} onClick={() => { setMode("emoticons"); setFilter("all"); setActiveCategoryId(null); }}><Icon name="image" />이모티콘 탐색</button>
              <hr />
              <button type="button" className={mode === "characters" ? "active" : ""} onClick={() => setMode("characters")}><Icon name="folder" />캐릭터 그룹</button>
              {customGroups.map((group) => <button type="button" className={activeCategoryId === group.id ? "active" : ""} onClick={() => { setMode("emoticons"); setFilter(group.filter); setActiveCategoryId(group.id); }}><Icon name="folder" />{group.name}</button>)}
              <button type="button" onClick={() => { setMode("emoticons"); setFilter("all"); setActiveCategoryId(null); }}><Icon name="folder" />이모티콘 그룹</button>
              <button type="button" className="muted" onClick={createGroup}><Icon name="add" />새 그룹 생성하기</button>
            </nav>
          </aside>

          <section className="library-content">
            <header className="library-content-header"><div><span>{mode === "characters" ? "CHARACTER LIBRARY" : mode === "emoticons" ? "EMOTICON LIBRARY" : "EMOVE LIBRARY"}</span><h2>{mode === "characters" ? "캐릭터 보관함" : mode === "emoticons" ? "이모티콘 보관함" : "전체 보관함"}</h2></div><div className="library-mode-tabs" role="tablist" aria-label="보관함 보기 전환"><button type="button" className={mode === "all" ? "active" : ""} onClick={() => { setMode("all"); setFilter("all"); setActiveCategoryId(null); }}>전체</button><button type="button" className={mode === "emoticons" ? "active" : ""} onClick={() => { setMode("emoticons"); setFilter("all"); setActiveCategoryId(null); }}>이모티콘</button><button type="button" className={mode === "characters" ? "active" : ""} onClick={() => { setMode("characters"); setFilter("all"); setActiveCategoryId(null); }}>캐릭터</button></div></header>
            {mode !== "characters" ? <div className="library-category-rail-wrap"><div ref={railRef} className="library-category-rail" aria-label="이모티콘 상황 분류" onPointerDown={beginRailDrag}>{categories.map((category) => <button type="button" className={activeCategoryId === category.id ? "active" : ""} onClick={() => { setMode("emoticons"); setFilter(category.filter); setActiveCategoryId(category.id); }}><span><Icon name="image" /></span><strong>{category.title}</strong><small>{category.title} · {category.copy}</small></button>)}</div></div> : null}
            {mode === "all" ? (
              mixedItems.length ? <div className="sticker-grid library-mixed-grid">{mixedItems.map((entry, index) => entry.kind === "emoticon" ? <StickerCard item={entry.item} index={index} project={projects.find((project) => project.id === (entry.item.projectId ?? entry.item.id))} onEdit={beginEditSticker} /> : <CharacterCard item={entry.item} index={index} />)}</div> : <div className="empty-library glass-panel"><Icon name="folder" size={32} /><h2>조건에 맞는 항목이 없어요.</h2><p>검색어나 그룹 조건을 바꿔보세요.</p></div>
            ) : mode === "emoticons" ? (
              visible.length ? <div className="sticker-grid">{visible.map((item, index) => <StickerCard item={item} index={index} project={projects.find((project) => project.id === (item.projectId ?? item.id))} onEdit={beginEditSticker} />)}</div> : <div className="empty-library glass-panel"><Icon name="folder" size={32} /><h2>조건에 맞는 움직임이 없어요.</h2><p>다른 감정을 선택하거나 검색어를 바꿔보세요.</p></div>
            ) : (
              visibleCharacters.length ? <div className="sticker-grid character-card-grid">{visibleCharacters.map((item, index) => <CharacterCard item={item} index={index} />)}</div> : <div className="empty-library glass-panel"><Icon name="folder" size={32} /><h2>조건에 맞는 캐릭터가 없어요.</h2><p>새 캐릭터를 만들거나 검색어를 바꿔보세요.</p></div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function CharacterCard({ item, index }: { item: CharacterToken; index: number }) {
  return (
    <article className="sticker-card character-token-card glass-panel">
      <button className="sticker-preview" type="button" onClick={() => { selectCharacter(item.id); navigate("/input"); }}><span className="sticker-glow" style={{ background: item.colors.body ?? item.colors.accent ?? "#BBB6FF" }} /><img src={item.sourceAsset} alt={`${item.name} 캐릭터`} loading={index > 2 ? "lazy" : "eager"} decoding="async" /></button>
      <footer><strong>{item.name}</strong><div><button type="button" onClick={() => { selectCharacter(item.id); navigate("/input"); }} aria-label="선택"><Icon name="check" /></button><button type="button" onClick={() => navigate("/character")} aria-label="새 변형 만들기"><Icon name="edit" /></button></div></footer>
    </article>
  );
}

function StickerCard({ item, index, project, onEdit }: { item: StickerItem; index: number; project?: EmoticonProject; onEdit: (item: StickerItem, project?: EmoticonProject) => void }) {
  const stillImage = item.thumbnail ?? item.image;
  const animatedImage = item.animatedImage && item.animatedImage !== stillImage ? item.animatedImage : null;
  return (
    <article className={`sticker-card glass-panel masonry-${index % 4}`}>
      <button className="sticker-preview" type="button" onClick={() => navigate(`/library/${item.id}`)}><span className="sticker-glow" style={{ background: item.color }} /><img className="sticker-static" src={stillImage} alt={`${item.phrase} 이모티콘`} loading={index > 2 ? "lazy" : "eager"} decoding="async" />{animatedImage ? <img className="sticker-animated" src={animatedImage} alt="" loading="lazy" decoding="async" aria-hidden="true" /> : null}</button>
      <footer><strong>{item.title}</strong><div><button type="button" onClick={() => onEdit(item, project)} aria-label="수정"><Icon name="edit" /></button><button type="button" onClick={() => navigate(`/library/${item.id}`)} aria-label="상세 보기"><Icon name="download" /></button><button className={item.favorite ? "active" : ""} type="button" onClick={() => toggleFavorite(item.id)} aria-label="즐겨찾기"><Icon name="star" /></button></div></footer>
    </article>
  );
}

function LibraryDetail({ item, project, onEdit }: { item: StickerItem; project?: EmoticonProject; onEdit: (item: StickerItem, project?: EmoticonProject) => void }) {
  const stillImage = item.thumbnail ?? item.image;
  const animatedImage = item.animatedImage ?? item.image;
  const selectedIndex = Math.max(0, stickers.value.findIndex((candidate) => candidate.id === item.id));
  const previous = stickers.value[(selectedIndex - 1 + stickers.value.length) % stickers.value.length];
  const next = stickers.value[(selectedIndex + 1) % stickers.value.length];
  const go = (target?: StickerItem) => target && navigate(`/library/${target.id}`);
  const download = async () => {
    if (project?.gifBlob) downloadBlob(project.gifBlob, `${item.id}.gif`);
    else {
      const response = await fetch(animatedImage);
      downloadBlob(await response.blob(), `${item.id}.${item.animatedImage ? "gif" : "png"}`);
    }
    notify(project || item.animatedImage ? "투명 GIF를 저장했어요." : "기본 에셋 이미지를 저장했어요.");
  };
  const modified = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.updatedAt));

  return (
    <div className="workspace-page library-detail-page">
      <div className="library-carousel-stage">
        <button className="carousel-peek previous" type="button" onClick={() => go(previous)} aria-label="이전 이모티콘"><img src={previous?.thumbnail ?? previous?.image} alt="" /></button>
        <button className="carousel-arrow previous" type="button" onClick={() => go(previous)} aria-label="이전"><Icon name="previous" size={26} /></button>
        <div className="detail-stage glass-panel"><img src={animatedImage} alt={item.phrase} /></div>
        <button className="carousel-arrow next" type="button" onClick={() => go(next)} aria-label="다음"><Icon name="next" size={26} /></button>
        <button className="carousel-peek next" type="button" onClick={() => go(next)} aria-label="다음 이모티콘"><img src={next?.thumbnail ?? next?.image} alt="" /></button>
        <div className="carousel-dots" aria-label={`${selectedIndex + 1} / ${stickers.value.length}`}>{stickers.value.slice(0, 5).map((candidate) => <button type="button" className={candidate.id === item.id ? "active" : ""} onClick={() => go(candidate)} aria-label={candidate.title} />)}</div>
      </div>

      <aside className="detail-sidebar glass-panel">
        <button className="detail-close" type="button" onClick={() => navigate("/library")} aria-label="보관함으로 돌아가기"><Icon name="close" /></button>
        <div className="detail-copy"><h1>{item.title}</h1><p>최근 수정일　{modified}</p></div>
        <div className="detail-token-row"><span><b>1:1</b><small>비율</small></span><span><img src={stillImage} alt="" /><small>썸네일</small></span></div>
        <div className="detail-actions"><button type="button" onClick={download} aria-label="저장"><Icon name="download" /></button><button className={item.favorite ? "active" : ""} type="button" onClick={() => toggleFavorite(item.id)} aria-label="즐겨찾기"><Icon name="star" /></button><button type="button" onClick={() => onEdit(item, project)}>수정하기</button></div>
        <div className="detail-tags"><span>#밝은</span><span>#인사하는</span><span>#{item.emotion === "happy" ? "행복한" : emotionMeta[item.emotion].label}</span><span>#여자</span><span>#사람</span><span>#귀여운</span></div>
        <dl className="detail-spec"><div><dt>파일</dt><dd>{project ? "투명 GIF" : "투명 PNG"}</dd></div><div><dt>레이어</dt><dd>{project ? "4 layers" : "기본 에셋"}</dd></div><div><dt>문구</dt><dd>{item.phrase}</dd></div></dl>
      </aside>
    </div>
  );
}
