# EMOVE Studio

EMOVE is a Next.js-based emoticon creation prototype. It lets users create a character, capture motion/voice intent, compose five transparent GIF frames, edit layered elements on a canvas, and save or share the final output through a QR-ready GIF URL.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS v4 foundation with shadcn/ui-style local components
- Custom CSS design system for the current dark liquid-glass visual language
- Vercel Route Handlers for OpenAI, GIF sharing, and library metadata APIs
- Vercel Blob for exported GIF share files
- Neon Postgres through `DATABASE_URL` for optional shared metadata storage
- IndexedDB local fallback when remote storage is not configured
- MediaPipe Tasks Vision for camera pose and face analysis
- `gifenc` for browser-side transparent GIF export

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
BLOB_READ_WRITE_TOKEN=
DATABASE_URL=
```

`OPENAI_API_KEY` is server-only. Do not create a browser-exposed OpenAI key.

If `BLOB_READ_WRITE_TOKEN` is missing, local GIF sharing falls back to an in-memory development URL. If `DATABASE_URL` is missing, character/project/sticker metadata remains in IndexedDB only.

## Storage Model

- Exported GIF files are uploaded through `/api/share/gif`.
- Production file storage should use Vercel Blob.
- Shared library metadata is posted to `/api/library/:kind`.
- Production metadata storage should use Neon Postgres from Vercel Marketplace.
- Local-first work continues through IndexedDB when remote storage is unavailable.

## Deployment

Deploy the project as a Vercel Next.js app.

Required production environment variables:

- `OPENAI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `DATABASE_URL` if shared cross-browser metadata is needed

Optional public variables:

- `NEXT_PUBLIC_OPENAI_API_BASE`
- `NEXT_PUBLIC_SHARE_API_BASE`
- `NEXT_PUBLIC_LIBRARY_API_BASE`
- `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH`
- `NEXT_PUBLIC_POSE_MODEL_PATH`
- `NEXT_PUBLIC_FACE_MODEL_PATH`

## Project Layout

```text
src/app/          Next.js routes and API route handlers
src/components/   UI shell, editor stage, reusable components
src/pages/        EMOVE workflow screens rendered by the client app
src/services/     AI, media, persistence, rendering, export logic
src/styles/       Design tokens and current liquid-glass CSS
server/           Shared server-only API helpers
public/models/    MediaPipe model and WASM files
```
