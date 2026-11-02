// Composed pages for the layout corpus (READ-10): layouts no licence-clean paper had in one place (a
// right-to-left two-column page, a spanning heading mid-page, a drop cap, a pull quote), set with pdf-lib
// in fonts the repo already ships (OFL) and text written for this corpus. Dev time only, like build-pages.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const W = 612;
const H = 792;
const MARGIN = 54;
const GUTTER = 24;
const BLACK = rgb(0.07, 0.07, 0.07);

const ENGLISH = [
  'Reading on paper and reading on a screen ask different things of the hand. A pencil rests where the eye rests, and a mark made in the margin stays beside the line that earned it. On a screen the same mark has to find its line first, and the page has to tell it where the lines are.',
  'A scanned page tells it nothing. The letters are only ink, set on paper that was never quite square to the glass, with dust from the lid and a shadow along the spine. Every line has to be found again from the ink alone, and found the same way each time the reader comes back.',
  'Columns make this harder. Two lines that sit side by side belong to different paragraphs, and a mark that runs from one into the other joins sentences nobody wrote together. The gap between them is the only sign of the boundary, and on a poor copy that gap can hold a speck of dust.',
  'Headings that cross both columns break the pattern again. Above them the page reads down the left column and then the right; below them it starts over. A reader who knows this does not think about it, and a tool that marks text should not make anyone think about it either.',
  'Footnotes, figures and tables each bring their own rhythm. A caption is set smaller than the text around it, a table lines its cells up in rows that are not sentences, and a footnote sits at the foot of its column in type small enough to make a careless reader merge two of its lines into one.',
  'None of this is new. Printers solved it with rules and white space centuries ago, and readers learned to see the structure without being told. What is new is asking a small program to see it too, quickly, on a phone, from a photograph of a page that was itself a copy of a copy.',
];

const HEBREW = [
  'קריאה על נייר וקריאה על מסך מבקשות דברים שונים מהיד. העיפרון נח במקום שבו העין נחה, וסימון בשוליים נשאר ליד השורה שבזכותה נעשה. על המסך אותו סימון צריך קודם למצוא את השורה שלו.',
  'עמוד סרוק אינו מספר דבר. האותיות הן רק דיו על נייר שמעולם לא שכב ישר על הזכוכית, עם אבק מהמכסה וצל לאורך הכריכה. כל שורה צריכה להימצא מחדש מהדיו בלבד, ובאותה דרך בכל פעם.',
  'טורים מקשים עוד יותר. שתי שורות שעומדות זו ליד זו שייכות לפסקאות שונות, וסימון שעובר מאחת לשנייה מחבר משפטים שאיש לא כתב יחד. הרווח ביניהן הוא הסימן היחיד לגבול, ובעותק גרוע הוא יכול להכיל גרגר אבק.',
  'כותרת שחוצה את שני הטורים שוברת את הדפוס שוב. מעליה קוראים את הטור הימני ואחריו את השמאלי, ומתחתיה מתחילים מחדש. קורא שמכיר את זה לא חושב על כך, וכלי שמסמן טקסט לא צריך לגרום לאיש לחשוב על כך.',
  'הערות שוליים, איורים וטבלאות מביאים כל אחד קצב משלו. כיתוב קטן מהטקסט שסביבו, טבלה מסדרת תאים בשורות שאינן משפטים, והערה יושבת בתחתית הטור באות קטנה דיה כדי שקורא חפוז יאחד שתיים משורותיה.',
];

/** Greedy line breaking of `words` into lines no wider than `width`. */
function breakLines(words, font, size, width) {
  const lines = [];
  let line = [];
  for (const word of words) {
    const next = [...line, word].join(' ');
    if (line.length && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = [word];
    } else line.push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

/**
 * Sets paragraphs into one column from `top` down to `bottom`, justified except each paragraph's last line.
 * rtl lays each line from the column's right edge, words right to left. Returns where it stopped.
 */
function setColumn(page, { paras, font, size, leading, x0, x1, top, bottom, rtl = false, indentFirst = 0, dropCap = null, start = { para: 0, word: 0 } }) {
  let y = top + size;
  let { para, word } = start;
  let capLines = 0;
  while (para < paras.length && y <= bottom) {
    const words = paras[para].split(' ').slice(word);
    let inset = word === 0 && para > 0 ? indentFirst : 0;
    if (dropCap && para === 0 && word === 0 && !capLines) {
      const cap = words[0][0];
      const capWidth = dropCap.font.widthOfTextAtSize(cap, dropCap.size);
      page.drawText(cap, { x: x0, y: H - (y + (dropCap.lines - 1) * leading), size: dropCap.size, font: dropCap.font, color: BLACK });
      words[0] = words[0].slice(1);
      capLines = dropCap.lines;
      dropCap.inset = capWidth + 4;
    }
    const lineInset = () => (capLines > 0 ? dropCap.inset : inset);
    const width = x1 - x0 - lineInset();
    const lines = breakLines(words, font, size, width);
    const line = lines[0];
    const last = lines.length === 1;
    const natural = line.reduce((sum, w) => sum + font.widthOfTextAtSize(w, size), 0);
    const space = font.widthOfTextAtSize(' ', size);
    const gap = last || line.length < 2 ? space : (width - natural) / (line.length - 1);
    let x = rtl ? x1 - lineInset() : x0 + lineInset();
    for (const w of line) {
      const ww = font.widthOfTextAtSize(w, size);
      page.drawText(w, { x: rtl ? x - ww : x, y: H - y, size, font, color: BLACK });
      x += rtl ? -(ww + gap) : ww + gap;
    }
    if (capLines > 0) capLines -= 1;
    inset = 0;
    y += leading;
    if (last) {
      para += 1;
      word = 0;
    } else word += line.length;
  }
  return { para, word, y: y - leading };
}

const paragraphs = (base, count) => Array.from({ length: count }, (_, i) => base[i % base.length]);

/** Two columns, a running head, a spanning heading mid-page, a drop cap, a pull quote, a figure and a footnote. */
function features(doc, fonts) {
  const page = doc.addPage([W, H]);
  const { regular, bold, italic } = fonts;
  const colW = (W - 2 * MARGIN - GUTTER) / 2;
  const left = [MARGIN, MARGIN + colW];
  const right = [MARGIN + colW + GUTTER, W - MARGIN];
  const body = { font: regular, size: 10, leading: 12.5, indentFirst: 12 };
  page.drawText('Notes on Reading · Margins and Columns', { x: MARGIN, y: H - 40, size: 8.5, font: italic, color: BLACK });
  page.drawText('Spring 2026', { x: W - MARGIN - italic.widthOfTextAtSize('Spring 2026', 8.5), y: H - 40, size: 8.5, font: italic, color: BLACK });
  page.drawLine({ start: { x: MARGIN, y: H - 45 }, end: { x: W - MARGIN, y: H - 45 }, thickness: 0.6, color: BLACK });
  const title = 'Where the Lines Are';
  page.drawText(title, { x: (W - bold.widthOfTextAtSize(title, 18)) / 2, y: H - 80, size: 18, font: bold, color: BLACK });
  // Zone 1: the drop cap opens the left column, the pull quote interrupts the right one.
  const paras = paragraphs(ENGLISH, 12);
  let at = setColumn(page, { ...body, paras, x0: left[0], x1: left[1], top: 100, bottom: 330, dropCap: { font: bold, size: 33, lines: 3 } });
  at = setColumn(page, { ...body, paras, x0: right[0], x1: right[1], top: 100, bottom: 190, start: at });
  page.drawLine({ start: { x: right[0] + 10, y: H - 202 }, end: { x: right[1] - 10, y: H - 202 }, thickness: 0.8, color: BLACK });
  const quote = ['“The gap between them is', 'the only sign of the', 'boundary.”'];
  quote.forEach((q, i) => page.drawText(q, { x: right[0] + (colW - italic.widthOfTextAtSize(q, 14)) / 2, y: H - (222 + i * 17), size: 14, font: italic, color: BLACK }));
  page.drawLine({ start: { x: right[0] + 10, y: H - 268 }, end: { x: right[1] - 10, y: H - 268 }, thickness: 0.8, color: BLACK });
  at = setColumn(page, { ...body, paras, x0: right[0], x1: right[1], top: 280, bottom: 330, start: at });
  // A heading spanning both columns, two lines below the zone: the R33 failure.
  const heading = '2. Columns, Captions and the Space Between';
  page.drawText(heading, { x: (W - bold.widthOfTextAtSize(heading, 13)) / 2, y: H - 356, size: 13, font: bold, color: BLACK });
  // Zone 2: a figure in the left column, a footnote at the foot of the right one.
  at = setColumn(page, { ...body, paras, x0: left[0], x1: left[1], top: 372, bottom: 470, start: at });
  page.drawRectangle({ x: left[0] + 6, y: H - 590, width: colW - 12, height: 105, borderColor: BLACK, borderWidth: 0.8 });
  for (let i = 0; i < 6; i += 1) page.drawRectangle({ x: left[0] + 22 + i * 38, y: H - 580, width: 18, height: 12 + i * 13, color: BLACK });
  const caption = ['Figure 1. Marks per page, by condition. Readers', 'with a budget marked fewer, longer passages.'];
  caption.forEach((c, i) => page.drawText(c, { x: left[0], y: H - (604 + i * 10.5), size: 8.5, font: regular, color: BLACK }));
  at = setColumn(page, { ...body, paras, x0: left[0], x1: left[1], top: 625, bottom: 735, start: at });
  at = setColumn(page, { ...body, paras, x0: right[0], x1: right[1], top: 372, bottom: 690, start: at });
  page.drawLine({ start: { x: right[0], y: H - 704 }, end: { x: right[0] + 60, y: H - 704 }, thickness: 0.5, color: BLACK });
  const foot = ['1 The readers were students of art and psychology, who', 'took part between lectures and were thanked with coffee.'];
  foot.forEach((f, i) => page.drawText(f, { x: right[0], y: H - (716 + i * 9.5), size: 7.5, font: regular, color: BLACK }));
  page.drawText('7', { x: W / 2 - 3, y: H - 765, size: 9, font: regular, color: BLACK });
}

/** Two right-to-left columns under a spanning title, with a spanning heading between two zones. */
function hebrew(doc, fonts) {
  const page = doc.addPage([W, H]);
  const { he, heBold } = fonts;
  const colW = (W - 2 * MARGIN - GUTTER) / 2;
  const first = [W - MARGIN - colW, W - MARGIN];
  const second = [MARGIN, MARGIN + colW];
  const body = { font: he, size: 11, leading: 14, rtl: true, indentFirst: 12 };
  const title = 'איפה השורות';
  page.drawText(title, { x: (W - heBold.widthOfTextAtSize(title, 20)) / 2, y: H - 72, size: 20, font: heBold, color: BLACK });
  const paras = paragraphs(HEBREW, 24);
  let at = setColumn(page, { ...body, paras, x0: first[0], x1: first[1], top: 96, bottom: 380 });
  at = setColumn(page, { ...body, paras, x0: second[0], x1: second[1], top: 96, bottom: 380, start: at });
  const heading = 'טורים, כיתובים והרווח שביניהם';
  page.drawText(heading, { x: (W - heBold.widthOfTextAtSize(heading, 14)) / 2, y: H - 408, size: 14, font: heBold, color: BLACK });
  at = setColumn(page, { ...body, paras, x0: first[0], x1: first[1], top: 424, bottom: 730, start: at });
  setColumn(page, { ...body, paras, x0: second[0], x1: second[1], top: 424, bottom: 730, start: at });
  page.drawText('8', { x: W / 2 - 3, y: H - 765, size: 9, font: he, color: BLACK });
}

export const COMPOSED = { features, hebrew };

/** Writes one composed page to `<outDir>/<name>.pdf` and returns its path. */
export async function composePage(name, fontDir, outDir) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const load = (file) => doc.embedFont(fs.readFileSync(path.join(fontDir, file)), { subset: true });
  const fonts = {
    regular: await load('Tinos-Regular.ttf'),
    bold: await load('Tinos-Bold.ttf'),
    italic: await load('Tinos-Italic.ttf'),
    he: await load('Alef-Regular.ttf'),
    heBold: await load('Alef-Bold.ttf'),
  };
  COMPOSED[name](doc, fonts);
  doc.setCreationDate(new Date('2026-11-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-11-01T00:00:00Z'));
  const file = path.join(outDir, `${name}.pdf`);
  fs.writeFileSync(file, await doc.save({ useObjectStreams: false }));
  return file;
}
