import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, StandardFonts } from '@cantoo/pdf-lib';
import { collectCheckboxGlyphs } from './pdfObjects.js';

/** One page whose content stream is `stream`, with `fonts` as its /Font resources. */
async function pageWith(stream, fonts) {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  const fontDict = document.context.obj({});
  for (const [name, dict] of Object.entries(fonts(document))) fontDict.set(PDFName.of(name), dict);
  page.node.set(PDFName.of('Resources'), document.context.obj({ Font: fontDict }));
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream(stream)));
  const reloaded = await PDFDocument.load(await document.save());
  return reloaded.getPage(0);
}

const rounded = (box) => Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Number(value.toFixed(4))]));

describe('collectCheckboxGlyphs', () => {
  it('bounds a Zapf Dingbats ❏ or ❑ by the square a person sees, not the font-wide line box', async () => {
    const page = await pageWith('BT /Z 10 Tf 1 0 0 1 100 200 Tm (o) Tj 1 0 0 1 300 200 Tm (q) Tj ET', (document) => ({
      Z: document.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: StandardFonts.ZapfDingbats }),
    }));
    // The inner contours of a74 (x 64-590, y 134-662) and a75 (x 66-598,
    // y 123-660) per 1000 em, at 10pt.
    expect(collectCheckboxGlyphs(page).map(rounded)).toEqual([
      { x: 100.64, y: 201.34, width: 5.26, height: 5.28 },
      { x: 300.66, y: 201.23, width: 5.32, height: 5.37 },
    ]);
  });

  it('keeps the square under the text matrix, horizontal scaling and rise', async () => {
    const page = await pageWith('BT /Z 10 Tf 50 Tz 2 Ts 2 0 0 2 100 200 Tm (q) Tj ET', (document) => ({
      Z: document.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: StandardFonts.ZapfDingbats }),
    }));
    // x: (66..598)/1000 * 10pt * 0.5 Tz, then * 2; y: (123..660)/1000 * 10pt + 2 rise, then * 2.
    expect(collectCheckboxGlyphs(page).map(rounded)).toEqual([
      { x: 100.66, y: 206.46, width: 5.32, height: 10.74 },
    ]);
  });

  it('keeps the advance-by-ascent box for a ☐ in any other font', async () => {
    const page = await pageWith('BT /U 10 Tf 1 0 0 1 100 200 Tm (A) Tj ET', (document) => {
      const toUnicode = document.context.register(document.context.flateStream(
        'begincmap 1 beginbfchar <41> <2610> endbfchar endcmap',
      ));
      const descriptor = document.context.obj({ Type: 'FontDescriptor', Ascent: 800, Descent: -200 });
      return {
        U: document.context.obj({
          Type: 'Font',
          Subtype: 'TrueType',
          BaseFont: 'SomeSymbols',
          FirstChar: 65,
          Widths: [PDFNumber.of(700)],
          FontDescriptor: document.context.register(descriptor),
          ToUnicode: toUnicode,
        }),
      };
    });
    expect(collectCheckboxGlyphs(page).map(rounded)).toEqual([{ x: 100, y: 198, width: 7, height: 10 }]);
  });
});
