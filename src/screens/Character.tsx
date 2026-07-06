import { useState } from "react";
import { Icon } from "../components/Icon";
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
const traits = ["밝은", "다정한", "차분한", "활발한", "귀여운", "장난스러운"];
const characterTypes = ["사람", "식물", "동물", "음식", "물건"];
type ProcessState = { title: string; label: string; percent: number };

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
  const [process, setProcess] = useState<ProcessState | null>(null);
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
    setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터 설정을 정리하는 중...", percent: 8 });
    try {
      const draft = buildToken("");
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "프롬프트와 스타일 토큰을 준비하는 중...", percent: 18 });
      await Promise.resolve();
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터의 형태와 색상을 생성하는 중...", percent: 38 });
      const result = await ai.generateCharacter(draft);
      const images = result.imageUrls?.length ? result.imageUrls : [result.imageUrl];
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "생성 결과를 투명 캐릭터 토큰으로 정리하는 중...", percent: 82 });
      const token = buildToken(images[0], draft.id);
      const next = { ...result, imageUrl: images[0], imageUrls: images, token: { ...token, sourceAsset: images[0], referenceImages: [images[0]] } };
      setGenerated(next);
      setSelectedVariationIndex(0);
      setProcess({ title: "입력한 정보를 바탕으로 캐릭터를 생성하고 있습니다.", label: "캐릭터 초안 준비 완료", percent: 100 });
      notify("새 캐릭터 초안이 생성됐어요. 원하는 베리에이션을 고른 뒤 저장하세요.");
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

  const characterSummary = generated
    ? [
        `${trait} 인상의 ${type} 캐릭터`,
        prompt.trim() ? `사용자 설명: ${prompt.trim()}` : "사용자 설명: 기본 설정 기반",
        `포인트 컬러 ${tone.toUpperCase()} · ${selectedPalette.label}`,
        style === "3D" ? "귀여운 3D 피규어형 스타일" : "부드러운 2D 이모티콘형 스타일",
      ]
    : [];

  return (
    <div className="workspace-page character-page">
        <header className="screen-brief character-brief">
          <span>01</span>
          <h1>이모티콘에 사용할 캐릭터를 만들어보세요.</h1>
          <p>어떤 캐릭터를 만들고 싶나요?</p>
        </header>
        <div className="character-designer">
          <section className="character-settings-panel glass-panel" aria-labelledby="character-settings-title">
            <header className="figma-panel-heading"><h1 id="character-settings-title">새 캐릭터 설정</h1><Icon name="settings" /></header>

            <div className="design-setting-group">
              <h2><i />컬러 팔레트</h2>
              <label className="palette-dropdown"><span>팔레트 프리셋</span><select value={paletteId} onChange={(event) => { const next = event.currentTarget.value as typeof paletteId; setPaletteId(next); const palette = palettes.find((item) => item.id === next) ?? palettes[0]; setTone(palette.colors[0]); }} aria-label="컬러 팔레트 선택">{palettes.map((palette) => <option key={palette.id} value={palette.id}>{palette.label}</option>)}</select></label>
              <div className="palette-control point-color-control"><span>포인트 컬러</span><div className="swatch-row">{selectedPalette.colors.map((color) => <button key={color} type="button" className={`color-swatch ${tone.toLowerCase() === color.toLowerCase() ? "active" : ""}`} style={{ background: color }} onClick={() => setTone(color)} aria-label={`${color} 선택`} />)}<label className={`custom-color-swatch ${tone.toLowerCase() === customTone.toLowerCase() ? "active" : ""}`} style={{ background: customTone }} aria-label="직접 색상 선택"><input type="color" value={customTone} onChange={(event) => chooseCustomTone(event.currentTarget.value)} /><Icon name="edit" size={12} /></label></div></div>
            </div>

            <div className="design-setting-group">
              <h2><i />성격 태그</h2>
              <div className="chip-row">{traits.map((item) => <button key={item} type="button" className={`chip ${trait === item ? "active" : ""}`} onClick={() => setTrait(item)}>{item}</button>)}</div>
            </div>

            <div className="design-setting-group">
              <h2><i />캐릭터 타입</h2>
              <div className="chip-row">{characterTypes.map((item) => <button key={item} type="button" className={`chip ${type === item ? "active" : ""}`} onClick={() => setType(item)}>{item}</button>)}</div>
              <div className="character-select-grid"><label><span>세부 종류</span><select aria-label="세부 종류" value={type === "동물" ? "직접 지정" : type} onChange={(event) => setType(event.currentTarget.value === "직접 지정" ? "동물" : event.currentTarget.value)}><option>직접 지정</option><option>{type}</option><option>펭귄</option><option>토끼</option><option>우주인</option></select></label><label><span>스타일</span><select aria-label="스타일" value={style === "3D" ? "Soft 3D" : "Soft 2D"} onChange={(event) => setStyle(event.currentTarget.value.includes("3D") ? "3D" : "2D")}><option>Soft 3D</option><option>Soft 2D</option></select></label></div>
            </div>

            <div className="design-setting-group style-preset-group">
              <h2><i />스타일 프리셋</h2>
              <div className="style-preset-list">{(["2D", "3D"] as const).map((item) => <button key={item} type="button" className={style === item ? "active" : ""} onClick={() => setStyle(item)}><span className="preset-cube"><Icon name={item === "3D" ? "layers" : "image"} /></span><b>{item}</b><i /></button>)}</div>
            </div>

            <label className="character-prompt-field"><span>캐릭터 설명</span><input type="text" value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} placeholder="예: 별을 좋아하는 말랑한 아기 펭귄" /></label>
            <button className="character-generate-button" type="button" onClick={createCharacter} disabled={generating}><Icon name={generating ? "reload" : "star"} className={generating ? "spin" : ""} />{generating ? "캐릭터 생성 중" : "캐릭터 생성하기"}</button>
          </section>

          <section className="character-preview-panel glass-panel" aria-label="캐릭터 미리보기">
            <label className="character-name-control"><span>Name</span><div><i style={{ background: tone }} /><input value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={12} placeholder="새 캐릭터" /><Icon name="edit" /></div></label>
            <div className={`character-preview-figure ${generated ? "has-character" : "is-empty"}`}>
              <span className="character-preview-glow" style={{ background: tone }} />
              {generated ? <img src={generated.imageUrl} alt={`${generated.token.name} 캐릭터`} /> : <div className="character-empty-state"><Icon name="star" size={34} /><strong>아직 캐릭터가 없어요</strong><p>설명과 포인트 컬러를 정한 뒤 새 캐릭터를 생성하세요.</p></div>}
            </div>
            <footer className="character-preview-actions"><div><button className="round-tool" type="button" aria-label="실행 취소" disabled={!generated}><Icon name="undo" /></button><button className="round-tool mirror-x" type="button" aria-label="다시 실행" disabled={!generated}><Icon name="undo" /></button></div><div className="character-save-actions"><button className="save-character-button" type="button" onClick={saveAndContinue} disabled={!generated}>캐릭터 저장하기</button><button className="create-with-character-button" type="button" onClick={saveAndCreateEmoticon} disabled={!generated}>이 캐릭터로 이모티콘 생성하기</button></div></footer>
          </section>

          <aside className="character-results-panel glass-panel" aria-labelledby="character-result-title">
            <header className="figma-panel-heading"><h2 id="character-result-title">생성 결과</h2><Icon name="settings" /></header>
            <h3 className="result-subtitle"><i />생성 Variations</h3>
            <div className={`character-variation-grid ${generated ? "" : "is-empty"}`}>{generated ? variationImages.map((image, index) => <button key={`${image}-${index}`} type="button" className={index === selectedVariationIndex ? "active" : ""} onClick={() => selectVariation(index)} aria-label={`${generated.token.name} ${index + 1}번 변형`}><img src={image} alt="" /></button>) : Array.from({ length: 4 }, (_, index) => <button key={`empty-variation-${index}`} type="button" disabled aria-label={`비어있는 변형 ${index + 1}`}><span className="variation-placeholder"><Icon name="image" /></span></button>)}</div>
            <div className="character-summary"><strong>✦ 캐릭터 요약</strong>{generated ? <p>{characterSummary.map((line) => <span key={line}>{line}<br /></span>)}</p> : <p>생성 전에는 기존 캐릭터를 보여주지 않습니다.<br />프롬프트와 팔레트 선택 후 새 토큰이 만들어집니다.</p>}</div>
          </aside>
        </div>
        {process ? <WorkProcessScreen title={process.title} label={process.label} percent={process.percent} /> : null}
    </div>
  );
}

function WorkProcessScreen({ title, label, percent }: ProcessState) {
  return (
    <section className="work-process-screen" role="status" aria-live="polite">
      <div className="work-process-inner">
        <h2>{title}</h2>
        <div className="work-process-meter" aria-label={`진행률 ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <p><span>{label}</span><strong>{percent}%</strong></p>
      </div>
    </section>
  );
}
