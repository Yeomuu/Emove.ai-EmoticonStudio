# EMOVE Studio

EMOVE is a Next.js-based emoticon creation prototype. It lets users create a character, capture motion/voice intent, compose five transparent frames, edit layered elements on a canvas, and save or share an APNG-first result through a QR download URL.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS v4 foundation with shadcn/ui-style local components
- Custom CSS design system for the current dark liquid-glass visual language
- Vercel Route Handlers for OpenAI, Firebase asset, download, and library metadata APIs
- Firebase Storage for generated character, frame, thumbnail, animation, and shared JSON metadata files
- MediaPipe Tasks Vision for camera pose and face analysis
- APNG-first browser export with GIF compatibility fallback

## Local Development

```bash
pnpm install
pnpm dev
```

The app runs on the Next.js dev server. Open `/home`, `/character`, `/input`, `/edit`, or `/library`.

## Environment

Copy `.env.example` to `.env.local` and fill only the values you need.

```bash
OPENAI_API_KEY=
IMENTIV_API_KEY=
FIREBASE_PROJECT_ID=emove-aiemoticonstudio
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=emove-aiemoticonstudio.firebasestorage.app
```

`OPENAI_API_KEY` is server-only. Do not create a browser-exposed OpenAI key.

`IMENTIV_API_KEY` is also server-only. EMOVE converts the browser's short WebM capture to mono WAV, submits it through `/api/emotion/audio`, and stores the selected emotion together with its source, provider, and confidence. Without the key, the UI clearly reports the local voice heuristic and then falls back in the requested order: voice, action, expression.

Firebase Admin credentials are server-only. The client uploads generated assets through same-origin Route Handlers and never receives the service-account private key. If Firebase Storage is unavailable, the generated result remains on the current screen and the user is asked to press Save again after fixing the configuration. EMOVE does not silently fall back to Firestore or IndexedDB.

## Storage Model

- Generated assets are uploaded through `/api/assets`; exported APNG/GIF/WebP animations use `/api/share/animation`.
- Firebase Storage holds binary files and compact JSON metadata under `metadata/library/`.
- Private Firebase Storage objects are displayed through `/api/assets/file`.
- QR codes target `/api/assets/download`, which returns the animation with `Content-Disposition: attachment`.
- Shared library metadata is posted to and read from `/api/library/:kind`.
- The public login-free Library reads the same Storage metadata namespace in every browser.
- There is no automatic save retry or local persistence fallback.

Configure Firebase before production:

- Enable Firebase Storage in the Firebase console.
- Create the server credential from Firebase Project Settings > Service accounts.
- Keep Firebase Storage private when using the default `/api/assets/file` and `/api/assets/download` handlers.
- Ensure that the service account can read and write Firebase Storage, then add the Firebase credentials to Vercel Production, Preview, and Development.

Redeploy after adding or changing storage environment variables so the route handlers receive them.
The first successful save creates JSON objects under `metadata/library/{kind}/` and binary assets under `assets/`.

## Deployment

Deploy the project as a Vercel Next.js app.

Required production environment variables:

- `OPENAI_API_KEY`
- `IMENTIV_API_KEY` if Imentiv voice-emotion analysis is enabled
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`

Optional public variables:

- `NEXT_PUBLIC_OPENAI_API_BASE`
- `NEXT_PUBLIC_SHARE_API_BASE`
- `NEXT_PUBLIC_LIBRARY_API_BASE`
- `NEXT_PUBLIC_SITE_URL` for a custom canonical domain outside Vercel's automatic production URL
- `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH`
- `NEXT_PUBLIC_POSE_MODEL_PATH`
- `NEXT_PUBLIC_GESTURE_MODEL_PATH`
- `NEXT_PUBLIC_FACE_MODEL_PATH`

## Project Layout

```text
src/app/          Next.js routes and API route handlers
src/components/   UI shell, editor stage, reusable components
src/screens/      EMOVE workflow screens rendered by the client app
src/services/     AI, media, persistence, rendering, export logic
src/styles/       Design tokens and current liquid-glass CSS
server/           Shared server-only API helpers
public/models/    MediaPipe model and WASM files
```
