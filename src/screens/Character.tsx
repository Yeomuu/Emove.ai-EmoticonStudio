import { useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ScrollSlideContainer } from "../components/ScrollSlideContainer";
import { imageAssets } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { persistGeneratedAsset, persistGeneratedAssets } from "../services/asset-storage";
import { waitForImageAssets } from "../services/asset-readiness";
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

const traits = ["밝은", "엉뚱한", "듬직한", "용감한", "차분한", "신중한", "장난스러운", "활발한", "예민한"];
const characterTypes = ["인물", "사물", "동물", "식물", "음식"];
const subCharacterPresets: Record<string, string[]> = {
  "인물": ["소년", "소녀", "직장인", "학생", "탐험가"],
  "식물": ["선인장", "꽃", "버섯", "새싹", "나무"],
  "동물": ["펭귄", "토끼", "거북이", "고양이", "강아지", "곰"],
  "음식": ["빵", "케이크", "마카롱", "초밥", "아이스크림"],
  "사물": ["컴퓨터", "우주선", "컵", "로봇", "시계"]
};

type ProcessState = { title: string; label: string; percent: number };
type CharacterDropdownId = "type" | "subType";

export function CharacterPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(characterPrompt.value);
  const [selectedTraits, setSelectedTraits] = useState<string[]>(["밝은", "엉뚱한", "듬직한"]);
  const [type, setType] = useState("동물");
  const [subType, setSubType] = useState("펭귄");
  const [openDropdown, setOpenDropdown] = useState<CharacterDropdownId | null>(null);
  const [style, setStyle] = useState<"2D" | "3D">(characterStyle.value || "3D");
  const [detailStyle, setDetailStyle] = useState("미니멀");
  const [paletteId, setPaletteId] = useState<(typeof palettes)[number]["id"]>("soft-pastel");
  const [tone, setTone] = useState(characterTone.value || "#5679C0");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultReady, setResultReady] = useState(false);
  const [process, setProcess] = useState<ProcessState | null>(null);
  const [generated, setGenerated] = useState<GeneratedCharacterResult | null>(null);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);
  const [uploadedReference, setUploadedReference] = useState<string | null>(null);
  const generationLockRef = useRef(false);
  const saveLockRef = useRef(false);

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
      referenceImages: imageUrl ? [imageUrl] : uploadedReference ? [uploadedReference] : [],
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
    if (generationLockRef.current || saveLockRef.current) return;
    generationLockRef.current = true;
    if (!prompt.trim()) {
      const proceed = window.confirm("구체적인 세부 특징 설명(외형 묘사)을 입력하지 않았습니다. 이대로 캐릭터 생성을 계속하시겠습니까?");
      if (!proceed) {
        generationLockRef.current = false;
        return;
      }
    }
    setGenerating(true);
    setResultReady(false);
    setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터 설정을 정리하는 중...", percent: 8 });
    try {
      const draft = buildToken("");
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "프롬프트와 스타일 토큰을 준비하는 중...", percent: 21 });
      await Promise.resolve();
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터의 색상을 칠하는 중...", percent: 54 });
      const result = await ai.generateCharacter(draft);
      const images = result.imageUrls?.length ? result.imageUrls : [result.imageUrl];
      const persisted = await persistGeneratedAssets(images, { filePrefix: draft.id, kind: "characters" });
      const storedImages = persisted.assets.map((asset) => asset.url);
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "생성 결과를 투명 캐릭터 토큰으로 정리하는 중...", percent: 85 });
      await waitForImageAssets(storedImages);
      const token = buildToken(storedImages[0], draft.id);
      const next = { ...result, imageUrl: storedImages[0], imageUrls: storedImages, token: { ...token, sourceAsset: storedImages[0], referenceImages: [storedImages[0]] } };
      setGenerated(next);
      setSelectedVariationIndex(0);
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터 완성 단계...", percent: 100 });
      notify(persisted.warning ? `새 캐릭터 초안은 생성됐지만 GCS 저장은 보류됐습니다: ${persisted.warning}` : "새 캐릭터 초안과 이미지 URL을 GCS에 저장했습니다. 베리에이션을 고른 뒤 저장하세요.");
    } catch (error) {
      setProcess(null);
      notify(error instanceof Error ? error.message : "캐릭터 생성에 실패했습니다.");
    } finally {
      generationLockRef.current = false;
      setGenerating(false);
      window.setTimeout(() => setProcess(null), 420);
    }
  };

  const saveGeneratedCharacter = async (target: "/library" | "/input") => {
    if (!generated || !resultReady || generationLockRef.current || saveLockRef.current) return;
    if (!name.trim()) {
      notify("캐릭터 이름을 입력해 주세요.");
      return;
    }
    saveLockRef.current = true;
    setSaving(true);
    try {
      const selectedImage = variationImages[selectedVariationIndex] ?? generated.imageUrl;
      const persisted = await persistGeneratedAsset(selectedImage, { fileName: `${generated.token.id}.png`, kind: "characters" });
      const storedImage = persisted.url;
      let saved = { ...buildToken(storedImage, generated.token.id), sourceAsset: storedImage, referenceImages: [storedImage], updatedAt: new Date().toISOString() };
      let remoteMessage = "원격 DB 설정이 없어 IndexedDB에만 임시 저장했습니다.";
      try {
        const sync = await syncCharacterToRemote(saved);
        if (sync.ownerId) saved = { ...saved, ownerId: sync.ownerId };
        if (sync.enabled) remoteMessage = persisted.enabled ? "GCS 이미지 주소와 캐릭터 메타데이터를 Neon에 저장했습니다." : `캐릭터 메타데이터는 저장했지만 GCS 이미지 저장은 보류됐습니다: ${persisted.error}`;
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
    } catch (error) {
      notify(error instanceof Error ? error.message : "캐릭터 저장에 실패했습니다.");
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const saveAndContinue = () => saveGeneratedCharacter("/library");
  const saveAndCreateEmoticon = () => saveGeneratedCharacter("/input");

  const chooseCustomTone = (value: string) => {
    setTone(value);
  };

  const chooseReferenceImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setUploadedReference(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const steps = [
    {
      id: "step1",
      label: "01 · 캐릭터 형태",
      content: (
        <div className="character-flow-slide character-step-one">
          <h1 className="character-flow-title">이모티콘에 사용할<br />캐릭터를 만들어보세요.</h1>

          <section className="character-flow-card character-shape-card glass-panel">
            <h2>캐릭터는 어떤 모습인가요?</h2>
            <div className="character-dual-dropdowns">
              <CharacterDropdown
                id="type"
                label="캐릭터 타입 선택"
                value={type}
                options={characterTypes}
                open={openDropdown === "type"}
                onToggle={() => setOpenDropdown(openDropdown === "type" ? null : "type")}
                onSelect={(value) => {
                  handleTypeChange(value);
                  setOpenDropdown(null);
                }}
              />
              <div className="character-dropdown-arrows" aria-hidden="true">
                <Icon name="next" size={14} />
                <Icon name="previous" size={14} />
              </div>
              <CharacterDropdown
                id="subType"
                label="세부 캐릭터 선택"
                value={subType}
                options={subCharacterPresets[type] || []}
                open={openDropdown === "subType"}
                onToggle={() => setOpenDropdown(openDropdown === "subType" ? null : "subType")}
                onSelect={(value) => {
                  setSubType(value);
                  setOpenDropdown(null);
                }}
              />
            </div>
            <div className="character-mini-preview">
              <span>캐릭터 미리보기</span>
              <figure>
                <img src={imageAssets.character} alt={`${subType} 미리보기`} />
              </figure>
            </div>
          </section>

          <section className="character-flow-card character-trait-card glass-panel">
            <h2>어울리는 성격 키워드를 모두 선택해 주세요.</h2>
            <span className="character-field-label">성격 키워드(복수 선택 가능)</span>
            <div className="character-trait-grid">
              {traits.map((item) => {
                const isActive = selectedTraits.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={isActive ? "active" : ""}
                    onClick={() => toggleTrait(item)}
                  >
                    <span aria-hidden="true" />
                    {item}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="character-flow-card character-step-heading character-step-heading-one glass-panel">
            <strong>01</strong>
            <p>어떤 캐릭터를<br />만들고 싶나요?</p>
          </section>
        </div>
      ),
      validate: () => {
        if (selectedTraits.length === 0) return "성격 키워드를 최소 한 개 이상 선택해 주세요.";
        return null;
      }
    },
    {
      id: "step2",
      label: "02 · 색상 및 스타일 지정",
      content: (
        <div className="character-flow-slide character-step-two">
          <section className="character-flow-card character-step-heading character-step-heading-two glass-panel">
            <strong>02</strong>
            <p>어떤 모습의<br />캐릭터인가요?</p>
          </section>

          <section className="character-flow-card character-main-color-card glass-panel">
            <span className="character-field-label">메인 컬러</span>
            <div className="point-color-control" style={{ position: "absolute", left: "12%", top: "35%", right: "12%", display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {selectedPalette.colors.map((c) => {
                  const isActive = tone === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`color-swatch ${isActive ? "active" : ""}`}
                      onClick={() => setTone(c)}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: c,
                        border: isActive ? "2px solid #7b69ff" : "1px solid rgba(255,255,255,0.12)",
                        cursor: "pointer",
                        boxShadow: isActive ? "0 0 10px rgba(123, 109, 255, 0.6)" : "none"
                      }}
                      aria-label={`Point color ${c}`}
                    />
                  );
                })}
                {/* Custom color picker swatch */}
                <div style={{ position: "relative", width: "32px", height: "32px" }}>
                  <button
                    type="button"
                    className={`custom-color-swatch ${(selectedPalette.colors as readonly string[]).includes(tone) ? "" : "active"}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      border: (selectedPalette.colors as readonly string[]).includes(tone) ? "1px solid rgba(255,255,255,0.2)" : "2px solid #7b69ff",
                      background: (selectedPalette.colors as readonly string[]).includes(tone) ? "linear-gradient(135deg, #ff9b9b, #9bff9b, #9b9bff)" : tone,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: (selectedPalette.colors as readonly string[]).includes(tone) ? "none" : "0 0 10px rgba(123, 109, 255, 0.6)"
                    }}
                    aria-label="Custom point color"
                  >
                    <Icon name="edit" size={12} style={{ filter: "brightness(0) invert(1)" }} />
                  </button>
                  <input
                    type="color"
                    value={tone}
                    onChange={(e) => chooseCustomTone(e.target.value)}
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: 0,
                      cursor: "pointer",
                      width: "100%",
                      height: "100%",
                    }}
                    aria-label="Custom Point Color Picker"
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px" }}>
                <span style={{ fontSize: "11px", color: "#8f8b9a" }}>HEX 코드</span>
                <input
                  value={tone.toUpperCase()}
                  onChange={(event) => {
                    let value = event.currentTarget.value.trim();
                    if (!value.startsWith("#")) value = `#${value}`;
                    if (value.length <= 7) {
                      setTone(value);
                    }
                  }}
                  style={{
                    width: "100px",
                    height: "28px",
                    padding: "0 6px",
                    fontSize: "12px",
                    fontFamily: "Pretendard, sans-serif",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px",
                    background: "rgba(10,9,18,0.22)",
                    color: "#fff",
                    textAlign: "center"
                  }}
                  aria-label="Main color hex value input"
                />
              </div>
            </div>
          </section>

          <section className="character-flow-card character-palette-card glass-panel">
            <span className="character-field-label">컬러 팔레트</span>
            <div className="palette-dropdown" style={{ position: "absolute", left: "8.169%", top: "35%", right: "8.169%", display: "grid", gap: "8px" }}>
              <select
                value={paletteId}
                onChange={(e) => {
                  const id = e.target.value as typeof palettes[number]["id"];
                  setPaletteId(id);
                  const selected = palettes.find((p) => p.id === id);
                  if (selected) {
                    chooseCustomTone(selected.colors[0]);
                  }
                }}
                aria-label="Select color palette preset"
              >
                {palettes.map((palette) => (
                  <option key={palette.id} value={palette.id} style={{ background: "#171522", color: "#fff" }}>
                    {palette.label}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: "6px", marginTop: "16px", background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                {selectedPalette.colors.map((color) => (
                  <span
                    key={color}
                    style={{
                      flex: 1,
                      height: "16px",
                      borderRadius: "4px",
                      background: color,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)"
                    }}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="character-flow-card character-style-card glass-panel">
            <span className="character-field-label">생성 그림체 스타일</span>
            <div className="character-style-layout">
              <div className="character-style-controls">
                <div className="character-style-row wide">
                  {(["2D", "3D"] as const).map((item) => (
                    <button key={item} type="button" className={style === item ? "active" : ""} onClick={() => setStyle(item)}>
                      {item}
                    </button>
                  ))}
                </div>
                <div className="character-style-row">
                  {["미니멀", "손그림", "굵은 라인"].map((item) => (
                    <button key={item} type="button" className={detailStyle === item ? "active" : ""} onClick={() => setDetailStyle(item)}>
                      {item}
                    </button>
                  ))}
                </div>
                <div className="character-style-row">
                  {["미니멀", "손그림", "굵은 라인"].map((item) => (
                    <button key={`sub-${item}`} type="button" className={detailStyle === item ? "active" : ""} onClick={() => setDetailStyle(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="character-style-preview">
                <strong>스타일 미리보기</strong>
                <p>{style === "3D" ? "부드러운 3D 피규어 질감" : "선명한 2D 플랫 드로잉"}</p>
              </div>
            </div>
          </section>
        </div>
      ),
      validate: () => null
    },
    {
      id: "step3",
      label: "03 · 구체적 묘사 & 생성",
      content: (
        <div className="character-flow-slide character-step-three">
          <section className="character-flow-card character-reference-card glass-panel">
            <span className="character-field-label">레퍼런스 이미지</span>
            <label className="character-reference-picker">
              <figure>
                <img src={uploadedReference || imageAssets.library[Math.max(0, characterTypes.indexOf(type)) % imageAssets.library.length]} alt={`${subType} 카툰·3D 스타일 레퍼런스 이미지`} />
                <span>이미지 1장 선택</span>
              </figure>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => chooseReferenceImage(event.currentTarget.files?.[0])} />
            </label>
            <p>선택한 캐릭터와 가까운 카툰·3D 렌더 무드를 우선 참고하며, 원하는 이미지를 직접 올릴 수 있습니다.</p>
          </section>

          <section className="character-flow-card character-step-heading character-step-heading-three glass-panel">
            <strong>03</strong>
          </section>

          <section className="character-flow-card character-detail-copy-card glass-panel">
            <h2>캐릭터에 대해<br />더 구체적으로<br />알려주세요!</h2>
          </section>

          <section className="character-flow-card character-prompt-card glass-panel">
            <span className="character-field-label">외형 프롬프트 입력</span>
            <label className="character-prompt-box">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.currentTarget.value)}
                placeholder="캐릭터의 외형, 색상, 의상, 특징 등을 자유롭게 입력해 주세요. 예) 갈색 단발머리, 둥근 얼굴, 큰 눈, 노란 후드티"
                maxLength={1000}
              />
              <span>{prompt.length} / 1000</span>
            </label>
            <button type="button" className="character-generate-inline" onClick={createCharacter} disabled={generating || saving}>
              <Icon name="star" size={16} />
              {generating ? "캐릭터 생성 중..." : "캐릭터 생성 시작하기"}
            </button>
          </section>
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
          <ScrollSlideContainer
            steps={steps}
            currentStep={currentStep}
            onStepChange={(index) => setCurrentStep(index)}
            onComplete={createCharacter}
            busy={generating || saving}
            completeLabel="캐릭터 생성하기"
            busyLabel="캐릭터 생성 중"
            className="character-scroll-slider"
          />
        </>
      ) : (
        <div className="character-result-layout">
          <h1 className="character-result-title">캐릭터가 성공적으로<br />생성되었습니다!</h1>
          <div className="character-result-actions">
            <button className="character-share-button" type="button" onClick={handleShare} disabled={!resultReady || saving}>
              <Icon name="image" size={16} />
              <span>공유</span>
            </button>
            <button className="character-library-button" type="button" onClick={saveAndContinue} disabled={!resultReady || saving}>
              {saving ? "저장 중..." : "보관함 이동"}
            </button>
            <button className="character-create-emoticon-button" type="button" onClick={saveAndCreateEmoticon} disabled={!resultReady || saving}>
              {saving ? "저장 중..." : "이 캐릭터로 이모티콘 생성하기"}
            </button>
          </div>

          <section className="character-result-name-card character-flow-card glass-panel">
            <span className="character-field-label">캐릭터 이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="캐릭터 이름"
            />
            <div className="character-result-tags">
              {selectedTraits.map((t) => (
                <span key={t}>#{t}</span>
              ))}
              <span>#{type}</span>
              <span>#{subType}</span>
              <span>#{style}</span>
            </div>
          </section>

          <section className="character-result-info-card character-flow-card glass-panel">
            <span className="character-field-label">캐릭터 정보</span>
            <div>
              <p>
                이 캐릭터는 <strong>{selectedTraits.join(", ")}</strong> 성격의 <strong>{subType}</strong> 캐릭터입니다.
              </p>
              <p>
                전체적으로 부드러운 <strong>{tone}</strong> 색상과 <strong>{style === "3D" ? "Soft 3D 피규어" : "Soft 2D 플랫"} ({detailStyle})</strong> 그림체 스타일을 적용하여 이모티콘 5프레임 동작 프레임 생성에 적합하게 튜닝된 토큰입니다.
              </p>
            </div>
          </section>

          <section className="character-result-preview-card character-flow-card glass-panel">
            <img
              src={variationImages[selectedVariationIndex] || generated.imageUrl}
              alt="Result character preview"
              onLoad={() => setResultReady(true)}
              onError={() => {
                setResultReady(false);
                notify("생성된 캐릭터 이미지를 표시하지 못했습니다. 네트워크 상태를 확인해 주세요.");
              }}
            />
            {variationImages.length > 1 ? (
              <div className="character-result-variation-rail" aria-label="캐릭터 베리에이션 선택">
                {variationImages.map((image, index) => (
                  <button
                    key={index}
                    type="button"
                    className={index === selectedVariationIndex ? "active" : ""}
                    onClick={() => selectVariation(index)}
                    aria-label={`베리에이션 ${index + 1}`}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      )}

      {process && <WorkProcessScreen title={process.title} label={process.label} percent={process.percent} />}
    </div>
  );
}

function WorkProcessScreen({ title, label, percent }: ProcessState) {
  return (
    <section className="work-process-screen character-generation-process" role="status" aria-live="polite">
      <div className="work-process-inner">
        <h2>{title}</h2>
        <div className="work-process-meter" aria-label={`진행률 ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <p>
          <span>{label}</span>
          <strong>{percent}%</strong>
        </p>
      </div>
    </section>
  );
}

function CharacterDropdown({
  id,
  label,
  value,
  options,
  open,
  onToggle,
  onSelect,
}: {
  id: CharacterDropdownId;
  label: string;
  value: string;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className={`character-dropdown ${open ? "is-open" : ""}`} data-dropdown={id}>
      <span className="character-field-label">{label}</span>
      <button type="button" className="character-dropdown-trigger" onClick={onToggle} aria-expanded={open}>
        <span>{value}</span>
        <Icon name={open ? "previous" : "next"} size={14} />
      </button>
      <div className="character-dropdown-menu" aria-hidden={!open}>
        {options.map((option) => (
          <button key={option} type="button" className={option === value ? "active" : ""} onClick={() => onSelect(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
