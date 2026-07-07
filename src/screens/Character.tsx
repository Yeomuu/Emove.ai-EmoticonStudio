import { useState, useMemo } from "react";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { ScrollSlideContainer } from "../components/ScrollSlideContainer";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { syncCharacterToRemote } from "../services/remote-store";
import { saveCharacter } from "../services/repository";
import { characterName, characterPrompt, characters, characterStyle, characterTone, notify, selectCharacter } from "../store";
import type { CharacterToken, GeneratedCharacterResult } from "../types";

const ai = getAIProvider();
const palettes = [
  { id: "soft-pastel", label: "Soft Pastel", colors: ["#BDB2FF", "#9FF3DC", "#FFC8D2", "#FFF0A8", "#B8D8FF"] },
  { id: "aurora-pop", label: "Aurora Pop", colors: ["#8CA5FF", "#BBB6FF", "#FFADE3", "#78D6C6", "#FFD36E"] },
  { id: "cosmic-calm", label: "Cosmic Calm", colors: ["#A7A3FF", "#6F83FF", "#B7BDC8", "#E4E0F0", "#78A8FF"] },
] as const;

const traits = ["밝은", "다정한", "활발한", "장난꾸러기", "차분한", "용감한", "엉뚱한", "귀여운"];
const characterTypes = ["사람", "식물", "동물", "음식", "물건"];
const subCharacterPresets: Record<string, string[]> = {
  "사람": ["소년", "소녀", "직장인", "학생", "탐험가"],
  "식물": ["선인장", "꽃", "버섯", "새싹", "나무"],
  "동물": ["펭귄", "토끼", "거북이", "고양이", "강아지", "곰"],
  "음식": ["빵", "케이크", "마카롱", "초밥", "아이스크림"],
  "물건": ["컴퓨터", "우주선", "컵", "로봇", "시계"]
};

const mockRefImages: Record<string, string> = {
  "펭귄": "https://images.unsplash.com/photo-1598439210625-5067c578f3f6?auto=format&fit=crop&w=400&q=80",
  "토끼": "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?auto=format&fit=crop&w=400&q=80",
  "거북이": "https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?auto=format&fit=crop&w=400&q=80",
  "고양이": "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=400&q=80",
  "강아지": "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=400&q=80",
  "곰": "https://images.unsplash.com/photo-1589656966895-2f33e7653819?auto=format&fit=crop&w=400&q=80",
  "소년": "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80",
  "소녀": "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
  "직장인": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80",
  "학생": "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=400&q=80",
  "선인장": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80",
  "꽃": "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=400&q=80",
  "버섯": "https://images.unsplash.com/photo-1535254973040-607b474cb50d?auto=format&fit=crop&w=400&q=80",
  "새싹": "https://images.unsplash.com/photo-1515150144380-bca9f1650ed9?auto=format&fit=crop&w=400&q=80",
  "나무": "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=400&q=80",
  "빵": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80",
  "케이크": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=400&q=80",
  "마카롱": "https://images.unsplash.com/photo-1569864358642-9d1684040f43?auto=format&fit=crop&w=400&q=80",
  "초밥": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80",
  "아이스크림": "https://images.unsplash.com/photo-1501443762231-68b1d56f68c3?auto=format&fit=crop&w=400&q=80",
  "컴퓨터": "https://images.unsplash.com/photo-1587831990711-23ca6441447b?auto=format&fit=crop&w=400&q=80",
  "우주선": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=400&q=80",
  "컵": "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=400&q=80",
  "로봇": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=400&q=80",
  "시계": "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=400&q=80",
  "default": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80"
};

type ProcessState = { title: string; label: string; percent: number };

export function CharacterPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState(characterName.value);
  const [prompt, setPrompt] = useState(characterPrompt.value);
  const [selectedTraits, setSelectedTraits] = useState<string[]>(["귀여운"]);
  const [type, setType] = useState("동물");
  const [subType, setSubType] = useState("펭귄");
  const [style, setStyle] = useState<"2D" | "3D">(characterStyle.value || "3D");
  const [detailStyle, setDetailStyle] = useState("미니멀");
  const [paletteId, setPaletteId] = useState<(typeof palettes)[number]["id"]>("soft-pastel");
  const [tone, setTone] = useState(characterTone.value || "#5679C0");
  const [customTone, setCustomTone] = useState(characterTone.value || "#5679C0");
  const [generating, setGenerating] = useState(false);
  const [process, setProcess] = useState<ProcessState | null>(null);
  const [generated, setGenerated] = useState<GeneratedCharacterResult | null>(null);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);

  const selectedPalette = palettes.find((item) => item.id === paletteId) ?? palettes[0];
  const variationImages = generated?.imageUrls?.length ? generated.imageUrls : generated ? [generated.imageUrl] : [];

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    const presets = subCharacterPresets[nextType] || [];
    setSubType(presets[0] || "");
  };

  const toggleTrait = (item: string) => {
    if (selectedTraits.includes(item)) {
      if (selectedTraits.length > 1) {
        setSelectedTraits(selectedTraits.filter((t) => t !== item));
      }
    } else {
      setSelectedTraits([...selectedTraits, item]);
    }
  };

  const buildToken = (imageUrl = "", id?: string): CharacterToken => {
    const now = new Date().toISOString();
    const fallbackName = `${selectedTraits.join(" ")} ${subType} 캐릭터`;
    const finalPrompt = `${prompt.trim() || `${selectedTraits.join(", ")} 인상의 ${subType} 캐릭터`} ${selectedPalette.label} 팔레트, 메인톤 ${tone}, ${style === "3D" ? "Soft 3D 피규어" : "Soft 2D 플랫"} 스타일 (${detailStyle})`.trim();
    return {
      id: id ?? generated?.token.id ?? `character-${Date.now()}`,
      version: 1,
      name: name.trim() || fallbackName,
      ownerId: "local-user",
      isDefault: false,
      sourceAsset: imageUrl,
      referenceImages: imageUrl ? [imageUrl] : [],
      styleMode: style,
      stylePreset: style === "3D" ? "Soft 3D" : "Soft 2D",
      styleDescription: style === "3D"
        ? `soft 3D chibi, rounded toy-like volume, pastel material, gentle studio light, isolated sticker-ready character, style variant: ${detailStyle}`
        : `soft 2D chibi, rounded silhouette, pastel cel shading, clean outline, isolated sticker-ready character, style variant: ${detailStyle}`,
      prompt: finalPrompt,
      observableTraits: [...selectedTraits, type, subType, "둥근 실루엣"],
      personalityTags: [...selectedTraits],
      colors: { body: tone, accent: selectedPalette.colors[2] || "#FFC8D2", face: "#FCFCFC" },
      fixedTraits: [...selectedTraits, type, subType, "포인트 컬러"],
      doNotChange: ["캐릭터 정체성", "몸 비율", "주요 색상"],
      createdAt: now,
      updatedAt: now,
    };
  };

  const selectVariation = (index: number) => {
    if (!generated) return;
    const imageUrl = variationImages[index];
    if (!imageUrl) return;
    const token = { ...buildToken(imageUrl, generated.token.id), sourceAsset: imageUrl, referenceImages: [imageUrl] };
    setSelectedVariationIndex(index);
    setGenerated({ ...generated, imageUrl, token });
  };

  const createCharacter = async () => {
    if (!prompt.trim()) {
      const proceed = window.confirm("구체적인 세부 특징 설명(외형 묘사)을 입력하지 않았습니다. 이대로 캐릭터 생성을 계속하시겠습니까?");
      if (!proceed) return;
    }
    setGenerating(true);
    setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터 설정을 정리하는 중...", percent: 8 });
    try {
      const draft = buildToken("");
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "프롬프트와 스타일 토큰을 준비하는 중...", percent: 21 });
      await Promise.resolve();
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터의 색상을 칠하는 중...", percent: 54 });
      const result = await ai.generateCharacter(draft);
      const images = result.imageUrls?.length ? result.imageUrls : [result.imageUrl];
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "생성 결과를 투명 캐릭터 토큰으로 정리하는 중...", percent: 85 });
      const token = buildToken(images[0], draft.id);
      const next = { ...result, imageUrl: images[0], imageUrls: images, token: { ...token, sourceAsset: images[0], referenceImages: [images[0]] } };
      setGenerated(next);
      setSelectedVariationIndex(0);
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터 완성 단계...", percent: 100 });
      notify("새 캐릭터 초안이 생성됐어요. 베리에이션을 고른 뒤 저장하세요.");
    } catch (error) {
      setProcess(null);
      notify(error instanceof Error ? error.message : "캐릭터 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
      window.setTimeout(() => setProcess(null), 420);
    }
  };

  const saveGeneratedCharacter = async (target: "/library" | "/input") => {
    if (!generated) return;
    const selectedImage = variationImages[selectedVariationIndex] ?? generated.imageUrl;
    let saved = { ...buildToken(selectedImage, generated.token.id), sourceAsset: selectedImage, referenceImages: [selectedImage], updatedAt: new Date().toISOString() };
    let remoteMessage = "원격 DB 설정이 없어 IndexedDB에만 임시 저장했습니다.";
    try {
      const sync = await syncCharacterToRemote(saved);
      if (sync.ownerId) saved = { ...saved, ownerId: sync.ownerId };
      if (sync.enabled) remoteMessage = "원격 DB에 저장했습니다.";
      else if (sync.storageWarning) remoteMessage = `${sync.storageWarning} IndexedDB에만 임시 저장했습니다.`;
    } catch (error) {
      remoteMessage = `원격 DB 저장 실패로 IndexedDB에만 임시 저장했습니다: ${error instanceof Error ? error.message : String(error)}`;
    }
    await saveCharacter(saved);
    characters.value = [saved, ...characters.value.filter((item) => item.id !== saved.id)];
    characterName.value = saved.name;
    characterPrompt.value = saved.prompt;
    characterTone.value = tone;
    characterStyle.value = style;
    selectCharacter(saved.id);
    notify(target === "/input" ? `새 캐릭터 토큰을 저장하고 이 캐릭터로 이모티콘 제작을 시작합니다. ${remoteMessage}` : `새 캐릭터 토큰을 보관함에 저장했어요. ${remoteMessage}`);
    navigate(target);
  };

  const saveAndContinue = () => saveGeneratedCharacter("/library");
  const saveAndCreateEmoticon = () => saveGeneratedCharacter("/input");

  const chooseCustomTone = (value: string) => {
    setCustomTone(value);
    setTone(value);
  };

  // Steps configuration for ScrollSlideContainer
  const steps = [
    {
      id: "step1",
      label: "01 · 캐릭터 형태 및 성격",
      content: (
        <div className="input-composer character-composer">
          {/* Left panel: form dropdown selection & preview */}
          <div className="pose-capture-panel" style={{ height: "100%" }}>
            <Panel title="✦ 캐릭터 외형 정의" className="snapshot-panel">
              <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
                <div style={{ flex: 1 }}>
                  <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>캐릭터 타입</span>
                  <select
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,9,18,0.22)", color: "#fff" }}
                    aria-label="Character Type"
                  >
                    {characterTypes.map((t) => (
                      <option key={t} value={t} style={{ background: "#171522", color: "#fff" }}>{t}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>세부 분류</span>
                  <select
                    value={subType}
                    onChange={(e) => setSubType(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,9,18,0.22)", color: "#fff" }}
                    aria-label="Detail Character Presets"
                  >
                    {(subCharacterPresets[type] || []).map((st) => (
                      <option key={st} value={st} style={{ background: "#171522", color: "#fff" }}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="character-preview-box-container" style={{ marginTop: "18px", padding: "12px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", background: "rgba(0,0,0,0.12)" }}>
                <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "12px", color: "#aaa" }}>캐릭터 미리보기</span>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "140px" }}>
                  <img 
                    src={mockRefImages[subType] || mockRefImages["default"]} 
                    alt="Preview" 
                    style={{ maxHeight: "100%", objectFit: "contain", borderRadius: "10px" }}
                  />
                </div>
              </div>
            </Panel>
          </div>

          {/* Right panel: personality traits and name */}
          <div className="input-right-column" style={{ height: "100%" }}>
            <Panel title="✦ 성격 및 기본 정보" className="effect-settings-panel">
              <label className="character-name-control" style={{ marginBottom: "20px", display: "block" }}>
                <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>캐릭터 이름</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  maxLength={12}
                  placeholder="캐릭터의 이름을 지어주세요 (예: 펭수)"
                  style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,9,18,0.22)", color: "#fff" }}
                />
              </label>

              <div style={{ marginTop: "18px" }}>
                <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>성격 키워드 (복수 선택 가능)</span>
                <div className="chip-row" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {traits.map((item) => {
                    const isActive = selectedTraits.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`chip ${isActive ? "active" : ""}`}
                        onClick={() => toggleTrait(item)}
                        style={{ border: isActive ? "1px solid #7b69ff" : "1px solid rgba(255,255,255,0.1)" }}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Panel>
          </div>
        </div>
      ),
      validate: () => {
        if (!name.trim()) return "캐릭터 이름을 입력해 주세요.";
        if (selectedTraits.length === 0) return "성격 키워드를 최소 한 개 이상 선택해 주세요.";
        return null;
      }
    },
    {
      id: "step2",
      label: "02 · 색상 및 스타일 지정",
      content: (
        <div className="input-composer character-composer">
          {/* Left Panel: Main Color & Palette */}
          <div className="pose-capture-panel" style={{ height: "100%" }}>
            <Panel title="✦ 메인 컬러 설정" className="snapshot-panel">
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px" }}>
                <div style={{ position: "relative" }}>
                  <input
                    type="color"
                    value={tone}
                    onChange={(e) => chooseCustomTone(e.target.value)}
                    style={{ width: "42px", height: "42px", border: "none", borderRadius: "50%", cursor: "pointer", background: "none" }}
                    aria-label="Color Swatch Picker"
                  />
                </div>
                <input
                  type="text"
                  value={tone.toUpperCase()}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (!val.startsWith("#")) val = "#" + val;
                    if (val.length <= 7) {
                      setTone(val);
                      setCustomTone(val);
                    }
                  }}
                  style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,9,18,0.22)", color: "#fff", fontFamily: "monospace" }}
                  aria-label="Hex Color Value"
                />
              </div>

              <div className="palette-preset-selector" style={{ marginTop: "18px" }}>
                <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>컬러 팔레트 프리셋</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {palettes.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPaletteId(p.id);
                        setTone(p.colors[0]);
                      }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "12px", border: paletteId === p.id ? "1px solid #7b69ff" : "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", color: "#fff", cursor: "pointer", textAlign: "left" }}
                    >
                      <span style={{ fontSize: "12px" }}>{p.label}</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {p.colors.map((c) => (
                          <span key={c} style={{ width: "12px", height: "12px", borderRadius: "50%", background: c }} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Panel: Style Preset */}
          <div className="input-right-column" style={{ height: "100%" }}>
            <Panel title="✦ 그림체 & 질감 스타일" className="effect-settings-panel">
              <div style={{ marginBottom: "18px" }}>
                <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>그림체 차원</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {["2D", "3D"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`button subtle ${style === item ? "active" : ""}`}
                      onClick={() => setStyle(item as "2D" | "3D")}
                      style={{ flex: 1, height: "38px", borderRadius: "10px", border: style === item ? "1px solid #7b69ff" : "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
                    >
                      {item} 그림체
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>세부 표현 스타일</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {["미니멀", "손그림", "굵은 라인"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`button subtle ${detailStyle === item ? "active" : ""}`}
                      onClick={() => setDetailStyle(item)}
                      style={{ flex: 1, height: "38px", borderRadius: "10px", border: detailStyle === item ? "1px solid #7b69ff" : "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: "18px", padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", fontSize: "12px", color: "#858390" }}>
                <strong>스타일 프리뷰 요약:</strong>
                <p style={{ margin: "4px 0 0", color: "#fff" }}>
                  {style === "3D" 
                    ? `부드러운 클레이 느낌의 3D 입체 캐릭터 (${detailStyle} 기법)` 
                    : `깔끔한 외곽선이 강조된 플랫 2D 드로잉 (${detailStyle} 기법)`}
                </p>
              </div>
            </Panel>
          </div>
        </div>
      ),
      validate: () => null
    },
    {
      id: "step3",
      label: "03 · 구체적 묘사 & 생성",
      content: (
        <div className="input-composer character-composer">
          {/* Left Panel: Unsplash Reference Image */}
          <div className="pose-capture-panel" style={{ height: "100%" }}>
            <Panel title="✦ 레퍼런스 무드" className="snapshot-panel">
              <div className="reference-image-container" style={{ textAlign: "center" }}>
                <img
                  src={mockRefImages[subType] || mockRefImages["default"]}
                  alt="Reference Visual Mood"
                  style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <p style={{ marginTop: "10px", fontSize: "12px", color: "#85869a" }}>
                  설정한 캐릭터 외형과 어울리는 Unsplash 레퍼런스 무드입니다.
                </p>
              </div>
            </Panel>
          </div>

          {/* Right Panel: Detail description and prompt execute */}
          <div className="input-right-column" style={{ height: "100%" }}>
            <Panel title="✦ 디테일 외형 묘사" className="effect-settings-panel">
              <span className="field-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px" }}>세부 특징 설명 (최대 1000자)</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 파스텔톤 우주 헬멧을 쓰고 있으며, 등에 작은 가방을 멨음. 둥근 안경 착용."
                maxLength={1000}
                style={{ width: "100%", height: "110px", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,9,18,0.22)", color: "#fff", resize: "none", fontSize: "13px" }}
              />
              <span className="char-count" style={{ display: "block", textAlign: "right", fontSize: "12px", marginTop: "4px" }}>
                {prompt.length}/1000자
              </span>

              <button
                type="button"
                className="btn-primary"
                onClick={createCharacter}
                disabled={generating}
                style={{ width: "100%", height: "46px", marginTop: "18px" }}
              >
                <Icon name="star" />
                AI 캐릭터 생성 시작하기
              </button>
            </Panel>
          </div>
        </div>
      ),
      validate: () => null
    }
  ];

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: name,
        text: `EMOVE에서 고유한 캐릭터 '${name}'를 생성했습니다!`,
        url: window.location.href
      }).catch(() => undefined);
    } else {
      notify("공유 기능을 지원하지 않는 환경입니다. 주소를 복사해 주세요.");
    }
  };

  return (
    <div className="workspace-page character-page">
      {!generated ? (
        <>
          <header className="screen-brief character-brief">
            <span>01</span>
            <h1>이모티콘에 사용할 고유한 캐릭터를 생성합니다.</h1>
            <p>캐릭터 외형 및 그림체 설정</p>
          </header>

          <ScrollSlideContainer
            steps={steps}
            currentStep={currentStep}
            onStepChange={(index) => setCurrentStep(index)}
            className="character-scroll-slider"
          />
        </>
      ) : (
        /* Result dashboard layout (Figma 113-834 aligned) */
        <div className="character-result-layout" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "24px", boxSizing: "border-box" }}>
          <header className="character-result-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <h1 style={{ fontSize: "28px", margin: 0, fontWeight: "800" }}>캐릭터가 성공적으로 생성되었습니다!</h1>
            <div className="result-actions" style={{ display: "flex", gap: "10px" }}>
              <button className="btn-secondary" onClick={handleShare} style={{ padding: "10px 18px", borderRadius: "10px" }}>
                <Icon name="image" size={14} /> 공유
              </button>
              <button className="btn-secondary" onClick={saveAndContinue} style={{ padding: "10px 18px", borderRadius: "10px" }}>
                보관함 이동
              </button>
              <button className="btn-primary" onClick={saveAndCreateEmoticon} style={{ padding: "10px 18px", borderRadius: "10px" }}>
                이 캐릭터로 이모티콘 생성하기
              </button>
            </div>
          </header>

          <div className="character-result-columns" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "24px", flex: 1, minHeight: 0 }}>
            {/* Box 1 (Left): Character Name & Hashtags */}
            <Panel title="✦ 캐릭터 이름" className="result-panel">
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "100%" }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="캐릭터 이름"
                  style={{ width: "100%", padding: "12px", fontSize: "16px", fontWeight: "bold", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,9,18,0.22)", color: "#fff" }}
                />
                <div className="hashtag-grid" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {selectedTraits.map((t) => (
                    <span key={t} className="hashtag" style={{ background: "rgba(123,109,255,0.15)", color: "#9b8cff", padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>#{t}</span>
                  ))}
                  <span className="hashtag" style={{ background: "rgba(255,255,255,0.06)", color: "#ccc", padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>#{type}</span>
                  <span className="hashtag" style={{ background: "rgba(255,255,255,0.06)", color: "#ccc", padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>#{subType}</span>
                </div>
              </div>
            </Panel>

            {/* Box 2 (Center): Character Info Natural Language Summary */}
            <Panel title="✦ 캐릭터 정보" className="result-panel">
              <div style={{ padding: "4px", fontSize: "14px", lineHeight: "1.6", color: "#aaa6b4" }}>
                <p style={{ margin: 0 }}>
                  이 캐릭터는 <strong>{selectedTraits.join(", ")}</strong> 성격의 <strong>{subType}</strong> 캐릭터입니다.
                </p>
                <p style={{ marginTop: "12px" }}>
                  전체적으로 부드러운 <strong>{tone}</strong> 색상과 <strong>{style === "3D" ? "Soft 3D 피규어" : "Soft 2D 플랫"} ({detailStyle})</strong> 그림체 스타일을 적용하여 이모티콘 5프레임 동작 프레임 생성에 적합하게 튜닝된 토큰입니다.
                </p>
              </div>
            </Panel>

            {/* Box 3 (Right): Character Preview & Variations Grid */}
            <Panel title="✦ 완성된 디자인 (4 Variations)" className="result-panel">
              <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
                <div className="main-preview-square" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, padding: "10px", background: "rgba(0,0,0,0.18)", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: "14px" }}>
                  <img
                    src={variationImages[selectedVariationIndex] || generated.imageUrl}
                    alt="Result character preview"
                    style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
                  />
                </div>
                <div className="variation-selection-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                  {variationImages.map((image, index) => (
                    <button
                      key={index}
                      className={`var-btn ${index === selectedVariationIndex ? "active" : ""}`}
                      onClick={() => selectVariation(index)}
                      style={{ border: index === selectedVariationIndex ? "2px solid #7b69ff" : "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", overflow: "hidden", background: "rgba(10,9,18,0.2)", cursor: "pointer", height: "54px" }}
                    >
                      <img src={image} alt={`Variant ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {process && <WorkProcessScreen title={process.title} label={process.label} percent={process.percent} />}
    </div>
  );
}

function WorkProcessScreen({ title, label, percent }: ProcessState) {
  return (
    <section className="work-process-screen" role="status" aria-live="polite">
      <div className="work-process-inner">
        <div className="work-process-logo" style={{ marginBottom: "24px", display: "flex", justifyContent: "center" }}>
          <img src="/assets/logo.png" alt="EMOVE Logo" style={{ width: "120px", height: "120px", objectFit: "contain" }} onError={(e) => { e.currentTarget.src = "https://emove-emoticonstudio.vercel.app/assets/logo.png"; }} />
        </div>
        <h2>{title}</h2>
        <div className="work-process-meter" aria-label={`진행률 ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <p><span>{label}</span><strong>{percent}%</strong></p>
      </div>
    </section>
  );
}
