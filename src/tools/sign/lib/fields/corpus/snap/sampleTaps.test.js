import { describe, expect, it } from 'vitest'
import { sampleTaps } from './sampleTaps.js'

const MAX = 20
const truth = {
  id: 'f1',
  pageWidthPts: 612,
  pageHeightPts: 792,
  rules: [
    { id: 'r1', kind: 'rule', x0: 50, x1: 300, y: 200, thickness: 0.5 },
    { id: 'r2', kind: 'rule', x0: 50, x1: 300, y: 215, thickness: 0.5 },
    { id: 'r3', kind: 'rule', x0: 50, x1: 300, y: 500, thickness: 1 },
    { id: 'r4', kind: 'rule', x0: 320, x1: 560, y: 600, thickness: 0.5 },
  ],
}
const opts = { view: 'native', maxSnapPts: MAX, seed: 7 }
const byId = Object.fromEntries(truth.rules.map((r) => [r.id, r]))

describe('sampleTaps', () => {
  const cases = sampleTaps(truth, opts)
  it('is deterministic and ids are stable', () => {
    expect(sampleTaps(truth, opts)).toEqual(cases)
    cases.forEach((c, i) => expect(c.tap.id).toBe(`f1:${i}`))
  })
  it('a different seed changes the taps', () => {
    expect(sampleTaps(truth, { ...opts, seed: 8 })).not.toEqual(cases)
  })
  it('snap taps sit above (or just below) their rule, inside its x extent, with no near rival', () => {
    const snaps = cases.filter((c) => c.expect.kind === 'snap')
    expect(snaps.length).toBeGreaterThan(0)
    for (const { tap, expect: e } of snaps) {
      const r = byId[e.ruleId]
      const above = r.y - tap.y
      const okAbove = above >= 1.5 * r.thickness + 1 - 1e-9 && above <= MAX + 1e-9
      const okBelow = above < 0 && -above <= 4
      expect(okAbove || okBelow).toBe(true)
      expect(tap.x).toBeGreaterThanOrEqual(r.x0 + 2)
      expect(tap.x).toBeLessThanOrEqual(r.x1 - 2)
      const d = Math.abs(tap.y - r.y)
      for (const o of truth.rules) {
        if (o === r || tap.x < o.x0 || tap.x > o.x1) continue
        expect(Math.abs(tap.y - o.y)).toBeGreaterThanOrEqual(1.3 * d)
      }
    }
  })
  it('far decoys are beyond 2x maxSnapPts from every rule', () => {
    const far = cases.filter((c) => c.expect.why === 'far')
    expect(far.length).toBeGreaterThan(0)
    for (const { tap } of far) {
      for (const r of truth.rules) {
        const dx = Math.max(r.x0 - tap.x, 0, tap.x - r.x1)
        expect(Math.hypot(dx, tap.y - r.y)).toBeGreaterThan(2 * MAX)
      }
    }
  })
  it('ambiguous decoys lie between two rules', () => {
    const mid = cases.filter((c) => c.expect.why === 'ambiguous' && Math.abs(c.tap.y - 207.5) < 1e-9)
    expect(mid.length).toBeGreaterThan(0)
    for (const { tap } of mid) {
      expect(tap.x).toBeGreaterThanOrEqual(52)
      expect(tap.x).toBeLessThanOrEqual(298)
    }
  })
  it('keeps 4 pt of page margin', () => {
    const edge = { ...truth, id: 'f2', rules: [{ id: 'e', kind: 'rule', x0: 0, x1: 612, y: 8, thickness: 0.5 }] }
    const taps = sampleTaps(edge, opts)
    expect(taps.length).toBeGreaterThan(0)
    for (const { tap } of taps) {
      expect(tap.y).toBeGreaterThanOrEqual(4)
      expect(tap.x).toBeGreaterThanOrEqual(4)
      expect(tap.x).toBeLessThanOrEqual(608)
    }
  })
  it('emits text decoys only with textBoxes', () => {
    expect(cases.some((c) => c.expect.why === 'text')).toBe(false)
    const withText = sampleTaps(truth, { ...opts, textBoxes: [{ x0: 100, x1: 400, y0: 300, y1: 330 }] })
    expect(withText.some((c) => c.expect.why === 'text')).toBe(true)
  })
})
