import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const lines = ci.split('\n');

// The one schedule-only gate on purpose: the step with `id: nightly` must never
// skip a manual nightly as "unchanged".
function nightlyStepIfLine() {
  const idAt = lines.findIndex((l) => /^\s*id: nightly\s*$/.test(l));
  expect(idAt).toBeGreaterThan(-1);
  for (let i = idAt + 1; i < lines.length; i++) {
    if (/^\s*if:/.test(lines[i])) return i;
    if (/^\s*- name:/.test(lines[i])) break;
  }
  throw new Error('no if: in the nightly step');
}

describe('ci.yml nightly dispatch', () => {
  it('workflow_dispatch has a boolean nightly input defaulting to false', () => {
    const at = lines.findIndex((l) => /^\s*nightly:\s*$/.test(l));
    expect(at).toBeGreaterThan(-1);
    const block = lines.slice(at, at + 4).join('\n');
    expect(block).toMatch(/type: boolean/);
    expect(block).toMatch(/default: false/);
  });

  it("every schedule gate also accepts a nightly dispatch, except the 'nightly' step", () => {
    const skip = nightlyStepIfLine();
    const gates = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => l.includes("github.event_name == 'schedule'") && i !== skip);
    expect(gates.length).toBeGreaterThan(0);
    for (const { l } of gates) expect(l).toContain('inputs.nightly');
    expect(lines[skip]).not.toContain('inputs.nightly');
  });

  it('scope accepts a nightly dispatch; the baseline step is unchanged', () => {
    const scopeAt = lines.findIndex((l) => /^  scope:\s*$/.test(l));
    const scopeIf = lines.slice(scopeAt, scopeAt + 5).find((l) => /^\s*if:/.test(l));
    expect(scopeIf).toContain('inputs.nightly');
    expect(ci).toMatch(/if: \$\{\{ always\(\) && inputs\.update-export-render-baseline \}\}/);
  });
});
