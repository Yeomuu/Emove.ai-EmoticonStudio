# EMOVE Studio

EMOVE is a Next.js-based emoticon creation prototype. It lets users create a character, capture motion/voice intent, compose five transparent frames, edit layered elements on a canvas, and save or share an APNG-first result through a QR download URL.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS v4 foundation with shadcn/ui-style local components
- Custom CSS design system for the current dark liquid-glass visual language
- Vercel Route Handlers for OpenAI, GCS asset, download, and library metadata APIs
- Google Cloud Storage for generated character, frame, effect, thumbnail, and animation files
- Cloud Firestore through the Firebase Admin SDK for shared metadata and stable GCS URLs
- IndexedDB local fallback when remote storage is not configured
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
GCS_BUCKET_NAME=emove-aiemoticonstudio.firebasestorage.app
GOOGLE_CLOUD_PROJECT=emove-aiemoticonstudio
GOOGLE_CLOUD_CLIENT_EMAIL=
GOOGLE_CLOUD_PRIVATE_KEY=
FIREBASE_PROJECT_ID=emove-aiemoticonstudio
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

`OPENAI_API_KEY` is server-only. Do not create a browser-exposed OpenAI key.

`IMENTIV_API_KEY` is also server-only. EMOVE converts the browser's short WebM capture to mono WAV, submits it through `/api/emotion/audio`, and stores the selected emotion together with its source, provider, and confidence. Without the key, the UI clearly reports the local voice heuristic and then falls back in the requested order: voice, action, expression.

Google Cloud and Firebase credentials are server-only. The client uploads generated assets through `/api/assets`; it never receives the service-account private key. Firestore and GCS can share one service account, so the Firebase values fall back to `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_CLIENT_EMAIL`, and `GOOGLE_CLOUD_PRIVATE_KEY`. If the credentials are missing, metadata remains in IndexedDB only and the UI reports that remote storage is unavailable.

## Storage Model

- Generated assets are uploaded through `/api/assets`; exported APNG/GIF/WebP animations use `/api/share/animation`.
- Google Cloud Storage holds binary files. Firestore stores their stable same-origin image URLs and compact metadata only.
- Private buckets are displayed through `/api/assets/file`; a public CDN can replace this path later with `GCS_PUBLIC_BASE_URL`.
- QR codes target `/api/assets/download`, which returns the animation with `Content-Disposition: attachment`.
- Shared library metadata is posted to and read from `/api/library/:kind`.
- Production metadata storage uses Cloud Firestore through server-only Firebase Admin credentials.
- Local-first work continues through IndexedDB when remote storage is unavailable.

Configure the GCS bucket before production:

- Grant the service account `roles/storage.objectAdmin` on the bucket.
- Keep the bucket private when using the default `/api/assets/file` and `/api/assets/download` handlers.
- If a public CDN is introduced, set `GCS_PUBLIC_BASE_URL` to the CDN origin and apply [`docs/gcs-cors.json`](docs/gcs-cors.json) so Canvas export can read CDN images without tainting the canvas.
- Enable Firestore in Native mode, grant the service account Firestore and Storage access, and add the GCS/Google Cloud or matching Firebase credentials to Vercel Production, Preview, and Development as needed.

Redeploy after adding or changing storage environment variables so the route handlers receive them.
The first successful save creates documents under `emove_library/{kind}/records`.

## Deployment

Deploy the project as a Vercel Next.js app.

Required production environment variables:

- `OPENAI_API_KEY`
- `IMENTIV_API_KEY` if Imentiv voice-emotion analysis is enabled
- `GCS_BUCKET_NAME`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_CLIENT_EMAIL`
- `GOOGLE_CLOUD_PRIVATE_KEY`
- `FIREBASE_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`)
- `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` only when they differ from the Google Cloud service account values

Optional public variables:

- `NEXT_PUBLIC_OPENAI_API_BASE`
- `NEXT_PUBLIC_SHARE_API_BASE`
- `NEXT_PUBLIC_LIBRARY_API_BASE`
- `NEXT_PUBLIC_SITE_URL` for a custom canonical domain outside Vercel's automatic production URL
- `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH`
- `NEXT_PUBLIC_POSE_MODEL_PATH`
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
