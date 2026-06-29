# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable EMOVE decisions

- The Figma page `0621 3차평가` is the visual source of truth.
- Use clean History API paths such as `/home`, `/character`, `/input`, `/edit`, and `/library`.
- Keep desktop content at a maximum width of 1440px and make every screen responsive.
- Use 760px as the global minimum screen height; if the viewport is shorter, the page must scroll instead of clipping.
- The Edit timeline has exactly four ordered layers: background effects, character, accent effects, and text.
- OpenAI-dependent features must run through a mock provider until the user supplies an API key.
- For `gpt-image-2`, generate character/effect assets on flat chroma-key green and remove the green background in-browser so stored/displayed assets become transparent PNG data URLs.
- Copy every used font, icon, and image into this project. Use coolicons only; never mix icon libraries.
- Work on v1 only; there is no active v2 implementation.
- The six Figma-exported SVG screens supplied on 2026-06-24 are the page-level layout references for Home, Character, Input, Edit, Library, and Library Detail.
- All primary page regions, including the Edit toolbar, editor grid, properties, and timeline, share one 1440px desktop frame and common left/right edges.
- Use a restrained dark liquid-glass treatment: near-black translucent surfaces, thin lavender borders, and small highlight/refraction cues. Avoid opaque blue panel fills.
- Treat liquid glass as the first visual priority: black glass depth, thin lavender rim light, top glint, subtle internal refraction, and press/hover micro-interactions should be consistent across nav, panels, cards, buttons, and editor controls.
- Keep the moving glass sheen/sparkle hover effect on buttons only; panels, cards, and generic div regions may change border/depth but must not run shimmer sweeps on hover.
- `/home` is not one of the primary nav destinations, so the nav should not show an active moving glass pill on Home.
- In Library, the decorated first card in the source represents hover/focus state; all cards use the same default style.
- Use short spring-like micro-interactions only where they communicate selection, press, reveal, drag, or navigation. Respect reduced-motion and avoid continuously animating blur or filters.
- Character creation starts empty: do not show an existing character until the user generates a new draft, then save the resulting token explicitly.
- Character color palette is a dropdown preset; point color remains swatches plus one custom color picker swatch that shows the selected custom color.
- Library separates emoticon and character views, and item cards flow horizontally first with a 3-column desktop grid rather than masonry columns.
- Library category filters are horizontally scrollable/draggable and should show an edge fade when overflow is possible.
- Edit canvas must clearly show the square 360×360 export boundary while keeping the surrounding stage usable as the workspace.
- Edit stores layer x/y/scale/rotation per each of the fixed five frames; GIF export renders those five frame states with a user-adjustable per-frame delay.
- Voice waveform uses FFT frequency bins during recording and a quiet dot baseline before voice input.
- Keep the top shell/header persistent across route changes so the nav selection can spring between pages without remounting.
- Do not show pointer-style glow outlines on text inputs after mouse click; keep only a restrained accessible keyboard focus state.
- Character and emoticon generation prompts must request flat chroma-key green backgrounds only, not transparent backgrounds; transparency is produced by the in-browser chroma-key removal step.
- Generated character variations must be selectable, and selecting a variation must update the main preview/canvas to that exact result.
- After saving a generated character or emoticon, route the user to Library; Library must support All, Emoticon, and Character views.
- Library category/group filters must be distinct. Celebration and gratitude cannot activate together just because both map to happy emotion.
- Library search belongs above the group/filter list rather than pinned at the bottom of the sidebar.
- Library group naming uses "이모티콘 그룹"; user-created groups must allow a custom group name and configurable filter conditions.
- Library hover effects must end when the pointer leaves a card, even after clicking internal card action buttons.
- Transparent preview grids must be smaller and lighter; grid/pattern backgrounds should appear only on intended preview surfaces, especially Library detail's `detail-stage`.
- Edit text layer selection bounds must match the rendered text bubble exactly, including resize behavior.
- When editing a frame, later frames should inherit the same layer transform unless the user explicitly changes them, so animation remains continuous.
- Edit preview and export must share the same 360×360 GIF-safe color/alpha constraints so the looped GIF does not visually diverge from the frame editor.
- Source code, styles, fonts, icons, and used UI images should be referenced from `src/` and `src/assets/` in v1; old root-level source/asset folders are legacy copies only until explicitly removed.
- Firebase sync uses optional `VITE_FIREBASE_CONFIG` plus anonymous auth. Firestore stores `characters`, `captures`, `projects`, and `stickers`; Storage stores generated GIFs under `emoticons/{ownerId}/{fileName}`.
- Input analysis must visibly show the understood behavior, expression/emotion key, voice usage, and emotion background-effect guide instead of only showing a completion toast.
- Library category UI must keep display category state separate from emotion filtering so same-emotion categories such as celebration and gratitude do not appear selected at the same time.
- Manual emotion changes after analysis affect only background/core effects, not captured expression, action, voice, or speech-bubble text facts.
- Character tokens must store an explicit 2D/3D `styleMode`; later character frames must keep that mode instead of blending styles.
- Input-to-edit generation automatically creates only the five character frames. Generated core-effect image layers are on-demand from the Edit screen to avoid adding image-generation cost by default.
- Edit must include a live loop preview that renders the same five frame states at the selected frame delay before exporting.
- Future UI updates may replace the current screen source. When the user provides a Figma frame position link, frame SVG export, and Figma Dev Mode code for the same screen, treat that three-part set as the canonical reference.

## Firebase Firestore Data Model

모든 저장 작업은 사용자 UID(`ownerId`)를 기반으로 권한 검증 및 캡슐화됩니다.

### 1. `characters` 컬렉션
**캐릭터 생성 결과 저장**

```typescript
{
  id: string;               // Firestore auto-generated ID
  ownerId: string;          // User UID
  name: string;             // 사용자 지정 캐릭터 이름
  token: string;            // 생성된 캐릭터 고유 토큰 (OpenAI 응답 추적용)
  styleMode: "2D" | "3D";   // 생성 스타일
  isDefault?: boolean;      // 기본 캐릭터 플래그 (공개 공유용)
  imageUrl: string;         // 생성된 캐릭터 이미지 URL (GCS 또는 data URL)
  metadata?: {
    generatedAt: Timestamp;
    prompt: string;         // 생성에 사용된 프롬프트
  };
}
```

### 2. `captures` 컬렉션
**표정/제스처/음성/감정 분석 데이터 저장**

```typescript
{
  id: string;               // Firestore auto-generated ID
  ownerId: string;          // User UID
  characterId?: string;     // 관련 캐릭터 참조 (선택사항)
  behavior: {
    expression: string;     // 인식된 표정 (emotion2vec+ 9개 라벨 중 선택)
    gesture: string;        // 인식된 제스처/자세
    emotionKey: string;     // 감정 분류 (happy, sad, angry, etc.)
    poseData?: object;      // MediaPipe 포즈 랜드마크 (마지막 프레임)
  };
  voice: {
    waveformData?: number[]; // FFT 주파수 bin 또는 time-domain RMS/peak
    speechText: string;      // 음성 인식 텍스트
    voiceIntensity: number;  // 음량 크기 (0~1)
  };
  backgroundEffect: {
    recommendedEmotion: string; // 분석 기반 권장 감정
    colorGuide?: string;     // 효과 색상 가이드 또는 preset
  };
  metadata?: {
    capturedAt: Timestamp;
    videoDuration?: number;  // 초 단위
  };
}
```

### 3. `projects` 컬렉션
**이모티콘 제작 프로젝트 (5개 프레임 + 편집 상태) 저장**

```typescript
{
  id: string;               // Firestore auto-generated ID
  ownerId: string;          // User UID
  name: string;             // 프로젝트 이름
  characterId: string;      // 사용된 캐릭터 참조
  captureId: string;        // 기반이 된 캡처 데이터 참조
  frames: [
    {
      frameIndex: 0;        // 0~4 (5개 고정)
      layers: [
        {
          type: "backgroundEffect" | "character" | "accentEffect" | "text";
          layerOrder: number;  // 각 타입별 순서
          assetUrl: string;   // 생성된 이미지/에셋 URL
          transform: {
            x: number;
            y: number;
            scale: number;
            rotation: number;
          };
          // text layer 전용
          content?: string;
          style?: object;     // 폰트, 색상, 크기 등
        }
      ];
      delay?: number;        // 프레임 지속 시간 (ms, GIF export용)
    }
  ];
  generatedPrompt: string;  // 이모티콘 생성 시 사용된 프롬프트
  isPublished?: boolean;    // 공개 여부
  metadata?: {
    createdAt: Timestamp;
    updatedAt: Timestamp;
  };
}
```

### 4. `stickers` 컬렉션
**최종 생성된 이모티콘 GIF 메타데이터 및 관리**

```typescript
{
  id: string;               // Firestore auto-generated ID
  ownerId: string;          // User UID
  name: string;             // 스티커/이모티콘 이름
  projectId: string;        // 생성 기반이 된 프로젝트 참조
  gifStoragePath: string;   // GCS Storage 경로 (emoticons/{ownerId}/{fileName}.gif)
  thumbnail?: string;       // 썸네일 이미지 URL (첫 프레임 또는 data URL)
  metadata: {
    totalFrames: number;    // 5 (고정)
    averageDelay: number;   // 평균 프레임 지속 시간
    width: 360;
    height: 360;
    format: "GIF";
  };
  category?: {
    group: string;          // 사용자 지정 그룹 또는 preset
    emotion: string;        // happy, sad, angry, etc.
  };
  isDefault?: boolean;      // 기본 스티커 플래그 (공개 공유용)
  isPublished?: boolean;    // 공개 여부
  createdAt: Timestamp;
}
```

### 데이터 흐름 및 저장 시점

1. **Input 페이지**: 사용자 입력 → `captures` 생성 (표정/음성/제스처 데이터)
2. **Character 페이지**: OpenAI 생성 → `characters` 저장 (캐릭터 토큰 + 이미지)
3. **Edit 페이지**: 프레임별 편집 상태 → `projects` 저장 (5개 프레임의 레이어 + transform)
4. **Export**: GIF 렌더링 → GCS Storage에 업로드 → `stickers` 메타데이터 저장
5. **Library**: 모든 `stickers` 및 `characters` 조회 (emotion, group 필터링)

### 권한 및 보안
- 모든 write 작업은 `ownerId == request.auth.uid` 검증
- `isPublished == true` 또는 `isDefault == true`인 항목만 타 사용자가 읽을 수 있음
- Storage: `emoticons/{ownerId}/{fileName}` 경로로 캡슐화, 파일 크기 < 10MB, 이미지만 허용
