import { describe, expect, it } from 'vitest';
import { corpus } from './corpus.ts';
import { guessCorners } from './index.ts';

const FOUND_TOL = 0.035;
const WRONG_TOL = 0.08;

describe('edge guess corpus', () => {
  it('finds most hard scenes and is never confidently wrong', () => {
    const rows: string[] = [];
    let found = 0;
    const wrong: string[] = [];
    for (const c of corpus) {
      const t0 = performance.now();
      const got = guessCorners(c.image);
      const ms = performance.now() - t0;
      let err = Infinity;
      if (got) err = Math.max(...got.map((p, i) => Math.max(Math.abs(p.x - c.truth[i].x), Math.abs(p.y - c.truth[i].y))));
      const ok = got ? err <= (c.tol ?? FOUND_TOL) : !!c.nullOk;
      if (ok) found += 1;
      if (got && err > WRONG_TOL) wrong.push(c.name);
      rows.push(`${ok ? 'FOUND ' : 'MISS  '} ${c.name.padEnd(30)} ${got ? `err ${err.toFixed(3)}` : 'null     '} ${ms.toFixed(1)}ms`);
    }
    console.log(`\n${rows.join('\n')}\nscore ${found}/${corpus.length}, confidently wrong: ${wrong.length ? wrong.join(', ') : 'none'}`);
    expect(wrong).toEqual([]);
    expect(found).toBeGreaterThanOrEqual(corpus.length - 1);
    // About 2.5s alone, all CPU: next to the other test files it ran past the 5s default and failed.
  }, 30_000);
});
