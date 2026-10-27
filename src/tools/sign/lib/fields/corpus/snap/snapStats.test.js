import { describe, expect, it } from 'vitest'
import { clopperPearsonLower, clusterBootstrapLower, summarise } from './snapStats.js'

describe('clopperPearsonLower', () => {
  it('reproduces published values', () => {
    expect(clopperPearsonLower(59, 59)).toBeGreaterThan(0.95)
    expect(Math.abs(clopperPearsonLower(59, 59) - 0.9505)).toBeLessThan(0.002)
    expect(Math.abs(clopperPearsonLower(93, 94) - 0.95)).toBeLessThan(0.002)
  })
  it('handles edges', () => {
    expect(clopperPearsonLower(0, 10)).toBe(0)
    expect(clopperPearsonLower(0, 0)).toBeNull()
    expect(clopperPearsonLower(10, 10)).toBeLessThan(1)
  })
})

describe('clusterBootstrapLower', () => {
  const docs = [
    { correct: 10, wrong: 0 },
    { correct: 9, wrong: 1 },
    { correct: 8, wrong: 2 },
    { correct: 10, wrong: 0 },
    { correct: 7, wrong: 0 },
  ]
  it('is deterministic and in [0,1]', () => {
    const a = clusterBootstrapLower(docs, { seed: 5 })
    expect(a).toBe(clusterBootstrapLower(docs, { seed: 5 }))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(1)
  })
  it('returns null with no snaps', () => {
    expect(clusterBootstrapLower([{ correct: 0, wrong: 0 }], { seed: 1 })).toBeNull()
  })
})

describe('summarise', () => {
  const cases = [
    { formId: 'a', level: 'clean', view: 'fit', outcome: 'correct' },
    { formId: 'a', level: 'clean', view: 'fit', outcome: 'wrong' },
    { formId: 'b', level: 'scan', view: 'zoom', outcome: 'declined' },
    { formId: 'b', level: 'scan', view: 'fit', outcome: 'correct' },
  ]
  it('counts add up', () => {
    const s = summarise(cases)
    expect(s.total).toBe(4)
    expect(s.snaps + s.declined).toBe(4)
    expect(s.correct + s.wrong).toBe(s.snaps)
    expect(s.precision).toBeCloseTo(2 / 3)
    expect(s.declineRate).toBe(0.25)
    expect(s.byLevel.clean.total + s.byLevel.scan.total).toBe(4)
    expect(s.byView.fit.snaps).toBe(3)
    expect(s.byView.zoom.precision).toBeNull()
    expect(s.byView.zoom.lower).toBeNull()
  })
  it('handles zero snaps and all wrong', () => {
    const none = summarise([{ formId: 'a', level: 'x', view: 'y', outcome: 'declined' }])
    expect(none.precision).toBeNull()
    expect(none.lower).toBeNull()
    const bad = summarise([{ formId: 'a', level: 'x', view: 'y', outcome: 'wrong' }])
    expect(bad.precision).toBe(0)
    expect(bad.lower).toBe(0)
  })
})
