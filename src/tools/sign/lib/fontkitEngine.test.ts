import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { create } from './fontkitEngine.ts';

// Never import the main `fontkit` entry here: it registers every shaper for `fontkit/core` too, and a shaper
// missing from the engine would go unseen. Each case fails when
// its shaper is dropped. HebrewShaper changes nothing in our fonts with up to two marks, so it has no case.
it.each([
  ['ScheherazadeNew', 'رأيت أحمد', [501, 1066, 443, 1335, 242, 1, 329, 1222, 1335, 242, 548]],
  ['NotoSansBengali', 'ক্ক হ্ন ট্র', [238, 319, 299, 321, 7, 56, 320, 347, 7, 217, 329, 285]],
  ['IBMPlexSansThai', 'น้ำ ค้ำ', [312, 465, 494, 328, 3, 293, 465, 494, 328]],
  ['NotoSansKR', '\u1112\u1161\u11ab', [10912]],
] as [string, string, number[]][])('%s shapes %s with its own shaper', (file, text, ids) => {
  const font = create(new Uint8Array(readFileSync(join(process.cwd(), 'public/fonts', `${file}-Regular.ttf`))));
  expect(font.layout(text).glyphs.map((g: { id: number }) => g.id)).toEqual(ids);
});
