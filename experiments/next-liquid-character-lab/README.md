# Next Liquid Character Lab

Temporary feasibility prototype for EMOVE's possible Next.js direction.

## What This Tests

- Next.js App Router structure
- Liquid-glass landing surface
- Character repulsion from pointer position
- Drag-and-drop character placement
- Measured initial preload for local assets and fonts
- Estimated page-transition and render-progress loaders
- GSAP entrance animation
- A production path where AI generation is not required for every animation frame

## Local Commands

```bash
pnpm install
pnpm dev
pnpm build
```

## Deployment Notes

Vercel can deploy this experiment directly as a Next.js app. Connect the repository, set the project root to this folder if deploying the experiment only, and use the default Next.js build command.

Netlify can detect `next.config.mjs`. For a standalone deployment, use:

```toml
[build]
command = "pnpm build"
publish = ".next"
```

Client-visible environment variables should use `NEXT_PUBLIC_`. Server-only values stay in regular environment variables.

## Loading Accuracy

- Initial loader: measured from known local image assets plus `document.fonts.ready`.
- Route loader: estimated transition timing.
- Render loader: estimated prototype timing. Production should bind it to real capture, render, upload, and job-polling states.
