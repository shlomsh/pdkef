import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, StandardFonts } from '@cantoo/pdf-lib';
import { collectCheckboxGlyphs, extractPageObjects } from './pdfObjects.js';
import { withPreviews } from './objectPreviews.test-helper.js';

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

describe('collectCheckboxGlyphs in a symbol font (FORM-20)', () => {
  /** A one-glyph-per-code TrueType font under `baseFont`, 700 wide, the way a Word export writes it. */
  const symbolFont = (baseFont) => (document) => {
    const descriptor = document.context.obj({ Type: 'FontDescriptor', Ascent: 800, Descent: -200 });
    return {
      S: document.context.obj({
        Type: 'Font',
        Subtype: 'TrueType',
        BaseFont: baseFont,
        FirstChar: 0x6c,
        Widths: [PDFNumber.of(700), PDFNumber.of(700), PDFNumber.of(700), PDFNumber.of(700)],
        FontDescriptor: document.context.register(descriptor),
      }),
    };
  };

  it('reads a Wingdings box code as a checkbox, by the advance-by-ascent box', async () => {
    const page = await pageWith('BT /S 10 Tf 1 0 0 1 100 200 Tm (o) Tj ET', symbolFont('Wingdings'));
    expect(collectCheckboxGlyphs(page).map(rounded)).toEqual([{ x: 100, y: 198, width: 7, height: 10 }]);
  });

  it('reads a Wingdings bullet as nothing', async () => {
    const page = await pageWith('BT /S 10 Tf 1 0 0 1 100 200 Tm (l) Tj ET', symbolFont('Wingdings'));
    expect(collectCheckboxGlyphs(page)).toEqual([]);
  });

  it('reads the same code in an ordinary font as nothing: the character alone says nothing', async () => {
    const page = await pageWith('BT /S 10 Tf 1 0 0 1 100 200 Tm (o) Tj ET', symbolFont('Times New Roman'));
    expect(collectCheckboxGlyphs(page)).toEqual([]);
  });

  it('names the family through a subset tag, an escaped space and a style', async () => {
    const page = await pageWith('BT /S 10 Tf 1 0 0 1 100 200 Tm (o) Tj ET', symbolFont('ABCDEE+Wingdings,Bold'));
    expect(collectCheckboxGlyphs(page)).toHaveLength(1);
  });

  it('reads Wingdings 2\'s box through a two-byte font whose ToUnicode puts it at U+F02A', async () => {
    const page = await pageWith('BT /S 10 Tf 1 0 0 1 100 200 Tm [<000D>] TJ ET', (document) => {
      const toUnicode = document.context.register(document.context.flateStream(
        'begincmap 1 beginbfchar <000D> <F02A> endbfchar endcmap',
      ));
      const descriptor = document.context.obj({ Type: 'FontDescriptor', Ascent: 800, Descent: -200 });
      const descendant = document.context.obj({
        Type: 'Font', Subtype: 'CIDFontType2', DW: 700, FontDescriptor: document.context.register(descriptor),
      });
      return {
        S: document.context.obj({
          Type: 'Font',
          Subtype: 'Type0',
          BaseFont: 'ABCDEE+Wingdings 2',
          Encoding: 'Identity-H',
          DescendantFonts: [document.context.register(descendant)],
          ToUnicode: toUnicode,
        }),
      };
    });
    expect(collectCheckboxGlyphs(page).map(rounded)).toEqual([{ x: 100, y: 198, width: 7, height: 10 }]);
  });

  it('does not read Wingdings 2\'s code as a box in plain Wingdings', async () => {
    // 0x2A ('*') means a box only in Wingdings 2; the family is part of the evidence.
    const page = await pageWith('BT /S 10 Tf 1 0 0 1 100 200 Tm (*) Tj ET', symbolFont('Wingdings'));
    expect(collectCheckboxGlyphs(page)).toEqual([]);
  });
});

describe('extractPageObjects', () => {
  it('previews a text run whose glyphs decode to Hebrew in visual (drawing) order in reading order', async () => {
    // The content stream shows codes 41 42 43 44, which this ToUnicode CMap
    // maps to ף ג א ה in that order: the drawing order a PDF actually uses
    // for RTL text, not the reading order "האגף".
    const page = await pageWith('BT /H 10 Tf 1 0 0 1 100 200 Tm (ABCD) Tj ET', (document) => {
      const toUnicode = document.context.register(document.context.flateStream(
        'begincmap 4 beginbfchar <41> <05E3> <42> <05D2> <43> <05D0> <44> <05D4> endbfchar endcmap',
      ));
      return {
        H: document.context.obj({
          Type: 'Font',
          Subtype: 'TrueType',
          BaseFont: 'SomeHebrewFont',
          FirstChar: 65,
          Widths: [PDFNumber.of(500), PDFNumber.of(500), PDFNumber.of(500), PDFNumber.of(500)],
          ToUnicode: toUnicode,
        }),
      };
    });
    const { objects } = extractPageObjects(page, 0);
    expect(objects.filter((o) => o.kind === 'text').map((o) => o.preview)).toEqual([undefined]);
    const previewed = await withPreviews(await page.doc.save(), objects);
    expect(previewed.filter((o) => o.kind === 'text').map((o) => o.preview)).toEqual(['האגף']);
  });
});

describe('PDkef marks (RED-55)', () => {
  it('reports one mark for a PDkef sequence, absorbing the text inside its own BDC', async () => {
    const page = await pageWith(
      '/PDkef BMC q 1 0 0 1 100 200 cm 2 w 0 0 m 10 10 l S /Span <</ActualText (x)>> BDC BT /F 10 Tf 0 20 Td (x) Tj ET EMC Q EMC',
      (document) => ({ F: document.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: StandardFonts.Helvetica }) }),
    );
    const { objects, bytes } = extractPageObjects(page, 0);
    expect(objects.map((o) => o.kind)).toEqual(['mark']);
    const [mark] = objects;
    expect(new TextDecoder().decode(bytes.slice(mark.start, mark.end)).startsWith('/PDkef BMC')).toBe(true);
    expect(new TextDecoder().decode(bytes.slice(mark.start, mark.end)).endsWith('EMC')).toBe(true);
    // The path (0,0)-(10,10) at (100,200), widened by half the 2pt line; the text lies above it.
    expect(mark.bbox.x).toBeCloseTo(99, 5);
    expect(mark.bbox.y).toBeCloseTo(199, 5);
    expect(mark.bbox.y + mark.bbox.height).toBeGreaterThan(220);
  });

  it('offers no unit for paths outside a PDkef mark', async () => {
    const page = await pageWith('q 1 w 10 10 m 50 50 l S 0 0 100 20 re f /Other BMC 5 5 m 9 9 l S EMC Q', () => ({}));
    expect(extractPageObjects(page, 0).objects).toEqual([]);
  });
});
