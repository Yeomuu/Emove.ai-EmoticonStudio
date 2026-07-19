# EMOVE interaction audit — 2026-07-17

## Source priority

1. Latest user feedback and browser annotations
2. Figma `디자인시안` canonical frames
3. Durable decisions in `AGENTS.md`
4. Reference-site motion language, independently implemented

The Figma Home frame still shows an older left-side navigation. The later product decision specifies one responsive bottom-right dock with a clickable Home logo and Showcase icon, so the dock is intentionally retained.

## Functional checks

- Character generation: a synchronous ref lock prevents same-frame double submission. The UI stays disabled through OpenAI generation, chroma-key removal, GCS/local persistence, and browser image decoding.
- Emoticon frame generation: one lock covers all five sequential paid image requests. Navigation stays disabled until all five returned images decode.
- Core-effect generation: Save/Export and effect generation are mutually exclusive; the generated effect must decode before the effect button unlocks.
- Save/Export: one ref lock prevents duplicate APNG render, upload, Firestore upsert, and QR publication work.
- Home: pointer repulsion and drag use alpha hit maps, so transparent PNG pixels do not react. Character-to-character collision now samples both alpha maps inside their overlap area before applying an impulse.
- Route motion: App Router-compatible client routes remain addressable and preserve browser history. The full-screen curtain waits for the target client bundle and its minimum reveal interval; in-page depth changes keep the vertical slide motion without the global curtain.
- Showcase: animated items remain limited to 12, rotate through a shuffled circular deck every 20 seconds, and split between behind-text and front layers.

## Motion and containment

- Buttons use short translate/press spring feedback and keep sheen inside `overflow: clip`.
- Generic panels keep a static optical rim; they no longer run a sweeping shimmer.
- Library hover controls are clipped to the preview and cannot escape inactive cards.
- Input camera, guidance, and action controls use an owned grid stack rather than cross-panel absolute positioning.
- `prefers-reduced-motion`, `prefers-reduced-transparency`, coarse pointers, and no-`backdrop-filter` browsers retain usable fallbacks.

## Showcase implementation change

`src/components/LiquidRippleCanvas.tsx` replaces the old one-frame radial sine distortion with a ping-pong height/velocity field:

- Pointer movement injects a bounded impulse.
- Four-neighbor propagation creates lingering waves rather than a cursor-attached ring.
- The display pass derives refraction from the simulated surface gradient.
- Simulation resolution is capped and reduced on narrow screens; the visible canvas still renders at the device-aware output resolution.
- The component owns and disposes its render targets, materials, geometry, listeners, and renderer.

Rollback is isolated: restore the former `LiquidBackdrop` implementation in `src/screens/Showcase.tsx` and remove `src/components/LiquidRippleCanvas.tsx`. No persisted data format depends on the shader change.

## Emotion-analysis implementation change

`/api/emotion/audio` is an optional server-only Imentiv adapter. Browser WebM is converted to mono WAV, then the result is polled without exposing `IMENTIV_API_KEY`.

The current product decision is a sequential fallback:

1. voice (`Imentiv` when configured, otherwise a clearly labelled local heuristic)
2. action (`MediaPipe Pose`)
3. facial expression (`MediaPipe Face`)

Every capture stores the selected source, provider, confidence, normalized score map, and any fallback warning. A future adaptive fusion model can replace the selector without changing the stored media or page route contract.
