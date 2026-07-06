import { useState } from "react";
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

const traits = ["밝은", "다정한", "차분한", "활발한", "귀여운", "장난스러운"];
const characterTypes = ["사람", "식물", "동물", "음식", "물건"];
type ProcessState = { title: string; label: string; percent: number };

export function CharacterPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState(characterName.value);
  const [prompt, setPrompt] = useState(characterPrompt.value);
  const [trait, setTrait] = useState("귀여운");
  const [type, setType] = useState("동물");
  const [style, setStyle] = useState<"2D" | "3D">(characterStyle.value || "3D");
  const [paletteId, setPaletteId] = useState<(typeof palettes)[number]["id"]>("soft-pastel");
  const [tone, setTone] = useState(characterTone.value || "#BDB2FF");
  const [customTone, setCustomTone] = useState(characterTone.value || "#BDB2FF");
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

  const saveGeneratedCharacter = async (target: "/mypage" | "/emoticon") => {
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
    notify(target === "/emoticon" ? `새 캐릭터 토큰을 저장하고 이 캐릭터로 이모티콘 제작을 시작합니다. ${remoteMessage}` : `새 캐릭터 토큰을 보관함에 저장했어요. ${remoteMessage}`);
    navigate(target);
  };

  const saveAndContinue = () => saveGeneratedCharacter("/mypage");
  const saveAndCreateEmoticon = () => saveGeneratedCharacter("/emoticon");

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

  // Steps configuration for ScrollSlideContainer
  const steps = [
    {
      id: "char-type-traits",
      label: "01 · 캐릭터 타입 및 성격",
      content: (
        <div className="input-step-layout">
          <div className="step-left">
            <Panel title="✦ 캐릭터 타입" className="type-select-panel">
              <span className="step-desc">만들고 싶은 캐릭터의 핵심 분류를 정해 주세요.</span>
              <div className="chip-row">
                {characterTypes.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`chip large ${type === item ? "active" : ""}`}
                    onClick={() => setType(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="detail-type-row" style={{ marginTop: "24px" }}>
                <label>
                  <span>세부 명칭 직접 입력 또는 프리셋</span>
                  <select
                    aria-label="세부 종류"
                    value={type === "동물" ? "직접 지정" : type}
                    onChange={(event) => setType(event.currentTarget.value === "직접 지정" ? "동물" : event.currentTarget.value)}
                  >
                    <option>직접 지정</option>
                    <option>{type}</option>
                    <option>펭귄</option>
                    <option>토끼</option>
                    <option>우주인</option>
                  </select>
                </label>
              </div>
            </Panel>
          </div>
          <div className="step-right">
            <Panel title="✦ 성격 키워드" className="traits-select-panel">
              <span className="step-desc">캐릭터의 인상을 결정할 키워드를 선택하세요.</span>
              <div className="chip-row">
                {traits.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`chip ${trait === item ? "active" : ""}`}
                    onClick={() => setTrait(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <p className="explain-note" style={{ marginTop: "24px" }}>
                선택한 성격과 타입에 따라 AI 캐릭터 프롬프트의 기본 실루엣 및 묘사 키워드가 자동 조정됩니다.
              </p>
            </Panel>
          </div>
        </div>
      ),
      validate: () => null
    },
    {
      id: "char-color-style",
      label: "02 · 색상 및 드로잉 스타일",
      content: (
        <div className="input-step-layout">
          <div className="step-left">
            <Panel title="✦ 메인 컬러" className="color-select-panel">
              <label className="palette-dropdown">
                <span>컬러 팔레트 프리셋</span>
                <select
                  value={paletteId}
                  onChange={(event) => {
                    const next = event.currentTarget.value as typeof paletteId;
                    setPaletteId(next);
                    const palette = palettes.find((item) => item.id === next) ?? palettes[0];
                    setTone(palette.colors[0]);
                  }}
                  aria-label="컬러 팔레트 선택"
                >
                  {palettes.map((palette) => (
                    <option key={palette.id} value={palette.id}>
                      {palette.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="palette-control point-color-control" style={{ marginTop: "20px" }}>
                <span>포인트 컬러 선택</span>
                <div className="swatch-row">
                  {selectedPalette.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${tone.toLowerCase() === color.toLowerCase() ? "active" : ""}`}
                      style={{ background: color }}
                      onClick={() => setTone(color)}
                      aria-label={`${color} 선택`}
                    />
                  ))}
                  <label
                    className={`custom-color-swatch ${tone.toLowerCase() === customTone.toLowerCase() ? "active" : ""}`}
                    style={{ background: customTone }}
                    aria-label="직접 색상 선택"
                  >
                    <input type="color" value={customTone} onChange={(event) => chooseCustomTone(event.currentTarget.value)} />
                    <Icon name="edit" size={12} />
                  </label>
                </div>
              </div>
            </Panel>
          </div>
          <div className="step-right">
            <Panel title="✦ 스타일 프리셋" className="style-select-panel">
              <span className="step-desc">이모티콘 디자인의 그림체를 선택하세요.</span>
              <div className="style-preset-list">
                {(["2D", "3D"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`style-card ${style === item ? "active" : ""}`}
                    onClick={() => setStyle(item)}
                  >
                    <span className="preset-cube">
                      <Icon name={item === "3D" ? "layers" : "image"} size={20} />
                    </span>
                    <b>{item} 그림체</b>
                    <small>
                      {item === "3D" ? "말랑말랑한 3D 클레이/피규어 질감" : "부드럽고 깔끔한 2D 플랫 벡터 일러스트"}
                    </small>
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      ),
      validate: () => null
    },
    {
      id: "char-description",
      label: "03 · 캐릭터 묘사 및 생성",
      content: (
        <div className="input-step-layout final-step">
          <div className="step-left">
            <Panel title="✦ 구체적 묘사 설명" className="prompt-panel">
              <span className="step-desc">캐릭터의 외형이나 소품, 특징을 더 상세히 적어주세요.</span>
              <textarea
                className="character-prompt-textarea"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="예: 큰 별을 좋아하는 둥근 아기 펭귄, 파스텔톤 우주 헬멧을 쓰고 있음"
                maxLength={500}
              />
              <span className="char-count">{prompt.length}/500자</span>
            </Panel>
          </div>
          <div className="step-right">
            <Panel title="✦ 생성 실행" className="execute-panel">
              <div className="setup-summary-box">
                <h4>설정 요약</h4>
                <ul>
                  <li>타입: {type} ({trait} 인상)</li>
                  <li>스타일: {style === "3D" ? "Soft 3D 피규어" : "Soft 2D 플랫"}</li>
                  <li>포인트 컬러: <i className="color-dot" style={{ background: tone }} /> {tone}</li>
                </ul>
              </div>
              <button
                type="button"
                className="character-generate-button"
                onClick={createCharacter}
                disabled={generating}
              >
                <Icon name={generating ? "reload" : "star"} className={generating ? "spin" : ""} />
                {generating ? "캐릭터 생성 중..." : "AI 캐릭터 생성하기"}
              </button>
            </Panel>
          </div>
        </div>
      ),
      validate: () => {
        if (!prompt.trim()) {
          return "구체적인 캐릭터 묘사가 적히지 않았습니다. 빈 상태로 생성 시 기본 설정에 의존하여 형태를 구상하게 됩니다.";
        }
        return null;
      }
    }
  ];

  return (
    <div className="workspace-page character-page">
      <header className="screen-brief character-brief">
        <span>01</span>
        <h1>이모티콘에 사용할 고유한 캐릭터를 생성합니다.</h1>
        <p>단계별 외형/그림체 프리셋 설정</p>
      </header>

      {generated ? (
        /* Result View (Figma 113-834 Redesign) */
        <div className="character-result-layout">
          <div className="result-left-preview">
            <Panel title="✦ 생성된 캐릭터 토큰" className="result-preview-panel">
              <label className="character-name-control">
                <span>이름 설정</span>
                <div>
                  <i style={{ background: tone }} />
                  <input
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    maxLength={12}
                    placeholder="새 캐릭터 이름"
                  />
                  <Icon name="edit" />
                </div>
              </label>

              <div className="character-preview-figure has-character">
                <span className="character-preview-glow" style={{ background: tone }} />
                <img src={variationImages[selectedVariationIndex] || generated.imageUrl} alt="생성 완료 캐릭터" />
              </div>
            </Panel>
          </div>

          <div className="result-right-details">
            <Panel title="✦ 베리에이션 및 저장" className="result-actions-panel">
              <h4>생성 Variations</h4>
              <span className="select-tip">원하는 형태의 변형 초안 카드를 선택하세요.</span>
              
              <div className="character-variation-grid">
                {variationImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    className={index === selectedVariationIndex ? "active" : ""}
                    onClick={() => selectVariation(index)}
                    aria-label={`변형 ${index + 1}`}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>

              <div className="character-summary">
                <strong>✦ 캐릭터 명세 요약</strong>
                <p>
                  {characterSummary.map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                </p>
              </div>

              <div className="result-nav-buttons">
                <button type="button" className="btn-secondary" onClick={() => setGenerated(null)}>
                  <Icon name="reload" />
                  다시 만들기
                </button>
                <div className="action-group">
                  <button type="button" className="save-character-button" onClick={saveAndContinue}>
                    보관함에 저장
                  </button>
                  <button type="button" className="create-with-character-button" onClick={saveAndCreateEmoticon}>
                    이 캐릭터로 이모티콘 만들기
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      ) : (
        /* Designer Steps View */
        <ScrollSlideContainer
          steps={steps}
          currentStep={currentStep}
          onStepChange={(index) => setCurrentStep(index)}
          className="character-scroll-slider"
        />
      )}

      {process && <WorkProcessScreen title={process.title} label={process.label} percent={process.percent} />}
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
