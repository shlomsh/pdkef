// SCAN-24: no false alarm on real photos. Every labelled photo in edges/real/ shows its page wholly in view, so the
// camera's cut-off reading (paper running on past a side to the frame's edge) must be false on each.
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePgm } from '../edges/real/pgm.ts';
import { observeFrame } from './observe.ts';

const dir = new URL('../edges/real/', import.meta.url);
const labels = JSON.parse(readFileSync(new URL('labels.json', dir), 'utf8')) as Record<string, { corners: number[][] | null; conditions: string[] }>;

describe('cutOff on the real photos, pages wholly in view', () => {
  for (const [name, l] of Object.entries(labels)) {
    if (!l.corners || l.conditions.includes('partly-out')) continue;
    it(`${name}: not cut off`, () => {
      const image = parsePgm(new Uint8Array(readFileSync(new URL(`${name}.pgm`, dir))));
      const obs = observeFrame(image, 0, null);
      if (obs.quad) expect(obs.cutOff).toBe(false);
    });
  }
});
