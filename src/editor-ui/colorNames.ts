import type { SignMessages } from '#editor/registry/messages.ts';

// A handful of common ink colors, plus a native picker for anything else
export const PRESET_COLORS: readonly string[] = ['#000000', '#d8342b', '#1463ff', '#1a8f54', '#112d4e', '#ffffff'];

// Same order as PRESET_COLORS: black, red, blue, green, navy, white.
const PRESET_NAME_KEYS = ['colorBlack', 'colorRed', 'colorBlue', 'colorGreen', 'colorNavy', 'colorWhite'] as const satisfies readonly (keyof SignMessages)[];

/** READ-04: the plain name of each default ink preset, keyed by its hex. */
export function presetColorNames(t: SignMessages): Record<string, string> {
  return Object.fromEntries(PRESET_COLORS.map((hex, i) => [hex, t[PRESET_NAME_KEYS[i]]]));
}
