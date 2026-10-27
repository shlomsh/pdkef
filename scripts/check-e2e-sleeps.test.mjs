import { describe, expect, it } from 'vitest';
import { compareSleeps, countSleeps, isE2eSpec, nextSleepLimit } from './check-e2e-sleeps.mjs';

describe('countSleeps (ARCH-79)', () => {
  it('counts waitForTimeout call sites on any page handle', () => {
    const src = `await page.waitForTimeout(300);\nawait restored.waitForTimeout(1_500);\n`;
    expect(countSleeps(src)).toBe(2);
  });

  it('skips line and block comments', () => {
    const src = `// await page.waitForTimeout(300);\n/* page.waitForTimeout(1) */\nawait x.waitForTimeout(5);\n  * page.waitForTimeout(9)\n`;
    expect(countSleeps(src)).toBe(1);
  });

  it('counts a promise-wrapped setTimeout sleep', () => {
    const src = `await new Promise(resolve => setTimeout(resolve, 200));\nawait new Promise((r) => setTimeout(r, 5));\n`;
    expect(countSleeps(src)).toBe(2);
  });

  it('does not count test.setTimeout', () => {
    expect(countSleeps('test.setTimeout(90_000);')).toBe(0);
  });

  it('ignores other waits', () => {
    expect(countSleeps('await page.waitForLoadState();\nawait page.waitForFunction(() => 1);')).toBe(0);
  });
});

describe('isE2eSpec', () => {
  it.each([
    ['e2e/a.spec.js', true],
    ['e2e/home/a.spec.js', true],
    ['src/tools/sign/e2e/a.spec.js', true],
    ['src/tools/sign/a.test.js', false],
    ['scripts/a.spec.js', false],
  ])('%s -> %s', (f, ok) => expect(isE2eSpec(f)).toBe(ok));
});

describe('compareSleeps / nextSleepLimit', () => {
  it('fails when one more call than the record', () => {
    const r = compareSleeps(19, 20);
    expect(r.failed).toBe(true);
    expect(nextSleepLimit(19, 20)).toBe(null);
  });
  it('passes when equal and writes nothing', () => {
    expect(compareSleeps(19, 19).failed).toBe(false);
    expect(nextSleepLimit(19, 19)).toBe(null);
  });
  it('passes when fewer and lowers the record', () => {
    expect(compareSleeps(19, 17).failed).toBe(false);
    expect(nextSleepLimit(19, 17)).toBe(17);
  });
});
