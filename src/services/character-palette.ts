export const characterPalettes = [
  { id: "soft-pastel", label: "Soft Pastel", colors: ["#BDB2FF", "#9FF3DC", "#FFC8D2", "#FFF0A8", "#B8D8FF"] },
  { id: "aurora-pop", label: "Aurora Pop", colors: ["#8CA5FF", "#BBB6FF", "#FFADE3", "#78D6C6", "#FFD36E"] },
  { id: "cosmic-calm", label: "Cosmic Calm", colors: ["#A7A3FF", "#6F83FF", "#B7BDC8", "#E4E0F0", "#78A8FF"] },
] as const;

export type CharacterPalette = (typeof characterPalettes)[number];
export type CharacterPaletteId = CharacterPalette["id"];

export function getCharacterPalette(id: CharacterPaletteId): CharacterPalette {
  return characterPalettes.find((palette) => palette.id === id) ?? characterPalettes[0];
}

export function defaultMainColorForPalette(id: CharacterPaletteId): string {
  return getCharacterPalette(id).colors[0];
}

export function paletteIncludesColor(palette: CharacterPalette, color: string): boolean {
  return palette.colors.some((candidate) => candidate.toUpperCase() === color.toUpperCase());
}

export function normalizeHexColor(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}
