import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PDFDocument} from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {proposalElements} from './proposals.ts';
import {createPageGeometry} from '../../../editor/geometry/coords.ts';
import {shapedWidth} from '../../../editor/text/textMetrics.ts';
import {resolveBidiRuns} from '../../../editor/text/bidiRuns.js';
import {strongTextDirection, fieldTextInset} from '../../../lib/signHelpers.js';
import {placeTextOnField} from '../../../editor/text/combPlacement.ts';

const geometry = createPageGeometry({cropBox:{x:0,y:0,width:595,height:842}});
const email = {id:'email',label:'דוא״ל (Email)',kind:'text',x:95,y:419,width:322,height:46,value:'noa.barkan@example.com'};
const image = {width:1190,height:1684};
async function measuredFont() {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync('public/fonts/Arimo-Regular.ttf'));
  return (text, _family, size) => Math.max(...text.split(/\r?\n/).map(line =>
    resolveBidiRuns(line, strongTextDirection(text) || 'ltr').reduce((width, run) => width + shapedWidth(font, run.text, size, run.direction), 0)));
}
describe('AI answer fitting with the actual export font', () => {
  it('fits the recorded Hebrew-form email within its 161pt span and recomputes vertical placement', async () => {
    const measure = await measuredFont();
    expect(measure(email.value,'Arimo',14)).toBeGreaterThan(161);
    const [element] = proposalElements([email],image,0,geometry,measure);
    expect(element.fontSize).toBeLessThan(14);
    const width = measure(element.text,element.fontFamily,element.fontSize);
    expect(width + 2 * fieldTextInset(161,width,element.fontSize)).toBeLessThanOrEqual(161);
    const region = {pageIndex:0,left:95/1190*100,top:419/1684*100,width:322/1190*100,height:46/1684*100};
    const expected = placeTextOnField({kind:'cell',region},{carriedFontSize:element.fontSize,fontFamily:element.fontFamily,pageWidthPoints:595,pageHeightPoints:842});
    expect(element.top).toBe(expected.top);
    expect(element).not.toHaveProperty('width');
  });
  it('leaves a short Hebrew name size unchanged and preserves mixed RTL text on a rotated crop', async () => {
    const measure = await measuredFont();
    const name = {...email,width:642,value:'נועה ברקן'};
    const [short] = proposalElements([name],image,0,geometry,measure);
    expect(short.fontSize).toBe(14);
    const rotated = createPageGeometry({cropBox:{x:25,y:35,width:842,height:595},rotation:90});
    const mixed = {...email,value:'נועה noa.barkan@example.com'};
    const [element] = proposalElements([mixed],image,1,rotated,measure);
    expect(element).toMatchObject({left:95/1190*100,minWidth:322/1190*100,text:mixed.value,pageIndex:1});
    expect(measure(element.text,element.fontFamily,element.fontSize)).toBeLessThan(161);
    expect(element).not.toHaveProperty('width');
  });
  it('leaves an unfit answer for manual review rather than applying overflowing text below the size floor', async () => {
    const measure = await measuredFont();
    expect(() => proposalElements([{...email,value:'W'.repeat(2000)}],image,0,geometry,measure)).toThrow('too long');
  });
});
