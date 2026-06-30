import { useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { syncCharacterToFirebase } from "../services/firebase";
import { saveCharacter } from "../services/repository";
import { characterName, characterPrompt, characters, characterStyle, characterTone, notify, notifyError, selectCharacter } from "../store";
import type { CharacterToken, GeneratedCharacterResult } from "../types";

const ai = getAIProvider();
const palettes = [
  { id: "soft-pastel", label: "Soft Pastel", colors: ["#BDB2FF", "#9FF3DC", "#FFC8D2", "#FFF0A8", "#B8D8FF"] },
  { id: "aurora-pop", label: "Aurora Pop", colors: ["#8CA5FF", "#BBB6FF", "#FFADE3", "#78D6C6", "#FFD36E"] },
  { id: "cosmic-calm", label: "Cosmic Calm", colors: ["#A7A3FF", "#6F83FF", "#B7BDC8", "#E4E0F0", "#78A8FF"] },
] as const;
const traits = ["밝은", "다정한", "차분한", "활발한", "귀여운", "장난스러운"];
const characterTypes = ["사람", "식물", "동물", "음식", "물건"];

export function CharacterPage() {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [trait, setTrait] = useState("귀여운");
  const [type, setType] = useState("동물");
  const [style, setStyle] = useState<"2D" | "3D">("3D");
  const [paletteId, setPaletteId] = useState<(typeof palettes)[number]["id"]>("soft-pastel");
  const [tone, setTone] = useState("#BDB2FF");
  const [customTone, setCustomTone] = useState("#BDB2FF");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedCharacterResult | null>(null);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);
  const selectedPalette = palettes.find((item) => item.id === paletteId) ?? palettes[0];
  const variationImages = generated?.imageUrls?.length ? generated.imageUrls : generated ? [generated.imageUrl] : [];

  const buildToken = (imageUrl = "", id?: string): CharacterToken => {
    const now = new Date().toISOString();
    const fallbackName = `${trait} ${type} 캐릭터`;
    const finalPrompt = `${prompt.trim() || `${trait} 인상의 ${type} 캐릭터`} ${selectedPalette.label} 팔레트, ${style === "3D" ? "귀여운 3D 소프트 피규어" : "부드러운 2D 이모티콘"} 스타일`.trim();
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
        ? "soft 3D chibi, rounded toy-like volume, pastel material, gentle studio light, isolated sticker-ready character"
        : "soft 2D chibi, rounded silhouette, pastel cel shading, clean outline, isolated sticker-ready character",
      prompt: finalPrompt,
      observableTraits: [trait, type, "둥근 실루엣", "짧은 팔다리"],
      personalityTags: [trait, "귀여운"],
      colors: { body: tone, accent: selectedPalette.colors[2], face: "#FCFCFC" },
      fixedTraits: [trait, type, "주요 실루엣", "포인트 컬러"],
      doNotChange: ["캐릭터 정체성", "몸 비율", "주요 색상", "얼굴 비율"],
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
    setGenerating(true);
    try {
      const draft = buildToken("");
      const result = await ai.generateCharacter(draft);
      const images = result.imageUrls?.length ? result.imageUrls : [result.imageUrl];
      const token = buildToken(images[0], draft.id);
      const next = { ...result, imageUrl: images[0], imageUrls: images, token: { ...token, sourceAsset: images[0], referenceImages: [images[0]] } };
      setGenerated(next);
      setSelectedVariationIndex(0);
      notify("새 캐릭터 초안이 생성됐어요. 원하는 베리에이션을 고른 뒤 저장하세요.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "캐릭터 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const saveAndContinue = async () => {
    if (!generated) return;
    const selectedImage = variationImages[selectedVariationIndex] ?? generated.imageUrl;
    let saved = { ...buildToken(selectedImage, generated.token.id), sourceAsset: selectedImage, referenceImages: [selectedImage], updatedAt: new Date().toISOString() };
    let firebaseMessage = "Firebase 설정이 없어 IndexedDB에만 임시 저장했습니다.";
    try {
      const sync = await syncCharacterToFirebase(saved);
      if (sync.ownerId) saved = { ...saved, ownerId: sync.ownerId };
      if (sync.enabled) firebaseMessage = "Firebase에 저장했습니다.";
    } catch (error) {
      firebaseMessage = `Firebase 저장 실패로 IndexedDB에만 임시 저장했습니다: ${error instanceof Error ? error.message : String(error)}`;
    }
    await saveCharacter(saved);
    characters.value = [saved, ...characters.value.filter((item) => item.id !== saved.id)];
    characterName.value = saved.name;
    characterPrompt.value = saved.prompt;
    characterTone.value = tone;
    characterStyle.value = style;
    selectCharacter(saved.id);
    notify(`새 캐릭터 토큰을 보관함에 저장했어요. ${firebaseMessage}`);
    navigate("/library");
  };

  const chooseCustomTone = (value: string) => {
    setCustomTone(value);
    setTone(value);
  };

  const characterSummary = generated
    ? [
        `${trait} 인상의 ${type} 캐릭터`,
        prompt.trim() ? `사용자 설명: ${prompt.trim()}` : "사용자 설명: 기본 설정 기반",
        `포인트 컬러 ${tone.toUpperCase()} · ${selectedPalette.label}`,
        style === "3D" ? "귀여운 3D 피규어형 스타일" : "부드러운 2D 이모티콘형 스타일",
      ]
    : [];

  return (
    <div class="workspace-page character-page">
        <div class="character-designer">
          <section class="character-settings-panel glass-panel" aria-labelledby="character-settings-title">
            <header class="figma-panel-heading"><h1 id="character-settings-title">새 캐릭터 설정</h1><Icon name="settings" /></header>

            <div class="design-setting-group">
              <h2><i />컬러 팔레트</h2>
              <label class="palette-dropdown"><span>팔레트 프리셋</span><select value={paletteId} onChange={(event) => { const next = event.currentTarget.value as typeof paletteId; setPaletteId(next); const palette = palettes.find((item) => item.id === next) ?? palettes[0]; setTone(palette.colors[0]); }} aria-label="컬러 팔레트 선택">{palettes.map((palette) => <option value={palette.id}>{palette.label}</option>)}</select></label>
              <div class="palette-control point-color-control"><span>포인트 컬러</span><div class="swatch-row">{selectedPalette.colors.map((color) => <button type="button" class={`color-swatch ${tone.toLowerCase() === color.toLowerCase() ? "active" : ""}`} style={{ background: color }} onClick={() => setTone(color)} aria-label={`${color} 선택`} />)}<label class={`custom-color-swatch ${tone.toLowerCase() === customTone.toLowerCase() ? "active" : ""}`} style={{ background: customTone }} aria-label="직접 색상 선택"><input type="color" value={customTone} onInput={(event) => chooseCustomTone(event.currentTarget.value)} /><Icon name="edit" size={12} /></label></div></div>
            </div>

            <div class="design-setting-group">
              <h2><i />성격 태그</h2>
              <div class="chip-row">{traits.map((item) => <button type="button" class={`chip ${trait === item ? "active" : ""}`} onClick={() => setTrait(item)}>{item}</button>)}</div>
            </div>

            <div class="design-setting-group">
              <h2><i />캐릭터 타입</h2>
              <div class="chip-row">{characterTypes.map((item) => <button type="button" class={`chip ${type === item ? "active" : ""}`} onClick={() => setType(item)}>{item}</button>)}</div>
              <div class="character-select-grid"><label><span>세부 종류</span><select aria-label="세부 종류" value={type === "동물" ? "직접 지정" : type}><option>직접 지정</option><option>{type}</option><option>펭귄</option><option>토끼</option><option>우주인</option></select></label><label><span>스타일</span><select aria-label="스타일" value={style === "3D" ? "Soft 3D" : "Soft 2D"} onChange={(event) => setStyle(event.currentTarget.value.includes("3D") ? "3D" : "2D")}><option>Soft 3D</option><option>Soft 2D</option></select></label></div>
            </div>

            <div class="design-setting-group style-preset-group">
              <h2><i />스타일 프리셋</h2>
              <div class="style-preset-list">{(["2D", "3D"] as const).map((item) => <button type="button" class={style === item ? "active" : ""} onClick={() => setStyle(item)}><span class="preset-cube"><Icon name={item === "3D" ? "layers" : "image"} /></span><b>{item}</b><i /></button>)}</div>
            </div>

            <label class="character-prompt-field"><span>캐릭터 설명</span><input type="text" value={prompt} onInput={(event) => setPrompt(event.currentTarget.value)} placeholder="예: 별을 좋아하는 말랑한 아기 펭귄" /></label>
            <button class="character-generate-button" type="button" onClick={createCharacter} disabled={generating}><Icon name={generating ? "reload" : "star"} class={generating ? "spin" : ""} />{generating ? "캐릭터 생성 중" : "캐릭터 생성하기"}</button>
          </section>

          <section class="character-preview-panel glass-panel" aria-label="캐릭터 미리보기">
            <label class="character-name-control"><span>Name</span><div><i style={{ background: tone }} /><input value={name} onInput={(event) => setName(event.currentTarget.value)} maxLength={12} placeholder="새 캐릭터" /><Icon name="edit" /></div></label>
            <div class={`character-preview-figure ${generated ? "has-character" : "is-empty"}`}>
              <span class="character-preview-glow" style={{ background: tone }} />
              {generated ? <img src={generated.imageUrl} alt={`${generated.token.name} 캐릭터`} /> : <div class="character-empty-state"><Icon name="star" size={34} /><strong>아직 캐릭터가 없어요</strong><p>설명과 포인트 컬러를 정한 뒤 새 캐릭터를 생성하세요.</p></div>}
            </div>
            <footer class="character-preview-actions"><div><button class="round-tool" type="button" aria-label="실행 취소" disabled={!generated}><Icon name="undo" /></button><button class="round-tool mirror-x" type="button" aria-label="다시 실행" disabled={!generated}><Icon name="undo" /></button></div><button class="save-character-button" type="button" onClick={saveAndContinue} disabled={!generated}>캐릭터 저장하기</button></footer>
          </section>

          <aside class="character-results-panel glass-panel" aria-labelledby="character-result-title">
            <header class="figma-panel-heading"><h2 id="character-result-title">생성 결과</h2><Icon name="settings" /></header>
            <h3 class="result-subtitle"><i />생성 Variations</h3>
            <div class={`character-variation-grid ${generated ? "" : "is-empty"}`}>{generated ? variationImages.map((image, index) => <button type="button" class={index === selectedVariationIndex ? "active" : ""} onClick={() => selectVariation(index)} aria-label={`${generated.token.name} ${index + 1}번 변형`}><img src={image} alt="" /></button>) : Array.from({ length: 4 }, (_, index) => <button type="button" disabled aria-label={`비어있는 변형 ${index + 1}`}><span class="variation-placeholder"><Icon name="image" /></span></button>)}</div>
            <div class="character-summary"><strong>✦ 캐릭터 요약</strong>{generated ? <p>{characterSummary.map((line) => <><span>{line}</span><br /></>)}</p> : <p>생성 전에는 기존 캐릭터를 보여주지 않습니다.<br />프롬프트와 팔레트 선택 후 새 토큰이 만들어집니다.</p>}</div>
          </aside>
        </div>
    </div>
  );
}
