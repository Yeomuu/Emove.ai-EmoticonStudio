# EMOVE Prompting Rules

EMOVE uses prompt planning before `gpt-image-2` image generation. The text planning model is configured by `OPENAI_PROMPT_MODEL`, while image generation remains `gpt-image-2`.

## Prompt Contract

Every image prompt is structured as:

- Instruction: what to generate.
- Context: captured character, behavior, voice, style, palette, and effect facts.
- Constraints: what must stay fixed and what must not appear.
- Output: the exact asset type expected.

## Separation Rules

- Character generation creates only the reusable character token.
- Character frame generation creates only five action/expression frames.
- Core effect generation creates only the reusable background/effect layer, and it is on-demand from the Edit screen so automatic generation does not add image cost.
- Accent effects remain fixed local parts in the editor.
- Speech bubble text is rendered by Canvas and must not be generated into images.
- Chroma-key green `#00FF00` is used only as the background for image generation and is removed in browser.

## Character Example

```text
[Instruction]
Create one Soft 3D character on a flat solid chroma-key green background (#00FF00).
[Style contract] The character token is explicitly 3D. Keep the image 3D; do not blend 2D and 3D visual language.
[Context]
Character concept: 둥글고 말랑한 아기 펭귄, Soft Pastel palette.
Observable identity: 2.5등신, 둥근 몸통, 흰 얼굴과 배, 작은 검은 눈.
[Constraints]
Character only: no emotional background, no core effect, no accent particles, no motion trails, no sticker decorations, no speech bubble.
[Output]
A clean reusable character token image only.
```

## Frame Example

```text
[Instruction]
Frame 3/5 (peak action) of one continuous motion.
[Input facts]
Captured expression key: happy.
Captured gesture/action: 양팔을 펼친 행동; motion amplitude: 88/100.
Text bubble phrase is handled separately: "완전 좋아!".
[Effect separation]
Selected effect emotion: sad; background/effect layer is separate. Do not draw that effect in the character frame.
[Constraints]
Character only on #00FF00. No text, no speech bubble, no core effect, no accent effect, no scenery.
```

## Core Effect Example

```text
[Instruction]
Create only a 레인 드롭 core emotion effect asset.
[Context]
Selected effect emotion: sad; visual guide: blue raindrops, gentle downward motion.
[Constraints]
Flat solid chroma-key green background (#00FF00). No character, no face, no body, no text, no scenery.
[Output]
One reusable transparent-ready core effect layer.
```

## Why This Shape

This follows the prompting-guide pattern of making task instruction, context, constraints, and output format explicit. It also uses negative constraints because EMOVE assets are layered; if the character prompt includes effects or text, later editing and animation become harder to control.
