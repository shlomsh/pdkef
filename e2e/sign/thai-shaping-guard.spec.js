import { test, expect } from '@playwright/test';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Thai export shaping guard (FONT-10): where the marks land, which the advance
 * checks in thai-font-parity.spec.js cannot see. Sara am (U+0E33) is drawn as a
 * ring over the consonant plus an aa after it, and a tone mark typed before it
 * has to end up above that ring. Getting that wrong moves no advance at all, so
 * น้ำ ("water") measured the same width while its marks sat on top of each other.
 * Strings stay short so one misplaced mark is a large share of the ink.
 */

const CONSONANTS = [...'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'];
const SARA_AM = 'ำ';
const TONES = { maiEk: '่', maiTho: '้', maiTri: '๊', maiChattawa: '๋' };

const CORPUS = [
  ...CONSONANTS.map((consonant) => ({ id: `saraAm:${consonant}`, text: consonant + SARA_AM })),
  ...CONSONANTS.map((consonant) => ({ id: `maiThoSaraAm:${consonant}`, text: consonant + TONES.maiTho + SARA_AM })),
  ...Object.entries(TONES).map(([name, tone]) => ({ id: `${name}SaraAm:น`, text: `น${tone}${SARA_AM}` })),
  // Tone over an above-vowel, and over a tall ascender.
  { id: 'toneOverVowel', text: 'ที่' },
  { id: 'toneOverTallAscender', text: 'ปั๊ก' },
  { id: 'thanthakhat', text: 'ศุกร์' },
  { id: 'belowVowelTall', text: 'ญู' },
  { id: 'word:water', text: 'น้ำ' },
  { id: 'word:deep', text: 'ล้ำ' },
  { id: 'word:low', text: 'ต่ำ' },
  { id: 'word:clear', text: 'กล้ำ' },
];

for (const { candidateName, fontFileName } of [
  { candidateName: 'IBMPlexSansThai', fontFileName: 'IBMPlexSansThai-Regular.ttf' },
  { candidateName: 'IBMPlexSansThaiBold', fontFileName: 'IBMPlexSansThai-Bold.ttf' },
  { candidateName: 'Sriracha', fontFileName: 'Sriracha-Regular.ttf' },
  { candidateName: 'Mali', fontFileName: 'Mali-Regular.ttf' },
]) {
  createShapingGuardTest({
    scriptName: 'Thai',
    candidateName,
    fontFileName,
    size: 400,
    canvasWidth: 1500,
    canvasHeight: 1000,
    anchorX: 80,
    baselineY: 620,
    corpus: CORPUS,
    calibrationSet: CONSONANTS,
    bundleFilename: `__e2e-thai-${candidateName.toLowerCase()}-fontkit-bundle.js`,
    minTolerancePct: 3,
    test,
    expect,
  });
}
