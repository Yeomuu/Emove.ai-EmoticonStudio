# EMOVE Visual QA

- Viewport: 1920 x 1080
- Browser: Chrome
- Primary theme: dark
- Secondary theme check: light
- Reference source: attached `design.pdf` and Home, Character, Input, Emoticon, and Collection SVG screens
- Comparison method: reference and implementation screenshots were placed side by side at the same viewport and state

## Verified screens

- Home: geometry, title, character field, actions, footer, and bottom dock
- Character: Step 1, Step 2, Step 3, loading, and result layouts
- Input: camera, process navigation, stage panel, guidance, progress, and persistent API failure state
- Edit: canvas, properties, timeline, layer controls, and light-mode form surfaces
- Library: sidebar, filters, infinite horizontal rail, active card actions, hover states, and light mode
- Showcase: dark/light water surface, pointer RGB prism response, liquid-glass EMOVE word, and dock clickability

## Functional checks

- Clean route navigation and browser history
- Pointer-safe bottom dock above interactive character/showcase layers
- Capture controls locked while camera/audio analysis is running
- MediaPipe person recognition and 5-second capture using the supplied test video
- Honest OpenAI quota failure state without mock output
- Public remote-library reads with same-origin protected writes
- APNG container generation and chroma-key transparency tests

final result: passed
