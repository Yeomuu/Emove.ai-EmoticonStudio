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
- Firebase sync uses optional `VITE_FIREBASE_CONFIG` plus anonymous auth. Firestore stores `characters`, `captures`, `projects`, and `stickers`; Storage stores generated GIFs under `emoticons/{ownerId}/{projectId}.gif`.
- Input analysis must visibly show the understood behavior, expression/emotion key, voice usage, and emotion background-effect guide instead of only showing a completion toast.
- Library category UI must keep display category state separate from emotion filtering so same-emotion categories such as celebration and gratitude do not appear selected at the same time.
- Manual emotion changes after analysis affect only background/core effects, not captured expression, action, voice, or speech-bubble text facts.
- Character tokens must store an explicit 2D/3D `styleMode`; later character frames must keep that mode instead of blending styles.
- Input-to-edit generation automatically creates only the five character frames. Generated core-effect image layers are on-demand from the Edit screen to avoid adding image-generation cost by default.
- Edit must include a live loop preview that renders the same five frame states at the selected frame delay before exporting.
