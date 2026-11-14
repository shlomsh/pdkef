// The page-detection KPI table: every labelled photo in real/ plus the synthetic corpus, scored by the same
// scorer against today's detector. Asserted against real/baseline.json; a regression fails. To move the
// baseline on purpose: UPDATE_BASELINE=1 npx vitest run src/tools/scan/lib/edges/realCorpus.test.ts
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { corpus } from './corpus.ts';
import { detectPage } from './detect.ts';
import { guessCorners } from './index.ts';
import { formatKpiTable, scoreDetector, TOLERANCES, type KpiCase, type KpiResult } from './kpi.ts';
import { parsePgm } from './real/pgm.ts';

const dir = new URL('./real/', import.meta.url);
const BASELINE = new URL('baseline.json', dir);

const CONDITIONS = ['low-contrast', 'shadow', 'glare', 'dark-print', 'clutter', 'lap', 'curled', 'partly-out', 'hand', 'no-page', 'plain'];

/** How much a KPI may move the wrong way before the test fails (measurement noise, not progress). */
const RATE_SLACK = 0.005;
const ERROR_SLACK = 0.002;

interface Label { corners: number[][] | null; conditions: string[]; source: string }
interface Baseline { real: KpiResult; synthetic: KpiResult; cameraReal: KpiResult; cameraSynthetic: KpiResult }

function loadReal(): { cases: KpiCase[]; problems: string[] } {
  const labels = JSON.parse(readFileSync(new URL('labels.json', dir), 'utf8')) as Record<string, Label>;
  const files = (readdirSync(dir) as string[]).filter((f) => f.endsWith('.pgm')).map((f) => f.slice(0, -4));
  const problems: string[] = [];
  for (const f of files) if (!labels[f]) problems.push(`${f}.pgm has no label`);
  const cases: KpiCase[] = [];
  for (const [name, l] of Object.entries(labels)) {
    if (!files.includes(name)) { problems.push(`label "${name}" has no ${name}.pgm`); continue; }
    if (l.corners !== null && !(Array.isArray(l.corners) && l.corners.length === 4 && l.corners.every((p) => p.length === 2 && p.every((v) => v >= 0 && v <= 1)))) problems.push(`"${name}": corners must be 4 normalized [x,y] pairs or null`);
    for (const c of l.conditions) if (!CONDITIONS.includes(c)) problems.push(`"${name}": unknown condition "${c}"`);
    if ((l.corners === null) !== l.conditions.includes('no-page')) problems.push(`"${name}": null corners and the no-page condition go together`);
    if (!l.source?.trim()) problems.push(`"${name}": source is empty`);
    const image = parsePgm(new Uint8Array(readFileSync(new URL(`${name}.pgm`, dir))));
    if (Math.max(image.width, image.height) !== 320) problems.push(`"${name}": long edge is ${Math.max(image.width, image.height)}, expected 320`);
    const truth = l.corners && (l.corners.map(([x, y]) => ({ x, y })) as Quad);
    cases.push({ name, image, truth, conditions: l.conditions });
  }
  return { cases, problems };
}

const syntheticCases = (): KpiCase[] => corpus.map((c) => ({ name: c.name, image: c.image, truth: c.truth, conditions: [], nullOk: c.nullOk, tol: c.tol }));

/** Failures where `got` is worse than `base` beyond the slack. */
function regressions(got: KpiResult, base: KpiResult): string[] {
  const out: string[] = [];
  if (got.n !== base.n) return [`photos: ${got.n}, baseline has ${base.n}. Update the baseline on purpose (see scripts/scan-corpus/README.md)`];
  const lower = (what: string, g: number, b: number, slack: number) => { if (g < b - slack) out.push(`${what} fell: ${g.toFixed(4)} < ${b.toFixed(4)}`); };
  const higher = (what: string, g: number, b: number, slack: number) => { if (g > b + slack) out.push(`${what} rose: ${g.toFixed(4)} > ${b.toFixed(4)}`); };
  for (const t of TOLERANCES) lower(`found@${t}`, got.found[String(t)], base.found[String(t)], RATE_SLACK);
  lower('median IoU', got.medianIou, base.medianIou, RATE_SLACK);
  higher('median err', got.medianError, base.medianError, ERROR_SLACK);
  higher('max err', got.maxError, base.maxError, ERROR_SLACK);
  if (got.confidentlyWrong > base.confidentlyWrong) out.push(`confidently wrong rose: ${got.confidentlyWrong} > ${base.confidentlyWrong}`);
  if (base.nullOnNoPage !== null && got.nullOnNoPage !== null) lower('null on no page', got.nullOnNoPage, base.nullOnNoPage, RATE_SLACK);
  for (const [k, b] of Object.entries(base.byCondition)) lower(`found@0.035 for ${k}`, got.byCondition[k] ?? 0, b, RATE_SLACK);
  return out;
}

const score = (cases: KpiCase[]) => scoreDetector(cases, (img) => guessCorners(img));
/** The live camera's finder, scored on the same cases. */
const scoreCamera = (cases: KpiCase[]) => scoreDetector(cases, (img) => detectPage(img).quad);
// @ts-expect-error -- no Node ambient types here (see the fs import).
const update = process.env.UPDATE_BASELINE === '1';
const measured: Partial<Baseline> = {};

describe('page detection KPIs, real photos', () => {
  const { cases, problems } = loadReal();

  it('has a clean set of labels', () => {
    expect(problems).toEqual([]);
  });

  it('does not regress against the baseline', () => {
    const result = score(cases);
    measured.real = result;
    console.log(`\nReal photos\n${formatKpiTable(result)}`);
    if (!update) expect(regressions(result, (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline).real)).toEqual([]);
  });

  it('does not regress against the baseline, camera finder', () => {
    const result = scoreCamera(cases);
    measured.cameraReal = result;
    console.log(`\nReal photos, camera detectPage\n${formatKpiTable(result)}`);
    if (!update) expect(regressions(result, (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline).cameraReal)).toEqual([]);
  });
});

describe('page detection KPIs, synthetic corpus', () => {
  it('does not regress against the baseline', () => {
    const result = score(syntheticCases());
    measured.synthetic = result;
    console.log(`\nSynthetic scenes\n${formatKpiTable(result)}`);
    if (!update) expect(regressions(result, (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline).synthetic)).toEqual([]);
  }, 30_000);

  it('does not regress against the baseline, camera finder', () => {
    const result = scoreCamera(syntheticCases());
    measured.cameraSynthetic = result;
    console.log(`\nSynthetic scenes, camera detectPage\n${formatKpiTable(result)}`);
    if (update) writeFileSync(BASELINE, `${JSON.stringify(measured, null, 2)}\n`);
    else expect(regressions(result, (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline).cameraSynthetic)).toEqual([]);
  }, 30_000);
});
