import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { emotionMeta, emotionOrder } from "../data";
import { navigate, route } from "../router";
import { downloadBlob } from "../services/renderer";
import { deleteCharacter, deleteSticker, loadProjects, loadStickers } from "../services/repository";
import { loadRemoteCharacters, loadRemoteStickers } from "../services/remote-store";
import { animationExtension } from "../services/share";
import { characterName, characterPrompt, characterStyle, characterTone, characters, loadProjectForEditing, notify, sanitizeAssetUrl, selectCharacter, stickers, toggleFavorite } from "../store";
import type { AnimationFormat, CharacterToken, EmoticonProject, Emotion, StickerItem } from "../types";

type Filter = "all" | "favorite" | Emotion;
type LibraryMode = "all" | "emoticons" | "characters";
type MixedLibraryItem = { kind: "emoticon"; item: StickerItem; createdAt: string } | { kind: "character"; item: CharacterToken; createdAt: string };
type VirtualLibraryItem = { entry: MixedLibraryItem; virtualIndex: number; copy: number };

const categories: Array<{ id: string; title: string; copy: string; filter: Filter }> = [
  { id: "celebration", title: "축하", copy: "기쁨, 기쁜 순간", filter: "happy" },
  { id: "gratitude", title: "감사", copy: "고마움, 감사의 순간", filter: "happy" },
  { id: "apology", title: "사과", copy: "미안함, 미안한 순간", filter: "sad" },
  { id: "decline", title: "거절", copy: "난감함, 정중한 거절", filter: "neutral" },
  { id: "surprise", title: "놀람", copy: "새로운 소식", filter: "surprised" },
];

const carouselInactiveWidth = 442;

export function LibraryPage() {
  const railRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<LibraryMode>("all");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<EmoticonProject[]>([]);
  const [customGroups, setCustomGroups] = useState<Array<{ id: string; name: string; filter: Filter }>>([]);
  const [selectedCharacterToken, setSelectedCharacterToken] = useState<CharacterToken | null>(null);
  const [railOverflow, setRailOverflow] = useState({ left: false, right: false });

  const detailId = route.value.startsWith("/library/") ? route.value.split("/")[2] : undefined;

  useEffect(() => {
    Promise.all([loadStickers(), loadProjects(), loadRemoteStickers(), loadRemoteCharacters()]).then(([saved, savedProjects, remoteStickers, remoteCharacters]) => {
      const projectById = new Map(savedProjects.map((project) => [project.id, project]));
      const hydrated = saved.filter((item) => !item.isDefault).map((item) => {
        const project = projectById.get(item.projectId ?? item.id);
        const projectBlob = project?.animationBlob ?? project?.gifBlob;
        if (!projectBlob) return item;
        const animatedImage = item.animatedImage?.startsWith("http") ? item.animatedImage : URL.createObjectURL(projectBlob);
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

  const beginEditCharacter = (token: CharacterToken) => {
    characterName.value = token.name;
    characterPrompt.value = token.prompt;
    characterTone.value = token.colors.body ?? "#BBB6FF";
    characterStyle.value = token.styleMode;
    setSelectedCharacterToken(null);
    navigate("/character");
  };

  const [activeVirtualIndex, setActiveVirtualIndex] = useState(0);
  const [isListDragging, setIsListDragging] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const normalizeTimerRef = useRef<number | undefined>(undefined);
  const wheelCooldownRef = useRef(false);
  const carouselDragRef = useRef<{ pointerId: number; startX: number; startY: number; startScroll: number; dragged: boolean; startIndex: number } | null>(null);
  const suppressCardClickRef = useRef(false);


  const itemsToDisplay = useMemo(() => {
    if (mode === "emoticons") {
      return visible.map((item) => ({ kind: "emoticon" as const, item, createdAt: item.createdAt }));
    }
    if (mode === "characters") {
      return visibleCharacters.map((item) => ({ kind: "character" as const, item, createdAt: item.createdAt }));
    }
    return mixedItems;
  }, [mode, visible, visibleCharacters, mixedItems]);

  const virtualItems = useMemo<VirtualLibraryItem[]>(() => {
    return itemsToDisplay.map((entry, index) => ({
      entry,
      virtualIndex: index,
      copy: 0,
    }));
  }, [itemsToDisplay]);

  const getCarouselStride = () => {
    const list = listRef.current;
    if (!list) return carouselInactiveWidth;
    const cards = list.querySelectorAll<HTMLElement>(".carousel-card");
    for (const card of Array.from(cards)) {
      if (card.classList.contains("inactive")) {
        return card.offsetWidth;
      }
    }
    // Fallback: if all cards are active or we can't find one, measure the first card and scale it
    const firstCard = cards[0];
    if (firstCard) {
      if (firstCard.classList.contains("active")) {
        // active card is var(--library-card-active) which is 568/442 times larger
        return Math.round(firstCard.offsetWidth * (442 / 568));
      }
      return firstCard.offsetWidth;
    }
    return carouselInactiveWidth;
  };

  const scrollToVirtualIndex = (virtualIndex: number, behavior: ScrollBehavior = "smooth") => {
    const list = listRef.current;
    if (!list) return;
    
    // Update active index state immediately!
    const length = itemsToDisplay.length;
    if (length > 0) {
      const clampedIndex = Math.max(0, Math.min(length - 1, virtualIndex));
      setActiveVirtualIndex(clampedIndex);
      
      isScrollingRef.current = true;
      window.clearTimeout(normalizeTimerRef.current);
      
      const targetLeft = clampedIndex * getCarouselStride();
      list.scrollTo({ left: targetLeft, behavior });
      
      // Release lock after animation settles
      window.setTimeout(() => { 
        isScrollingRef.current = false; 
      }, behavior === "smooth" ? 500 : 60);
    }
  };

  useEffect(() => {
    setActiveVirtualIndex(0);
    const frame = window.requestAnimationFrame(() => scrollToVirtualIndex(0, "auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [mode, filter, query, itemsToDisplay.length]);

  const selectVirtualItem = (virtualIndex: number) => {
    if (suppressCardClickRef.current) return;
    setActiveVirtualIndex(virtualIndex);
    scrollToVirtualIndex(virtualIndex);
  };

  const moveCarousel = (direction: -1 | 1) => {
    const length = itemsToDisplay.length;
    if (!length) return;
    const next = (activeVirtualIndex + direction + length) % length;
    scrollToVirtualIndex(next, "smooth");
  };

  const getNearestVirtualIndex = () => {
    const list = listRef.current;
    if (!list) return activeVirtualIndex;
    const stride = getCarouselStride();
    if (stride <= 0) return activeVirtualIndex;
    
    // Nearest index is simply scrollLeft divided by stride!
    const index = Math.round(list.scrollLeft / stride);
    const maxIndex = itemsToDisplay.length - 1;
    return Math.max(0, Math.min(maxIndex, index));
  };

  const handleScroll = () => {
    if (isScrollingRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const length = itemsToDisplay.length;
    if (!length) return;
    
    // Update active index based on nearest card
    const index = getNearestVirtualIndex();
    if (index !== activeVirtualIndex) {
      setActiveVirtualIndex(index);
    }
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onWheel = (e: WheelEvent) => {
      if (itemsToDisplay.length < 2) return;

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 15) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      if (wheelCooldownRef.current || isScrollingRef.current) return;

      wheelCooldownRef.current = true;
      const nextVirtualIndex = delta > 0 ? activeVirtualIndex + 1 : activeVirtualIndex - 1;
      const clampedIndex = Math.max(0, Math.min(itemsToDisplay.length - 1, nextVirtualIndex));
      
      if (clampedIndex !== activeVirtualIndex) {
        scrollToVirtualIndex(clampedIndex, "smooth");
      }

      window.setTimeout(() => {
        wheelCooldownRef.current = false;
      }, 500);
    };

    list.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      list.removeEventListener("wheel", onWheel);
    };
  }, [itemsToDisplay.length, activeVirtualIndex]);

  const beginCarouselDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select")) return;
    const list = listRef.current;
    if (!list) return;
    isUserInteractingRef.current = true;
    window.clearTimeout(normalizeTimerRef.current);
    carouselDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: list.scrollLeft,
      dragged: false,
      startIndex: activeVirtualIndex,
    };
    list.setPointerCapture(event.pointerId);
  };

  const moveCarouselDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = carouselDragRef.current;
    const list = listRef.current;
    if (!drag || !list) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      drag.dragged = true;
      setIsListDragging(true);
    }
    if (drag.dragged) {
      event.preventDefault();
      list.scrollLeft = drag.startScroll - deltaX;
    }
  };

  const endCarouselDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = carouselDragRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    
    setIsListDragging(false);
    isUserInteractingRef.current = false;

    if (drag) {
      const deltaX = event.clientX - drag.startX;
      const threshold = 50; // Drag more than 50px to go to next/prev card
      let targetVirtualIndex = drag.startIndex;
      
      if (deltaX < -threshold) {
        targetVirtualIndex = drag.startIndex + 1;
      } else if (deltaX > threshold) {
        targetVirtualIndex = drag.startIndex - 1;
      }
      
      const clampedIndex = Math.max(0, Math.min(itemsToDisplay.length - 1, targetVirtualIndex));

      suppressCardClickRef.current = drag.dragged;
      scrollToVirtualIndex(clampedIndex, "smooth");

      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 120);
    }

    carouselDragRef.current = null;
  };

  const handleDelete = async (id: string, kind: "emoticon" | "character") => {
    if (!window.confirm("정말로 이 항목을 삭제하시겠습니까?")) return;
    try {
      if (kind === "emoticon") {
        await deleteSticker(id);
        stickers.value = stickers.value.filter((s) => s.id !== id);
        notify("이모티콘을 삭제했습니다.");
      } else {
        await deleteCharacter(id);
        characters.value = characters.value.filter((c) => c.id !== id);
        notify("캐릭터를 삭제했습니다.");
      }
    } catch (error) {
      notify(`삭제에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const createGroup = () => {
    const name = window.prompt("새 그룹 이름을 입력하세요.", "새 이모티콘 그룹")?.trim();
    if (!name) return;
    const id = `group-${Date.now()}`;
    setCustomGroups((groups) => [...groups, { id, name, filter: emotionOrder.includes(filter as Emotion) ? filter : "all" }]);
    notify(`${name} 그룹을 만들었어요. 현재 필터 조건이 적용됩니다.`);
  };

  const beginRailDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail) return;
    const startX = event.clientX;
    const startScroll = rail.scrollLeft;
    let dragged = false;
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

  const updateRailOverflow = () => {
    const rail = railRef.current;
    if (!rail) {
      setRailOverflow((current) => current.left || current.right ? { left: false, right: false } : current);
      return;
    }

    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const edgeTolerance = 4;
    const next = {
      left: rail.scrollLeft > edgeTolerance,
      right: rail.scrollLeft < maxScroll - edgeTolerance,
    };
    setRailOverflow((current) => (
      current.left === next.left && current.right === next.right ? current : next
    ));
  };

  useEffect(() => {
    const rail = railRef.current;
    const frame = window.requestAnimationFrame(updateRailOverflow);
    rail?.addEventListener("scroll", updateRailOverflow, { passive: true });
    window.addEventListener("resize", updateRailOverflow);
    return () => {
      window.cancelAnimationFrame(frame);
      rail?.removeEventListener("scroll", updateRailOverflow);
      window.removeEventListener("resize", updateRailOverflow);
    };
  }, [mode, filter, query, activeCategoryId, customGroups.length, itemsToDisplay.length]);

  return (
    <>
      {selected ? (
        <LibraryDetail
          item={selected}
          project={projects.find((item) => item.id === (selected.projectId ?? selected.id))}
          onEdit={beginEditSticker}
        />
      ) : (
        <div className="workspace-page library-page">
          <header className="screen-brief library-brief">
            <span>04</span>
            <h1>이모티콘 보관함</h1>
            <p>저장된 캐릭터와 이모티콘을 확인하세요.</p>
          </header>

          <div className="library-layout-container">
            <aside className="library-sidebar glass-panel">
              <h1>이모티콘 그룹</h1>
              <label className="library-search">
                <Icon name="search" />
                <input
                  type="search"
                  placeholder="문장이나 감정 검색"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <nav aria-label="이모티콘 보관함 메뉴">
                <button
                  type="button"
                  className={mode === "all" && filter === "all" ? "active" : ""}
                  onClick={() => {
                    setMode("all");
                    setFilter("all");
                    setActiveCategoryId(null);
                  }}
                >
                  <Icon name="layers" />
                  전체
                </button>
                <button
                  type="button"
                  className={filter === "favorite" ? "active" : ""}
                  onClick={() => {
                    setMode("emoticons");
                    setFilter("favorite");
                    setActiveCategoryId(null);
                  }}
                >
                  <Icon name="star" />
                  자주쓰는 이모티콘
                </button>
                <button
                  type="button"
                  className={mode === "emoticons" && filter === "all" ? "active" : ""}
                  onClick={() => {
                    setMode("emoticons");
                    setFilter("all");
                    setActiveCategoryId(null);
                  }}
                >
                  <Icon name="image" />
                  이모티콘 탐색
                </button>
                <button type="button" onClick={() => navigate("/showcase")}>
                  <Icon name="play" />
                  움직이는 이모티콘
                </button>
                <hr />
                <button
                  type="button"
                  className={mode === "characters" ? "active" : ""}
                  onClick={() => setMode("characters")}
                >
                  <Icon name="folder" />
                  캐릭터 그룹
                </button>
                {customGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={activeCategoryId === group.id ? "active" : ""}
                    onClick={() => {
                      setMode("emoticons");
                      setFilter(group.filter);
                      setActiveCategoryId(group.id);
                    }}
                  >
                    <Icon name="folder" />
                    {group.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMode("emoticons");
                    setFilter("all");
                    setActiveCategoryId(null);
                  }}
                >
                  <Icon name="folder" />
                  이모티콘 그룹
                </button>
                <button type="button" className="muted" onClick={createGroup}>
                  <Icon name="add" />
                  새 그룹 생성하기
                </button>
              </nav>
            </aside>

            <section className="library-content">
              <header className="library-content-header">
                <div>
                  <span>
                    {mode === "characters" ? "CHARACTER LIBRARY" : mode === "emoticons" ? "EMOTICON LIBRARY" : "EMOVE LIBRARY"}
                  </span>
                  <h2>
                    {mode === "characters" ? "캐릭터 보관함" : mode === "emoticons" ? "이모티콘 보관함" : "전체 보관함"}
                  </h2>
                </div>
                <div className="library-mode-tabs" role="tablist" aria-label="보관함 보기 전환">
                  <button
                    type="button"
                    className={mode === "all" ? "active" : ""}
                    onClick={() => {
                      setMode("all");
                      setFilter("all");
                      setActiveCategoryId(null);
                    }}
                  >
                    전체
                  </button>
                  <button
                    type="button"
                    className={mode === "emoticons" ? "active" : ""}
                    onClick={() => {
                      setMode("emoticons");
                      setFilter("all");
                      setActiveCategoryId(null);
                    }}
                  >
                    이모티콘
                  </button>
                  <button
                    type="button"
                    className={mode === "characters" ? "active" : ""}
                    onClick={() => {
                      setMode("characters");
                      setFilter("all");
                      setActiveCategoryId(null);
                    }}
                  >
                    캐릭터
                  </button>
                </div>
              </header>

              {mode !== "characters" && (
                <div className={`library-category-rail-wrap${railOverflow.left ? " has-left-overflow" : ""}${railOverflow.right ? " has-right-overflow" : ""}`}>
                  <div
                    ref={railRef}
                    className="library-category-rail"
                    aria-label="이모티콘 상황 분류"
                    onPointerDown={beginRailDrag}
                    onScroll={updateRailOverflow}
                  >
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        className={activeCategoryId === category.id ? "active" : ""}
                        onClick={() => {
                          setMode("emoticons");
                          setFilter(category.filter);
                          setActiveCategoryId(category.id);
                        }}
                      >
                        <span>
                          <Icon name="image" />
                        </span>
                        <strong>{category.title}</strong>
                        <small>
                          {category.title} · {category.copy}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {itemsToDisplay.length ? (
                <>
                <div className="library-carousel-controls" aria-label="보관함 캐러셀 이동">
                  <button type="button" onClick={() => moveCarousel(-1)} aria-label="이전 항목"><Icon name="previous" /></button>
                  <button type="button" onClick={() => moveCarousel(1)} aria-label="다음 항목"><Icon name="next" /></button>
                </div>
                <div
                  className={`library-horizontal-scroll${isListDragging ? " is-dragging" : ""}`}
                  ref={listRef}
                  onScroll={handleScroll}
                  onPointerDown={beginCarouselDrag}
                  onPointerMove={moveCarouselDrag}
                  onPointerUp={endCarouselDrag}
                  onPointerCancel={endCarouselDrag}
                >
                  {virtualItems.map(({ entry, virtualIndex, copy }) => {
                    const isActive = virtualIndex === activeVirtualIndex;
                    const key = `${copy}-${entry.kind}-${entry.item.id}`;
                    if (entry.kind === "emoticon") {
                      const sticker = entry.item as StickerItem;
                      const project = projects.find((p) => p.id === (sticker.projectId ?? sticker.id));
                      return (
                        <div
                          key={key}
                          data-virtual-index={virtualIndex}
                          className={`carousel-card emoticon-card ${isActive ? "active" : "inactive"}`}
                          onClick={() => selectVirtualItem(virtualIndex)}
                        >
                          <div className="card-preview">
                            <img src={sticker.animatedImage ?? sticker.image} alt={sticker.title} />
                          </div>
                          <p className="carousel-card-title">{sticker.title}</p>
                          <div className="card-action-overlay" aria-label={`${sticker.title} 빠른 작업`}>
                              <strong className="card-hover-title">{sticker.title}</strong>
                              <button
                                type="button"
                                className={`floating-action btn-favorite ${sticker.favorite ? "active" : ""}`}
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(sticker.id); }}
                                aria-label="즐겨찾기"
                              >
                                <Icon name="star" size={18} />
                                <span>즐겨찾기</span>
                              </button>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="btn-edit"
                                  onClick={(e) => { e.stopPropagation(); beginEditSticker(sticker, project); }}
                                  aria-label="수정"
                                >
                                  <Icon name="edit" size={18} />
                                  <span>수정</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(sticker.id, "emoticon"); }}
                                  aria-label="삭제"
                                >
                                  <Icon name="trash" size={18} />
                                  <span>삭제</span>
                                </button>
                              </div>
                          </div>
                        </div>
                      );
                    } else {
                      const character = entry.item as CharacterToken;
                      return (
                        <div
                          key={key}
                          data-virtual-index={virtualIndex}
                          className={`carousel-card character-card ${isActive ? "active" : "inactive"}`}
                          onClick={() => selectVirtualItem(virtualIndex)}
                        >
                          <div className="card-preview" style={{ background: character.colors.body ?? "rgba(187, 182, 255, 0.12)" }}>
                            <img src={sanitizeAssetUrl(character.sourceAsset)} alt={character.name} />
                          </div>
                          <p className="carousel-card-title">{character.name}</p>
                          <div className="card-action-overlay" aria-label={`${character.name} 빠른 작업`}>
                              <strong className="card-hover-title">{character.name}</strong>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="btn-edit"
                                  onClick={(e) => { e.stopPropagation(); beginEditCharacter(character); }}
                                  aria-label="수정"
                                >
                                  <Icon name="edit" size={18} />
                                  <span>수정</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(character.id, "character"); }}
                                  aria-label="삭제"
                                >
                                  <Icon name="trash" size={18} />
                                  <span>삭제</span>
                                </button>
                              </div>
                          </div>
                        </div>
                      );
                    }
                  })}
                  {virtualItems.length > 0 && (
                    <div 
                      style={{ 
                        flex: "0 0 calc(100% - var(--library-card-active))", 
                        minWidth: "calc(100% - var(--library-card-active))", 
                        height: "1px",
                        pointerEvents: "none"
                      }} 
                      aria-hidden="true" 
                    />
                  )}
                </div>
                </>
              ) : (
                <div className="empty-library glass-panel">
                  <Icon name="folder" size={32} />
                  <h2>조건에 맞는 항목이 없어요.</h2>
                  <p>검색어나 그룹 조건을 바꿔보세요.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Character detail popup modal */}
      {selectedCharacterToken && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setSelectedCharacterToken(null)}>
          <section className="export-modal character-detail-modal glass-panel" role="dialog" aria-modal="true" aria-label="캐릭터 상세정보">
            <header>
              <div>
                <span className="eyebrow">CHARACTER TOKEN</span>
                <h2>{selectedCharacterToken.name}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedCharacterToken(null)}>
                <Icon name="close" />
              </button>
            </header>
            <div className="character-detail-body">
              <div className="char-detail-preview">
                <span className="character-preview-glow" style={{ background: selectedCharacterToken.colors.body ?? "#BBB6FF" }} />
                <img src={sanitizeAssetUrl(selectedCharacterToken.sourceAsset)} alt={selectedCharacterToken.name} />
              </div>
              <div className="char-detail-info">
                <div className="info-row">
                  <strong>스타일</strong>
                  <span>{selectedCharacterToken.stylePreset}</span>
                </div>
                <div className="info-row">
                  <strong>설명</strong>
                  <p>{selectedCharacterToken.prompt}</p>
                </div>
                <div className="info-row">
                  <strong>성격/특징</strong>
                  <div className="detail-tags">
                    {selectedCharacterToken.personalityTags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                    {selectedCharacterToken.observableTraits.map((trait) => (
                      <span key={trait}>#{trait}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="export-actions">
              <button type="button" className="button secondary" onClick={() => beginEditCharacter(selectedCharacterToken)}>
                <Icon name="edit" />
                수정하기
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  selectCharacter(selectedCharacterToken.id);
                  setSelectedCharacterToken(null);
                  navigate("/input");
                }}
              >
                <Icon name="check" />
                이 캐릭터로 이모티콘 만들기
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function LibraryDetail({
  item,
  project,
  onEdit,
}: {
  item: StickerItem;
  project?: EmoticonProject;
  onEdit: (item: StickerItem, project?: EmoticonProject) => void;
}) {
  const stillImage = item.thumbnail ?? item.image;
  const animatedImage = item.animatedImage ?? item.image;
  const selectedIndex = Math.max(0, stickers.value.findIndex((candidate) => candidate.id === item.id));
  const previous = stickers.value[(selectedIndex - 1 + stickers.value.length) % stickers.value.length];
  const next = stickers.value[(selectedIndex + 1) % stickers.value.length];
  const go = (target?: StickerItem) => target && navigate(`/library/${target.id}`);
  const download = async () => {
    const format = item.animationFormat ?? project?.animationFormat ?? inferAnimationFormat(animatedImage);
    const extension = format ? animationExtension(format) : item.animatedImage ? "apng" : "png";
    const projectBlob = project?.animationBlob ?? project?.gifBlob;
    if (projectBlob) downloadBlob(projectBlob, `${item.id}.${extension}`);
    else {
      const response = await fetch(animatedImage);
      const blob = await response.blob();
      downloadBlob(blob, `${item.id}.${extension}`);
    }
    notify(project || item.animatedImage ? `투명 ${format ?? "APNG"}를 저장했어요.` : "기본 에셋 이미지를 저장했어요.");
  };
  const modified = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.updatedAt));

  return (
    <div className="workspace-page library-detail-page">
      <div className="library-carousel-stage">
        <button className="carousel-peek previous" type="button" onClick={() => go(previous)} aria-label="이전 이모티콘">
          <img src={previous?.thumbnail ?? previous?.image} alt="" />
        </button>
        <button className="carousel-arrow previous" type="button" onClick={() => go(previous)} aria-label="이전">
          <Icon name="previous" size={26} />
        </button>
        <div className="detail-stage glass-panel">
          <img src={animatedImage} alt={item.phrase} />
        </div>
        <button className="carousel-arrow next" type="button" onClick={() => go(next)} aria-label="다음">
          <Icon name="next" size={26} />
        </button>
        <button className="carousel-peek next" type="button" onClick={() => go(next)} aria-label="다음 이모티콘">
          <img src={next?.thumbnail ?? next?.image} alt="" />
        </button>
        <div className="carousel-dots" aria-label={`${selectedIndex + 1} / ${stickers.value.length}`}>
          {stickers.value.slice(0, 5).map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={candidate.id === item.id ? "active" : ""}
              onClick={() => go(candidate)}
              aria-label={candidate.title}
            />
          ))}
        </div>
      </div>

      <aside className="detail-sidebar glass-panel">
        <button className="detail-close" type="button" onClick={() => navigate("/library")} aria-label="보관함으로 돌아가기">
          <Icon name="close" />
        </button>
        <div className="detail-copy">
          <h1>{item.title}</h1>
          <p>최근 수정일　{modified}</p>
        </div>
        <div className="detail-token-row">
          <span>
            <b>1:1</b>
            <small>비율</small>
          </span>
          <span>
            <img src={stillImage} alt="" />
            <small>썸네일</small>
          </span>
        </div>
        <div className="detail-actions">
          <button type="button" onClick={download} aria-label="저장">
            <Icon name="download" />
          </button>
          <button className={item.favorite ? "active" : ""} type="button" onClick={() => toggleFavorite(item.id)} aria-label="즐겨찾기">
            <Icon name="star" />
          </button>
          <button type="button" onClick={() => onEdit(item, project)}>
            수정하기
          </button>
        </div>
        <div className="detail-tags">
          <span>#밝은</span>
          <span>#인사하는</span>
          <span>#{item.emotion === "happy" ? "행복한" : emotionMeta[item.emotion].label}</span>
          <span>#여자</span>
          <span>#사람</span>
          <span>#귀여운</span>
        </div>
        <dl className="detail-spec">
          <div>
            <dt>파일</dt>
            <dd>{project ? `투명 ${item.animationFormat ?? project.animationFormat ?? "APNG"}` : "투명 PNG"}</dd>
          </div>
          <div>
            <dt>레이어</dt>
            <dd>{project ? "4 layers" : "기본 에셋"}</dd>
          </div>
          <div>
            <dt>문구</dt>
            <dd>{item.phrase}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

function inferAnimationFormat(value: string | null | undefined): AnimationFormat | null {
  const lower = value?.toLowerCase() ?? "";
  if (lower.includes(".apng") || lower.includes("image/apng")) return "APNG";
  if (lower.includes(".webp") || lower.includes("image/webp")) return "WEBP";
  if (lower.includes(".gif") || lower.includes("image/gif")) return "GIF";
  return null;
}
