import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { emotionMeta, emotionOrder } from "../data";
import { navigate, route } from "../router";
import { downloadBlob } from "../services/renderer";
import { deleteCharacter, deleteSticker, loadProjects, loadStickers } from "../services/repository";
import { loadRemoteCharacters, loadRemoteStickers } from "../services/remote-store";
import { animationExtension } from "../services/share";
import { characterName, characterPrompt, characterStyle, characterTone, characters, loadProjectForEditing, notify, selectCharacter, stickers, toggleFavorite } from "../store";
import type { AnimationFormat, CharacterToken, EmoticonProject, Emotion, StickerItem } from "../types";

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
  const [selectedCharacterToken, setSelectedCharacterToken] = useState<CharacterToken | null>(null);

  const detailId = route.value.startsWith("/mypage/") ? route.value.split("/")[2] : undefined;

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
    navigate("/emoticon/edit");
  };

  const beginEditCharacter = (token: CharacterToken) => {
    characterName.value = token.name;
    characterPrompt.value = token.prompt;
    characterTone.value = token.colors.body ?? "#BBB6FF";
    characterStyle.value = token.styleMode;
    setSelectedCharacterToken(null);
    navigate("/character");
  };

  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  const itemsToDisplay = useMemo(() => {
    if (mode === "emoticons") {
      return visible.map((item) => ({ kind: "emoticon" as const, item, createdAt: item.createdAt }));
    }
    if (mode === "characters") {
      return visibleCharacters.map((item) => ({ kind: "character" as const, item, createdAt: item.createdAt }));
    }
    return mixedItems;
  }, [mode, visible, visibleCharacters, mixedItems]);

  useEffect(() => {
    setActiveIndex(0);
    if (listRef.current) {
      listRef.current.scrollLeft = 0;
    }
  }, [mode, filter, query]);

  const selectItem = (index: number) => {
    setActiveIndex(index);
    const list = listRef.current;
    if (!list) return;
    isScrollingRef.current = true;
    let left = 0;
    if (index > 0) {
      left = 380 + 24 + (index - 1) * (200 + 24);
    }
    list.scrollTo({ left, behavior: "smooth" });
    window.setTimeout(() => {
      isScrollingRef.current = false;
    }, 500);
  };

  const handleScroll = () => {
    if (isScrollingRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const scrollLeft = list.scrollLeft;
    let targetIndex = 0;
    if (scrollLeft > 90) {
      targetIndex = 1 + Math.floor((scrollLeft - 90) / 224);
    }
    targetIndex = Math.max(0, Math.min(targetIndex, itemsToDisplay.length - 1));
    if (targetIndex !== activeIndex) {
      setActiveIndex(targetIndex);
    }
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
                <div className="library-category-rail-wrap">
                  <div
                    ref={railRef}
                    className="library-category-rail"
                    aria-label="이모티콘 상황 분류"
                    onPointerDown={beginRailDrag}
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
                <div className="library-horizontal-scroll" ref={listRef} onScroll={handleScroll}>
                  {itemsToDisplay.map((entry, index) => {
                    const isActive = index === activeIndex;
                    const key = `${entry.kind}-${entry.item.id}`;
                    if (entry.kind === "emoticon") {
                      const sticker = entry.item as StickerItem;
                      const project = projects.find((p) => p.id === (sticker.projectId ?? sticker.id));
                      return (
                        <div
                          key={key}
                          className={`carousel-card emoticon-card ${isActive ? "active" : "inactive"}`}
                          onClick={() => selectItem(index)}
                        >
                          <div className="card-preview">
                            <img src={sticker.animatedImage ?? sticker.image} alt={sticker.title} />
                          </div>
                          {isActive && (
                            <div className="card-action-overlay">
                              <div className="card-info">
                                <h3>{sticker.title}</h3>
                                <p>{sticker.phrase}</p>
                              </div>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="btn-edit"
                                  onClick={(e) => { e.stopPropagation(); beginEditSticker(sticker, project); }}
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className={`btn-favorite ${sticker.favorite ? "active" : ""}`}
                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(sticker.id); }}
                                >
                                  <Icon name="star" size={14} />
                                  즐겨찾기
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(sticker.id, "emoticon"); }}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      const character = entry.item as CharacterToken;
                      return (
                        <div
                          key={key}
                          className={`carousel-card character-card ${isActive ? "active" : "inactive"}`}
                          onClick={() => selectItem(index)}
                        >
                          <div className="card-preview" style={{ background: character.colors.body ?? "rgba(187, 182, 255, 0.12)" }}>
                            <img src={character.sourceAsset} alt={character.name} />
                          </div>
                          {isActive && (
                            <div className="card-action-overlay">
                              <div className="card-info">
                                <h3>{character.name}</h3>
                                <p>{character.prompt}</p>
                              </div>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="btn-edit"
                                  onClick={(e) => { e.stopPropagation(); beginEditCharacter(character); }}
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(character.id, "character"); }}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                  })}
                </div>
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
                <img src={selectedCharacterToken.sourceAsset} alt={selectedCharacterToken.name} />
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

interface CharacterCardProps {
  item: CharacterToken;
  index: number;
  onClick: () => void;
}

function CharacterCard({ item, index, onClick }: CharacterCardProps) {
  return (
    <article className="sticker-card character-token-card glass-panel">
      <button className="sticker-preview" type="button" onClick={onClick}>
        <span className="sticker-glow" style={{ background: item.colors.body ?? item.colors.accent ?? "#BBB6FF" }} />
        <img src={item.sourceAsset} alt={`${item.name} 캐릭터`} loading={index > 2 ? "lazy" : "eager"} decoding="async" />
      </button>
      <footer>
        <strong>{item.name}</strong>
        <div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              selectCharacter(item.id);
              navigate("/input");
            }}
            aria-label="선택"
          >
            <Icon name="check" />
          </button>
          <button type="button" onClick={onClick} aria-label="상세 보기">
            <Icon name="search" />
          </button>
        </div>
      </footer>
    </article>
  );
}

function StickerCard({
  item,
  index,
  project,
  onEdit,
}: {
  item: StickerItem;
  index: number;
  project?: EmoticonProject;
  onEdit: (item: StickerItem, project?: EmoticonProject) => void;
}) {
  const stillImage = item.thumbnail ?? item.image;
  const animatedImage = item.animatedImage && item.animatedImage !== stillImage ? item.animatedImage : null;
  return (
    <article className="sticker-card glass-panel">
      <button className="sticker-preview" type="button" onClick={() => navigate(`/library/${item.id}`)}>
        <span className="sticker-glow" style={{ background: item.color }} />
        <img
          className="sticker-static"
          src={stillImage}
          alt={`${item.phrase} 이모티콘`}
          loading={index > 2 ? "lazy" : "eager"}
          decoding="async"
        />
        {animatedImage ? (
          <img
            className="sticker-animated"
            src={animatedImage}
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
        ) : null}
      </button>
      <footer>
        <strong>{item.title}</strong>
        <div>
          <button type="button" onClick={() => onEdit(item, project)} aria-label="수정">
            <Icon name="edit" />
          </button>
          <button type="button" onClick={() => navigate(`/library/${item.id}`)} aria-label="상세 보기">
            <Icon name="download" />
          </button>
          <button className={item.favorite ? "active" : ""} type="button" onClick={() => toggleFavorite(item.id)} aria-label="즐겨찾기">
            <Icon name="star" />
          </button>
        </div>
      </footer>
    </article>
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
