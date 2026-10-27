// Statistics for the snap corpus: Clopper-Pearson lower bound, cluster bootstrap, per-key summary.
// Plain ES module, no dependencies, deterministic.

import { mulberry32 } from './prng.js'

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  const xx = x - 1
  let a = 0.99999999999980993
  const t = xx + 7.5
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (xx + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a)
}

function betaCf(a, b, x) {
  const TINY = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function regIncBeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  if (x < (a + 1) / (a + b + 2)) return (front * betaCf(a, b, x)) / a
  return 1 - (front * betaCf(b, a, 1 - x)) / b
}

/** One-sided lower bound of a binomial proportion. null when n is 0. */
export function clopperPearsonLower(successes, n, confidence = 0.95) {
  if (!(n > 0)) return null
  if (successes <= 0) return 0
  const alpha = 1 - confidence
  // Lower bound is the alpha quantile of Beta(k, n - k + 1).
  let lo = 0
  let hi = 1
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (regIncBeta(mid, successes, n - successes + 1) < alpha) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** perDoc = [{ correct, wrong }]. 5th percentile (by confidence) of pooled precision over document resamples. */
export function clusterBootstrapLower(perDoc, { confidence = 0.95, resamples = 2000, seed = 1 } = {}) {
  const docs = perDoc.length
  if (!docs) return null
  const rng = mulberry32(seed)
  const values = []
  for (let r = 0; r < resamples; r++) {
    let correct = 0
    let wrong = 0
    for (let i = 0; i < docs; i++) {
      const d = perDoc[Math.floor(rng() * docs)]
      correct += d.correct
      wrong += d.wrong
    }
    if (correct + wrong > 0) values.push(correct / (correct + wrong))
  }
  if (!values.length) return null
  values.sort((a, b) => a - b)
  const idx = Math.min(values.length - 1, Math.floor((1 - confidence) * values.length))
  return values[idx]
}

function tally(cases) {
  let correct = 0
  let wrong = 0
  let declined = 0
  for (const c of cases) {
    if (c.outcome === 'correct') correct++
    else if (c.outcome === 'wrong') wrong++
    else if (c.outcome === 'declined') declined++
  }
  const snaps = correct + wrong
  const total = cases.length
  return {
    snaps,
    correct,
    wrong,
    declined,
    total,
    precision: snaps ? correct / snaps : null,
    declineRate: total ? declined / total : 0,
    lower: snaps ? clopperPearsonLower(correct, snaps) : null,
  }
}

function groupBy(cases, key) {
  const groups = {}
  for (const c of cases) (groups[c[key]] ||= []).push(c)
  const out = {}
  for (const k of Object.keys(groups)) out[k] = tally(groups[k])
  return out
}

/** cases = [{ formId, level, view, outcome }]. */
export function summarise(cases) {
  return { ...tally(cases), byLevel: groupBy(cases, 'level'), byView: groupBy(cases, 'view') }
}
