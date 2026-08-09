# Emotion background effect assets

This directory is reserved for the nine fixed emotion background effects.
The current application still renders every background effect procedurally in
`src/services/renderer.ts`; files placed here are not loaded yet.

Use these exact base names when the renderer is migrated to image assets:

| Emotion | Primary file | Optional SVG alternative |
| --- | --- | --- |
| Happiness | `happiness.png` | `happiness.svg` |
| Joy | `joy.png` | `joy.svg` |
| Admiration | `admiration.png` | `admiration.svg` |
| Neutral | `neutral.png` | `neutral.svg` |
| Surprise | `surprise.png` | `surprise.svg` |
| Tension | `tension.png` | `tension.svg` |
| Sadness | `sadness.png` | `sadness.svg` |
| Anger | `anger.png` | `anger.svg` |
| Anxiety | `anxiety.png` | `anxiety.svg` |

Asset requirements:

- transparent background
- 1024 x 1024 artboard
- artwork contained inside the artboard
- one file per normalized emotion key
- PNG is the primary planned format; use SVG only when editable vector colors
  are required

Do not add both PNG and SVG for the same emotion unless the future asset loader
defines an explicit format priority.
