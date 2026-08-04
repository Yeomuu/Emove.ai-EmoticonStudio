# EMOVE Design and Functional QA

- Date: 2026-08-01
- Canonical viewport: 1920 x 1080
- Responsive viewports: 1069 x 912 and 885 x 668
- Primary theme: dark
- Secondary theme: light
- Reference source: canonical Figma `디자인 시안` exports in `qa/figma`
- Combined comparison: `qa/comparison/figma-app-dark-contact-sheet.png`

## Visual verification

- Home, Character Step 1, Input capture, Edit, and Library were compared against their Figma exports in one side-by-side contact sheet.
- Character Step 2 and Step 3 were checked in dark and light modes, including palette, style, prompt, and reference-upload controls.
- Figma frames that depict open dropdowns or selected controls are implemented as interaction states; the initial screen keeps those controls closed.
- Dynamic Home character placement, live camera media, generated character art, and Edit content can differ from the static Figma sample while preserving its layout.
- At 885 x 668, the 760px minimum stage scrolls vertically instead of clipping content. Form controls remain inside their owning panels.
- Light mode uses light surfaces, dark text/icons, visible borders, and reduced shadow density. Boot and route-transition curtains follow the active theme.

## Functional verification

- Home character cards respond to pointer drag using their visible card bounds, while the Home navigation remains clickable.
- Character type dropdown opens without layout shift, exposes menu radio items, applies selection, and closes afterward.
- Character reference input distinguishes the actual uploaded image from the nested upload icon; the empty and uploaded states no longer collide.
- Input camera reaches a ready state with an enabled capture button and a live mounted preview. A real recording was not started during this pass to avoid collecting camera and microphone data.
- Library carousel arrows change the active item. Card/list tabs switch to a five-row list and back without leaving the hidden carousel interactive.
- Showcase renders one pointer-transparent adjustment layer and WebGL canvas, returns to the previous route, displays local data first, and merges Firebase data in the background.
- Public Firebase reads require no login. Production currently returns 2 stickers, 1 character, and 2 project records through the Vercel Route Handlers.
- Legacy `local-user` metadata is normalized to the public owner in the client; new writes use `ownerId: "public"` and are not filtered by browser identity.

## Automated verification

- `pnpm typecheck`: passed
- `pnpm test`: 37 tests passed
- `pnpm build`: passed with all App Router pages and Route Handlers generated

## Deferred external checks

- Paid OpenAI generation was intentionally not executed in this pass.
- Production Firestore was read-only during QA; no synthetic QA record was written or deleted.
- Public-service abuse controls remain deferred for the private prototype as requested.

final result: passed
