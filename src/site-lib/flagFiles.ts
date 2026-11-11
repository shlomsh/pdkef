// MEM-42: which flags the rating board can show. Build-time only (reads public/flags with node:fs): the board and
// the sprite endpoint (src/pages/flags/[sprite].svg.ts) both ask here, so a flag is drawn exactly when the sprite has it.
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; the build provides the runtime.
import { existsSync, readFileSync } from 'node:fs';
import type { PinnedNote } from './pinnedNote.js';
import { flagSpriteOf, type FlagFile, type PublishedFlagSprite } from './flagSprite.js';

// No @types/node in this repo; the build provides process.cwd().
declare const process: { cwd(): string };

const dir = () => `${process.cwd()}/public/flags`;

/** The distinct country codes of these notes that have a flag file, sorted. */
function flagCodesOf(notes: readonly Pick<PinnedNote, 'country'>[]): string[] {
  const codes = new Set<string>();
  for (const n of notes) if (n.country && existsSync(`${dir()}/${n.country}.svg`)) codes.add(n.country);
  return [...codes].sort();
}

function readFlagFiles(codes: readonly string[]): FlagFile[] {
  return codes.map((code) => ({ code, svg: readFileSync(`${dir()}/${code}.svg`, 'utf8') }));
}

/** The sprite for the flags these notes ask for, or null when none has a flag file (then nothing is published). */
export function flagSpriteFor(notes: readonly Pick<PinnedNote, 'country'>[]): PublishedFlagSprite | null {
  const codes = flagCodesOf(notes);
  return codes.length === 0 ? null : flagSpriteOf(readFlagFiles(codes));
}
