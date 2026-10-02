// Deterministic tap sampling for the snap corpus (README "Tap sampling"). Points, y down.
import { mulberry32 } from './prng.js'

const MARGIN = 4
const INSET = 2
const AMBIGUITY = 1.3

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Distance from a point to a rule (a segment, or the filled rectangle of a box).
function distToRule(r, x, y) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1)
  const dy = r.y0 != null ? Math.max(r.y0 - y, 0, y - r.y) : Math.abs(y - r.y)
  return Math.hypot(dx, dy)
}

const minDist = (rules, x, y) => rules.reduce((m, r) => Math.min(m, distToRule(r, x, y)), Infinity)

export function sampleTaps(truth, { view, maxSnapPts, seed = 1, perRule = 3, decoys = 12, textBoxes } = {}) {
  void view
  const rng = mulberry32((seed ^ hashString(truth.id)) >>> 0)
  const W = truth.pageWidthPts
  const H = truth.pageHeightPts
  const rules = truth.rules
  const inPage = (x, y) => x >= MARGIN && x <= W - MARGIN && y >= MARGIN && y <= H - MARGIN
  const uniform = (a, b) => (b <= a ? a : a + rng() * (b - a))
  const xIn = (r) => {
    const a = r.x0 + INSET
    const b = r.x1 - INSET
    return b <= a ? (r.x0 + r.x1) / 2 : uniform(a, b)
  }
  const out = []
  const push = (x, y, expect) => {
    if (!inPage(x, y)) return
    out.push({ tap: { id: `${truth.id}:${out.length}`, formId: truth.id, x, y }, expect })
  }

  // The tap means the rule that is clearly nearest among those covering its x; when the runner-up is within
  // AMBIGUITY times as far, nothing is clear and the person should be left where they tapped.
  const ruleTap = (x, y) => {
    const near = rules
      .filter((o) => x >= o.x0 && x <= o.x1)
      .map((o) => ({ o, d: Math.abs(y - o.y) }))
      .sort((a, b) => a.d - b.d)
    if (!near.length || near[0].d > maxSnapPts) return
    const rival = near[1] && near[1].d < AMBIGUITY * near[0].d
    push(x, y, rival ? { kind: 'decline', why: 'ambiguous' } : { kind: 'snap', ruleId: near[0].o.id })
  }

  // Taps are aimed at each rule (above it, where the writing goes, and just below it).
  for (const rule of rules) {
    const lo = 1.5 * rule.thickness + 1
    for (let k = 0; k < perRule; k++) {
      const x = xIn(rule)
      const offset = uniform(lo, Math.max(lo, maxSnapPts))
      ruleTap(x, rule.y - offset)
    }
    const x = xIn(rule)
    ruleTap(x, rule.y + uniform(1, 4))
  }

  const nFar = Math.ceil(decoys / 2)
  const nAmb = Math.floor(decoys / 4)
  const nText = decoys - nFar - nAmb

  // (a) far from every rule
  for (let n = 0; n < nFar; n++) {
    for (let t = 0; t < 200; t++) {
      const x = uniform(MARGIN, W - MARGIN)
      const y = uniform(MARGIN, H - MARGIN)
      if (minDist(rules, x, y) > 2 * maxSnapPts) {
        push(x, y, { kind: 'decline', why: 'far' })
        break
      }
    }
  }

  // (b) midway between two rules that both cover the x
  const pairs = []
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]
      const b = rules[j]
      const gap = Math.abs(a.y - b.y)
      const x0 = Math.max(a.x0, b.x0) + INSET
      const x1 = Math.min(a.x1, b.x1) - INSET
      if (gap > 0 && gap < 2 * maxSnapPts && x1 > x0) pairs.push({ a, b, x0, x1 })
    }
  }
  if (pairs.length) {
    for (let n = 0; n < nAmb; n++) {
      const p = pairs[Math.floor(rng() * pairs.length)]
      ruleTap(uniform(p.x0, p.x1), (p.a.y + p.b.y) / 2)
    }
  }

  // (c) printed text, only when the caller knows where it is
  if (textBoxes && textBoxes.length) {
    for (let n = 0; n < nText; n++) {
      for (let t = 0; t < 200; t++) {
        const box = textBoxes[Math.floor(rng() * textBoxes.length)]
        const x = uniform(box.x0, box.x1)
        const y = uniform(box.y0, box.y1)
        if (inPage(x, y) && minDist(rules, x, y) > maxSnapPts) {
          push(x, y, { kind: 'decline', why: 'text' })
          break
        }
      }
    }
  }
  return out
}
