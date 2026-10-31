import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { drawableCommentElements } from './drawableCommentElements.ts';

const el = (text) => ({ id: 'c', type: 'text', pageIndex: 0, left: 0, top: 0, text, fontSize: 11, fontFamily: 'Arimo', fontWeight: 'normal', color: '#000' });

describe('drawableCommentElements', () => {
  it('drops uncovered characters, skips emptied lines and unloadable fonts', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fs.readFileSync(path.resolve(process.cwd(), 'public/fonts/Arimo-Regular.ttf')), { subset: true });
    const out = await drawableCommentElements([el('great \u{1F44D}'), el('\u{1F44D}')], async () => font);
    expect(out.map((e) => e.text)).toEqual(['great ']);
    expect(await drawableCommentElements([el('great')], async () => null)).toEqual([]);
  });
});
