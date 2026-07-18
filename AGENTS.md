# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable EMOVE decisions

- The latest user-provided screen reference set is the visual source of truth.
- Use clean History API paths such as `/home`, `/character`, `/input`, `/edit`, and `/library`.
- Keep route boundaries for Home, Character, Input, Edit, and Library so browser back/forward preserves the intended workflow model; make route changes feel like vertical one-page slide transitions instead of converting the app to a single scroll-only page.
- Next.js App Router is the primary application framework while keeping TypeScript central and attaching React client components, Canvas/Web Workers, Tailwind/shadcn-style components, and custom CSS only where needed.
- Vercel is the active deployment target for the Next.js-centered architecture.
- The production Vercel domain is `emove-emoticonstudio.vercel.app`.
- Light mode should invert the dark visual hierarchy: dark-mode dark surfaces become light glass surfaces, and dark-mode bright text/icons become dark text/icons except for intentional accent buttons.
- Loading indicators must distinguish measured progress from simulated/estimated progress; long AI generation should show truthful job stages rather than pretending exact progress.
- Page transitions should prefer a full-screen loading surface that rises from the bottom, briefly centers the EMOVE logo at about 120×120, then exits upward after the route is ready.
- Loading spinner/curtain backgrounds should stay solid unless a later visual reference explicitly asks for decorated loader backgrounds.
- In-page depth changes inside dense flows such as behavior input should not show the global loading curtain; reserve the global curtain for route/page transitions and long generation work.
- Generation and analysis progress bars should advance on real app work stages; when a single stage takes a long time and exact model progress is unavailable, keep the percent anchored to that stage while the bar surface continues flowing.
- Keep desktop content at a maximum width of 1440px and make every screen responsive.
- The current canonical Figma `디자인시안` layout uses 1920×1080 page frames; keep page content at a maximum width of 1920px for that redesign while preserving responsive behavior below desktop.
- Use 760px as the global minimum screen height; if the viewport is shorter, the page must scroll instead of clipping.
- The Edit timeline has exactly four ordered layers: background effects, character, accent effects, and text.
- OpenAI-dependent features must not fabricate mock user assets; if the API key or server proxy is unavailable, show a clear failure instead of substituting default characters, voice text, poses, or frames.
- OpenAI generation requires a server proxy. Next.js Route Handlers serve `/api/openai/*`; static-only hosting is not an active deployment target for this project.
- The production deployment target is Vercel from GitHub `main`.
- Keep `README.md` written for outside readers. Move implementation logs, QA notes, validation notes, and prompt-rule drafts into Notion when they are not required for the app to run.
- For `gpt-image-2`, generate character/effect assets on flat chroma-key green and remove the green background in-browser so stored/displayed assets become transparent PNG data URLs.
- Copy every used font, icon, and image into this project. Use coolicons only; never mix icon libraries.
- Work on v1 only; there is no active v2 implementation.
- The six supplied screen references for Home, Character, Input, Edit, Library, and Library Detail are the page-level layout references.
- The 2026-06-30 `참고` reference PNG set confirms the same screen family: Home, Character, Input, Edit, Library, and Library Detail should keep the dark 1440px liquid-glass layout language from those references.
- All primary page regions, including the Edit toolbar, editor grid, properties, and timeline, share one 1440px desktop frame and common left/right edges.
- Use a restrained dark liquid-glass treatment: near-black translucent surfaces, thin lavender borders, and small highlight/refraction cues. Avoid opaque blue panel fills.
- Treat liquid glass as the first visual priority: black glass depth, thin lavender rim light, top glint, subtle internal refraction, and press/hover micro-interactions should be consistent across nav, panels, cards, buttons, and editor controls.
- Liquid glass should read like softened optical glass: a bright but slightly blurred rim with uneven highlights, visible background detail behind it, subtle refraction cues, and no hard opaque outline.
- Liquid glass panels should keep the front fill nearly transparent, around a 1% visible white base when possible; color mood should come from blurred backing shapes or background detail rather than an opaque white overlay.
- Keep the moving glass sheen/sparkle hover effect on buttons only; panels, cards, and generic div regions may change border/depth but must not run shimmer sweeps on hover.
- `/home` is not one of the primary nav destinations, so the nav should not show an active moving glass pill on Home.
- In Library, the decorated first card in the source represents hover/focus state; all cards use the same default style.
- Use short spring-like micro-interactions only where they communicate selection, press, reveal, drag, or navigation. Respect reduced-motion and avoid continuously animating blur or filters.
- Character playground physics should keep non-character UI controls out of pointer repulsion, while draggable characters may push nearby characters away for collision feedback.
- Character creation starts empty: do not show an existing character until the user generates a new draft, then save the resulting token explicitly.
- Character generation and emoticon generation are separate workflows. Character creation ends in Character/Library unless the user explicitly chooses "이 캐릭터로 이모티콘 생성하기", which saves/selects that character and then routes to Input.
- Keep the bundled default character set available for users who want to skip character creation, but never use those defaults as fallback output when the user explicitly runs new character generation.
- The current Character creation layout source is the Figma wireframe set for Step1 `166-810`, Step2 `106-537`, Step3 `107-555`, generation loading `47-801`, and result `113-834`; match the 1920x1080 wireframe coordinates before decorative polish.
- The 2026-07-13 canonical Figma `디자인 시안` pass supersedes older page-layout frames. Its implementation nodes are Home `124-1275`, Character steps `124-586`, `124-1013`, `124-1074`, Character loading/result `189-766`, `281-796`, Input capture/loading/results `271-627`, `165-2444`, `264-476`, `265-707`, Emoticon loading `303-1248`, Edit states `175-896`, `281-1235`, `282-660`, `283-989`, Edit save loading `303-1241`, and Library `285-1866`.
- Character creation Step1 uses fixed-layout dropdown controls for character type and detailed character selection; opening the dropdown must not shift the surrounding card layout.
- Character creation Step3 uses Unsplash-style reference mood imagery that reflects the selected character features, plus an optional freeform prompt before generation.
- Character color palette is a dropdown preset; point color remains swatches plus one custom color picker swatch that shows the selected custom color.
- Library separates emoticon and character views, and item cards flow horizontally first with a 3-column desktop grid rather than masonry columns.
- Library category filters are horizontally scrollable/draggable and should show an edge fade when overflow is possible.
- Edit canvas must clearly show the square 1024×1024 export boundary while keeping the surrounding stage usable as the workspace.
- Edit stores layer x/y/scale/rotation per each of the fixed five frames; animated export renders those five frame states with a user-adjustable per-frame delay.
- Voice waveform uses FFT frequency bins during recording and a quiet dot baseline before voice input.
- Keep the top shell/header persistent across route changes so the nav selection can spring between pages without remounting.
- Home/landing should use randomly placed character tokens as the primary interactive background instead of the previous static ecosystem image.
- Home/landing should also keep the Figma geometric circle/line pattern behind the random character tokens.
- Home character tokens should repel from the pointer, remain draggable, and push nearby character tokens away when they collide during drag.
- Home character pointer interactions use the visible `.home-character-token` card bounds, including the glass card outline, for drag, pointer repulsion, and character-to-character collision.
- Header layout keeps the logo centered, primary nav pinned to the left side of the 1440px frame, and profile/theme controls pinned to the right side.
- The current Figma redesign uses a bottom-right dock navigation. Home and Library show it by default; Character, Input, and Edit hide it during work and reveal it when the pointer enters the bottom-right dock zone.
- Glassmorphism buttons should use `backdrop-filter` so the background behind the button blurs while button text/icons remain sharp.
- Do not show pointer-style glow outlines on text inputs after mouse click; keep only a restrained accessible keyboard focus state.
- Character and emoticon generation prompts must request flat chroma-key green backgrounds only, not transparent backgrounds; transparency is produced by the in-browser chroma-key removal step.
- Generated character variations must be selectable, and selecting a variation must update the main preview/canvas to that exact result.
- After saving a generated character or emoticon, route the user to Library; Library must support All, Emoticon, and Character views.
- Library category/group filters must be distinct. Celebration and gratitude cannot activate together just because both map to happy emotion.
- Library search belongs above the group/filter list rather than pinned at the bottom of the sidebar.
- Library group naming uses "이모티콘 그룹"; user-created groups must allow a custom group name and configurable filter conditions.
- Library keeps the left group/search sidebar even when matching the latest Figma horizontal carousel layout.
- Library's horizontal item rail must support pointer-hover wheel scrolling, drag-to-scroll, and seamless wraparound so the end of the list naturally continues into the beginning.
- Library hover effects must end when the pointer leaves a card, even after clicking internal card action buttons.
- Transparent preview grids must be smaller and lighter; grid/pattern backgrounds should appear only on intended preview surfaces, especially Library detail's `detail-stage`.
- Edit text layer selection bounds must match the rendered text bubble exactly, including resize behavior.
- Edit canvas selection boxes must be driven only by measured renderer bounds and layer transforms; do not apply legacy CSS offsets such as margins to `.canvas-selection` variants.
- When editing a frame, later frames should inherit the same layer transform unless the user explicitly changes them, so animation remains continuous.
- Edit preview and APNG export must share the same 1024×1024 full-color transparent frame constraints so the looped animation does not visually diverge from the frame editor.
- Edit save overwrites the active source project/sticker in place when editing from Library; it must preserve the original id, createdAt, favorite/group metadata, and Library ordering instead of creating a duplicate.
- Edit lets users rename the saved emoticon explicitly; the sticker title must not be overwritten by speech-bubble text unless no custom title exists.
- Edit canvas resize/rotate control handles belong only to the current active layer; inactive selection bounds must not show handles or steal resize/rotate interactions.
- Edit canvas may temporarily preview the currently selected layer above the other layers for easier adjustment, but this must never mutate the actual layer order or exported order. Clicking empty canvas space clears the active layer selection.
- Source code, styles, fonts, icons, and used UI images should be referenced from `src/` and `src/assets/` in v1; old root-level source/asset folders are legacy copies only until explicitly removed.
- Remote persistence uses Vercel Route Handlers. Google Cloud Storage is the primary binary store for generated characters, frames, effects, thumbnails, and APNG-first animation files; Neon Postgres via `DATABASE_URL` stores stable GCS URLs and compact metadata for `characters`, `captures`, `projects`, and `stickers`; IndexedDB remains the local fallback when remote storage is unavailable.
- Input analysis must visibly show the understood behavior, expression/emotion key, voice usage, and emotion background-effect guide instead of only showing a completion toast.
- Input camera analysis uses MediaPipe Pose Landmarker and Face Landmarker for the closest single person; if real landmarks are unavailable, the app must say the analysis failed instead of substituting preset behavior or expression data.
- Library category UI must keep display category state separate from emotion filtering so same-emotion categories such as celebration and gratitude do not appear selected at the same time.
- Manual emotion changes after analysis affect only background/core effects, not captured expression, action, voice, or speech-bubble text facts.
- Character tokens must store an explicit 2D/3D `styleMode`; later character frames must keep that mode instead of blending styles.
- Input-to-edit generation automatically creates only the five character frames. Generated core-effect image layers are on-demand from the Edit screen to avoid adding image-generation cost by default.
- Edit must include a live loop preview that renders the same five frame states at the selected frame delay before exporting.
- Future UI updates may replace the current screen source. When the user provides a new canonical screen reference set, implement the app to match that supplied screen screenshot pixel-for-pixel.
- The current final emoticon output target is a simple 1024×1024 looping emoticon generated from `gpt-image-2`-sized assets, not a Kakao 360×360 submission package.
- Prefer APNG for final animated emoticon export and QR/mobile downloads where possible because it preserves full-color transparent frames; keep GIF as a compatibility fallback and consider Animated WebP later when file size becomes the stronger constraint.
- Do not keep or reintroduce GitHub Pages deployment workflows unless the user explicitly changes deployment strategy.
- OpenAI image proxy responses must contain at most one generated image. Character variations and the five emoticon frames are requested step by step from the client so paid OpenAI results are not lost to serverless timeout or response-size limits.
- Use compressed `webp` image API responses by default before browser chroma-key removal; if this changes, the returned data URL MIME type must match the requested image output format.
- On Vercel production, long image routes such as `character`, `frame`, `frames`, and `effect` should move to durable background jobs with GCS-backed or DB-backed status/result polling before paid production traffic. Do not make long browser-facing functions risk losing paid OpenAI results to timeout.
- Treat the Notion Design System page as fixed unless the user explicitly asks to change it; PRD, technical specification, and page/function documentation may be updated around that fixed design system.
- When transplanting Notion page-function inventories into a technical test app, focus on the actual page functions, states, controls, and route behavior rather than recreating sidebar/navigation layout details.
- Use the Next.js lab to stress-test accumulated EMOVE features with realistic mock state before wiring paid API calls, remote persistence, or production background jobs.
- Home footer copy is `© 2026. EMOVE. All rights reserved.` and should sit faintly at the centered bottom of the viewport with about 0.5 opacity.
- `/showcase` is the animated-emoticon-only archive. It reads generated APNG/GIF/Animated WebP assets from local projects and remote shared sticker metadata, never substitutes static/default assets, shows at most 12 at once, and advances through a shuffled circular deck every 20 seconds so larger libraries are not skipped.
- Showcase emoticons should drift and bob like objects floating on water rather than falling; motion must use transform/opacity, pause under reduced-motion preferences, and remain clickable through to Library detail.
- For the current Figma redesign pass, layout fidelity takes priority over decorative style refinement; match each 1920×1080 frame's placement and sizing before polishing visual treatment.
- Primary app screens should occupy a fixed `100svw` × `100svh` stage with a `1920px` maximum width and hidden viewport overflow so the app behaves as a one-screen flow.
- The Home geometric circle/line background must follow the current Figma Home frame rather than the earlier decorative pattern.
- Library browsing keeps the active card pinned to the left-side hero slot; horizontal scrolling changes which item occupies that slot, and only that active card exposes edit, favorite, and delete controls.
- Loading surfaces, including boot loading, route curtain loading, and generation/analysis progress screens, must follow the active light/dark theme.
- Light mode shadows should be softer than dark mode shadows so glass surfaces stay clean rather than smudged.
- Horizontal filter rails should show edge fades only on the sides where additional hidden items are available.
- Edit save should keep Neon records easy to inspect by upserting the project plus separate sticker, character, and capture metadata rows.
- Export QR should prefer the hosted animation URL when available and fall back to the saved Library detail URL when direct animation sharing is unavailable.
- The overall layout reference websites are:
  - https://startrail.stellive.me/ (stellar dynamic components and animations)
  - https://sustainability.kakao.com/ko (modern grids and liquid-glass container hierarchies)
  - https://myz-studio.com/ (clean minimalist dark layout and hover states)
  - https://towards.co.kr/ (loading sequence, typewriter vertical panels, and real-time ASCII rotating globes)
- Showcase uses an independently implemented full-viewport pointer-reactive liquid canvas inspired by the supplied Haoqi reference. Keep empty-state copy as part of the background composition rather than a centered card, split animated emoticons between behind-text and in-front layers, and let the pointer ripple produce subtle RGB dispersion, fine water noise, and localized backdrop refraction over text and emoticons.
- Keep all Showcase visual content below one full-screen, pointer-transparent adjustment layer so the water response refracts the background word, copy, and emoticons together. Use one fixed base color per light/dark theme, render the background `EMOVE` word as liquid glass, omit `CREATE EMOTICON` in the empty state, and guarantee a behind/front emoticon split whenever at least two animated items exist.
- Showcase water should resemble a fast, fine `CC Drizzle`-style moving caustic surface rather than a large accumulated radial blob. Render the transparent WebGL caustic canvas inside the adjustment layer above Showcase content, keep DOM displacement subtle enough to avoid duplicated text outlines, and use darker blue-gray refraction in light mode so the motion remains visible.
- Keep the Showcase light-mode ambient caustic restrained; pointer movement should temporarily restore the stronger RGB prism/ring dispersion without raising the whole page's water intensity.
- Form and media-panel internals must use containment-safe flex/grid layout. Do not position controls across unrelated parent panels or allow labels, previews, buttons, or upload controls to overflow their owning region.
- Keep glass treatment selective: use it for navigation, modal, focused controls, and intentional overlay surfaces rather than applying it uniformly to every wireframe cell.
- The bottom dock must always provide a clickable EMOVE logo for Home and an icon-only Showcase entry; Home uses the same responsive bottom-right dock as the other routes.
- After a completed Input microphone/camera capture becomes idle for about 10 seconds, Showcase may open automatically. Clicking the Showcase background returns to the immediately previous route.
- Character reference input prioritizes cartoon or 3D-rendered imagery and accepts one user-uploaded reference image that is included in the character generation token.
- Emotion selection follows the explicit product priority voice → action → facial expression. Imentiv audio analysis is server-only through `/api/emotion/audio`; store the chosen source, provider, confidence, and full normalized score map, and label local heuristic fallbacks honestly.
- Browser microphone capture may remain WebM for OpenAI transcription, but convert the short clip to mono WAV before Imentiv because its direct file upload accepts MP3, WAV, AAC, and M4A rather than WebM.

## Vercel Storage Data Model

원격 저장은 선택 기능입니다. `DATABASE_URL`이 없으면 IndexedDB 로컬 저장만 사용하고, `GCS_BUCKET_NAME` 또는 Google Cloud 인증정보가 없으면 로컬 개발용 메모리 애니메이션 공유 URL과 로컬 이미지 데이터만 사용하면서 설정 오류를 명확히 알립니다.

### 1. `emove_library_records`
**Neon Postgres shared metadata table**

```typescript
{
  id: string;          // character/capture/project/sticker id
  kind: "characters" | "captures" | "projects" | "stickers";
  payload: object;     // compact metadata payload, no raw Blob fields
  created_at: string;
  updated_at: string;
}
```

### 2. Google Cloud Storage Objects
**QR/mobile share file storage**

```typescript
{
  path: `gcs://${bucket}/assets/animations/${year}/${month}/${shareId}.apng`;
  url: string;         // stable public GCS or configured CDN URL
  downloadUrl: string; // /api/assets/download attachment response used by QR
  contentType: "image/apng" | "image/gif" | "image/webp";
  maxSizeBytes: 5750000;
}
```

### 데이터 흐름 및 저장 시점

1. **Input 페이지**: 사용자 입력 → local `captures` 저장, `DATABASE_URL`이 있으면 `/api/library/captures`에도 compact metadata 저장
2. **Character 페이지**: OpenAI 생성 → local `characters` 저장, `DATABASE_URL`이 있으면 `/api/library/characters`에도 저장
3. **Edit 페이지**: 프레임별 편집 상태 → local `projects`, `stickers`, `characters` 저장, `DATABASE_URL`이 있으면 `/api/library/projects`에도 compact metadata 저장
4. **Export**: APNG 우선 애니메이션 렌더링 → `/api/share/animation` 업로드 → GCS public URL은 화면 표시/DB에 사용하고 `/api/assets/download` attachment URL은 QR에 사용
5. **Library**: 현재 구현은 IndexedDB/local state를 우선 표시하며, shared public gallery reads can be added from Neon when the public gallery policy is finalized

### 권한 및 보안
- `OPENAI_API_KEY`, `DATABASE_URL`, `GCS_BUCKET_NAME`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_CLIENT_EMAIL`, `GOOGLE_CLOUD_PRIVATE_KEY`는 서버 환경변수로만 보관합니다.
- 브라우저 공개 환경변수는 `NEXT_PUBLIC_` prefix만 사용합니다.
- 원격 shared library를 production에 열기 전에는 visibility, moderation, rate limiting, and ownership 정책을 먼저 확정합니다.
