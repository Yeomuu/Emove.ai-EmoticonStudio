# EMOVE

EMOVE is a responsive web prototype for turning a user's voice, expression, and body gesture into a short looping emoticon. It combines camera and microphone input, AI-assisted character generation, frame editing, and a personal library into one browser-based studio.

The current prototype focuses on a simple 1024 x 1024 looping emoticon workflow rather than a platform-specific sticker submission package.

## What It Does

- Creates or selects a character that can become the base of an emoticon.
- Captures a short camera and voice input, then summarizes expression, gesture, speech text, volume, and effect emotion separately.
- Generates five character motion frames from the captured behavior.
- Lets the user edit four ordered layers: background effect, character, accent effect, and text.
- Previews the same five-frame loop before export.
- Saves characters, captures, projects, and final stickers through Firebase first, with IndexedDB as a local fallback.

## Product Flow

1. Character: create a new 2D or 3D character, or use one of the bundled starter characters.
2. Input: record a short multimodal input and review what the system understood.
3. Edit: adjust frames, layer transforms, speech bubble text, effects, and loop delay.
4. Library: browse saved characters and emoticons, with generated emoticons previewing as loops.

## Tech Stack

- Preact, TypeScript, Signals, Vite
- CSS custom properties and layered responsive styles
- MediaRecorder, Web Audio, getUserMedia
- MediaPipe Pose Landmarker and Face Landmarker in a Web Worker
- Canvas rendering, five-frame state storage, and GIF-style loop export
- Firebase Authentication, Firestore, and Storage
- OpenAI image and text calls through a server-side proxy only
- Netlify Functions for production OpenAI API routes
- GitHub Pages for static preview deployment

## AI Architecture

The OpenAI API key is never exposed to the browser. Browser code calls `/api/openai/*`, and the server proxy reads `OPENAI_API_KEY` from its own environment.

Supported proxy routes:

- `POST /api/openai/transcribe`
- `POST /api/openai/character`
- `POST /api/openai/frames`
- `POST /api/openai/effect`

Character and effect images are requested on a flat chroma-key green background. The browser removes that green background and stores the result as a transparent-ready PNG data URL. Speech bubble text is rendered locally in Canvas, not baked into generated images.

## Firebase Data

Firebase is optional for local exploration but required for real cross-device storage.

Collections used by the app:

- `characters`: generated or bundled character metadata
- `captures`: analyzed gesture, expression, voice, and effect facts
- `projects`: editable five-frame layer state
- `stickers`: exported emoticon metadata and Storage path

Storage path:

- `emoticons/{ownerId}/{fileName}`

Writes are scoped by anonymous Firebase Auth UID. If Firebase is missing or unavailable, the app keeps a local IndexedDB fallback so the editing flow can continue.

## Local Development

```bash
pnpm install
pnpm dev
```

Default local URL:

```text
http://127.0.0.1:5173/home
```

Useful checks:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:github
```

## Environment Variables

Create `.env.local` from `.env.example`.

Server-only variables:

```bash
OPENAI_API_KEY=
OPENAI_PROMPT_MODEL=
OPENAI_TRANSCRIBE_MODEL=
OPENAI_IMAGE_MODEL=
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_CONCURRENCY=2
```

Client-exposed variables:

```bash
VITE_FIREBASE_CONFIG=
VITE_OPENAI_API_BASE=
VITE_MEDIAPIPE_WASM_PATH=/models/wasm
VITE_POSE_MODEL_PATH=/models/pose_landmarker_lite.task
VITE_FACE_MODEL_PATH=
```

Do not create a `VITE_OPENAI_API_KEY`. Any `VITE_` variable is visible in the browser bundle.

## Deployment

Netlify can run the OpenAI proxy. `netlify.toml` rewrites `/api/openai/*` to `netlify/functions/openai.ts`, so set `OPENAI_API_KEY` in Netlify environment variables before using generation features there.

GitHub Pages is static hosting. It cannot execute `/api/openai/*` by itself. To use AI generation from the GitHub Pages build, deploy the Netlify proxy first and set this GitHub Actions variable:

```bash
VITE_OPENAI_API_BASE=https://your-netlify-site.netlify.app/api/openai
```

Without that variable, the app intentionally avoids calling `/api/openai/*` on `github.io` and shows a clear configuration error instead of producing repeated `405 Method Not Allowed` console errors.

For GitHub Pages, repository settings should use:

- Source: GitHub Actions
- Workflow: `.github/workflows/pages.yml`

## Repository Layout

```text
src/
  components/      Shared UI
  pages/           Character, Input, Edit, Library screens
  services/        AI, Firebase, storage, rendering, export logic
  workers/         MediaPipe analysis worker
  assets/          Fonts, icons, and images used by the app
server/            Vite dev/preview OpenAI proxy
netlify/functions/ Netlify OpenAI proxy entry point
public/models/     MediaPipe model files served statically
tests/             Unit and contract tests
```

Generated folders such as `dist`, `node_modules`, local caches, and private `.env.local` files are intentionally excluded from Git.

## Current Limitations

- AI generation needs a working server proxy and a valid OpenAI API key.
- Browser camera and microphone analysis depends on user permission and device support.
- GitHub Pages can host the static app, but OpenAI generation requires an external proxy URL.
- GIF-style export has palette and alpha limitations; the editor preview and export share the same renderer to keep the loop as consistent as possible.
