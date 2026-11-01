import { createPortal } from 'preact/compat';
import { useMemo } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { underlineInk, UNDERLINE_LIFT, UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { notedPages } from '../lib/print/notedPages.ts';
import { printNotes } from '../lib/print/printNotes.ts';
import { END_NOTES_MARGIN } from '../lib/print/endNotes.ts';
import type { PrintNotes } from '../lib/print/printMenu.ts';
import { englishHighlightMessages } from '../messages.ts';
import { usePrintPaper } from '../hooks/usePrintPaper.ts';
import { usePageImages, usePrintPages } from '../hooks/usePrintPages.ts';
import { useMeasuredHeights } from '../hooks/useMeasuredHeights.ts';
import { useEndNotes } from '../hooks/useEndNotes.ts';
import { NOTE_FONT_PT, printPlan, type PagePrintPlan, type PrintNote } from '../lib/print/printPlan.ts';
import styles from './PrintSheets.module.css';

interface Props {
  pdfDocument: PDFDocumentProxy;
  elements: EditorElement[];
  /** 'beside' puts each comment in a column next to its page, 'end' lists them on sheets after the pages, 'none' prints the pages alone. */
  notes: PrintNotes;
  /** Quarter turns a person gave each page; a turned sheet is drawn and sized turned. Marks are stored in percent of the turned page. */
  pageTurns?: PageTurns;
  /** Once every page image has loaded and the sheets are laid out: the moment to call `window.print()`. */
  onReady(): void;
}

type NoteSeed = Omit<PrintNote, 'height'>;

const NO_TURNS: PageTurns = {};

const pt = (value: number) => `${value}pt`;

/** The bands of one highlight as percents of the page, so they sit in the page box without the element's own box. */
function pageBands(highlight: HighlightElement) {
  return highlight.bands.map((band) => ({
    left: highlight.left + (band.left * highlight.width) / 100,
    top: highlight.top + (band.top * highlight.height) / 100,
    width: (band.width * highlight.width) / 100,
    height: (band.height * highlight.height) / 100,
  }));
}

/** An underline's width and lift are in PDF points, drawn as CSS px at full size; it shrinks with the page by `pageScale`. */
function Highlights({ highlights, pageScale }: { highlights: HighlightElement[]; pageScale: number }) {
  return (
    <>
      {highlights.map((highlight) => {
        const underline = highlight.style === 'underline';
        const ink = underline ? underlineInk(highlight.color) : undefined;
        return (
          <div key={highlight.id} class={styles.layer} style={highlight.opacity === undefined ? undefined : { opacity: highlight.opacity }}>
            {pageBands(highlight).map((band, i) => (
              <div
                key={i}
                data-print-band
                class={underline ? `${styles.band} ${styles.underline}` : styles.band}
                style={{
                  left: `${band.left}%`, top: `${band.top}%`, width: `${band.width}%`, height: `${band.height}%`,
                  ...(underline ? { '--highlight-ink': ink, '--line': `${(highlight.strokeWidth ?? UNDERLINE_WIDTH.default) * pageScale}px`, '--lift': `${UNDERLINE_LIFT * pageScale}px` } : { background: highlight.color }),
                }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

const markVar = (color: string | undefined): Record<string, string> => (color ? { '--mark': color } : {});

/** Each highlight comment's id to its highlight's color. */
function markColors(elements: EditorElement[]) {
  const colors = new Map(elements.flatMap((el) => (el.type === 'highlight' ? [[el.id, el.color] as const] : [])));
  return new Map(elements.flatMap((el) => {
    const color = el.type === 'comment' && el.anchor.kind === 'element' ? colors.get(el.anchor.elementId) : undefined;
    return color ? [[el.id, color] as const] : [];
  }));
}

function Card({ text, style, ...rest }: { text: string; class?: string; style?: Record<string, string>; [attr: string]: unknown }) {
  return <div data-print-card dir="auto" {...rest} style={{ fontSize: pt(NOTE_FONT_PT), ...style }} class={`${styles.card} ${rest.class ?? ''}`.trim()}>{text}</div>;
}

/** A comment on a notes-at-the-end sheet: its page, then the note in the beside card's look. */
function EndEntry({ note, text, color }: { note: NoteSeed; text: string; color: string | undefined }) {
  return (
    <div data-print-end-entry data-note-id={note.id} class={`${styles.card} ${styles.endEntry}`} style={{ fontSize: pt(NOTE_FONT_PT), ...markVar(color) }}>
      <div class={styles.endLabel}>{formatMessage(englishSignMessages.pageLabel, { number: note.page + 1 })}</div>
      <div dir="auto">{text}</div>
    </div>
  );
}

function Sheet({ plan, pageName, turns, image, highlights, texts, marks, onSettled }: {
  plan: PagePrintPlan;
  /** The named @page that sizes this sheet's paper. */
  pageName?: string;
  /** Quarter turns of this page; the printed underline sits on the text's bottom edge, which turns with it. */
  turns: 0 | 1 | 2 | 3;
  image: string;
  highlights: HighlightElement[];
  texts: ReadonlyMap<string, string>;
  marks: ReadonlyMap<string, string>;
  onSettled(): void;
}) {
  const { sheet, pageBox, notesBox, pageScale } = plan;
  return (
    <section data-print-sheet data-page-turns={turns || undefined} class={styles.sheet} style={{ width: pt(sheet.width), height: pt(sheet.height), page: pageName }}>
      <div
        class={styles.pageBox}
        style={{ left: pt(pageBox.x), top: pt(pageBox.y), width: pt(pageBox.width), height: pt(pageBox.height) }}
      >
        <img class={styles.pageImage} src={image} alt="" onLoad={onSettled} onError={onSettled} />
        <Highlights highlights={highlights} pageScale={pageScale} />
      </div>
      {notesBox && (
        <div class={styles.notes} style={{ left: pt(notesBox.x), top: pt(notesBox.y), width: pt(notesBox.width), height: pt(notesBox.height) }}>
          {plan.cards.map((card) => (
            <Card key={card.id} text={texts.get(card.id) ?? ''} class={styles.placed} style={{ top: pt(card.top), ...markVar(marks.get(card.id)) }} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * READ-06: the document as printable sheets, mounted on the body outside the app. Each page is a
 * canvas-rendered image at twice its printed size with its highlights drawn as plain bands over it;
 * with notes the page shrinks and each highlight's comment stands in a column beside it, placed by
 * `printPlan` after the cards are measured at their real width. Hidden on screen, the only thing
 * shown in print (see the module's @media print rules).
 */
export default function PrintSheets({ pdfDocument, elements, notes, pageTurns = NO_TURNS, onReady }: Props) {
  const withNotes = notes === 'beside';

  // Only a page that carries a note needs its ink read; the rest print whole.
  const pages = usePrintPages(pdfDocument, pageTurns, withNotes ? notedPages(elements) : null);

  const { sheet: endSheet, entries: endEntries, measure: endMeasure, pages: endPages } = useEndNotes(notes, pages, pageTurns, elements);
  const paperSheets = useMemo(() => (endSheet ? [...pages, endSheet] : pages), [pages, endSheet]);
  const pageNames = usePrintPaper(paperSheets);

  const basePlan = useMemo(() => printPlan(pages, withNotes ? [] : null), [pages, withNotes]);

  const { images, onSettled } = usePageImages(pdfDocument, pages, basePlan, pageTurns, onReady);

  const seeds = useMemo(() => (withNotes && pages.length > 0 ? printNotes(elements, pages) : null), [withNotes, elements, pages]);
  const marks = markColors(elements);
  const texts = useMemo(() => new Map(elements.flatMap((el) => (el.type === 'comment' ? [[el.id, el.comment] as const] : []))), [elements]);

  // Cards are measured hidden at the notes width, then handed to printPlan.
  const measure = useMeasuredHeights(seeds);

  const plans = useMemo(() => {
    if (pages.length === 0) return null;
    if (seeds === null) return printPlan(pages, null);
    if (seeds.length === 0) return printPlan(pages, []);
    const heights = measure.heights;
    if (!heights) return null;
    return printPlan(pages, seeds.map((n) => ({ ...n, height: heights.get(n.id) ?? 0 })));
  }, [pages, seeds, measure.heights]);

  const highlightsOf = (pageIndex: number) =>
    elements.filter((el): el is HighlightElement => el.type === 'highlight' && el.pageIndex === pageIndex);

  return createPortal(
    <div data-print-root class={styles.root}>
      {measure.needs && seeds && (
        <div ref={measure.ref} data-print-measure class={styles.measure}>
          {pages.map((_, pageIndex) => {
            const box = basePlan[pageIndex]?.notesBox;
            return (
              <div key={pageIndex} style={{ width: box ? pt(box.width) : undefined }}>
                {seeds.filter((n) => n.page === pageIndex).map((n) => (
                  <Card key={n.id} text={texts.get(n.id) ?? ''} data-note-id={n.id} />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {endMeasure.needs && endEntries && endSheet && (
        <div ref={endMeasure.ref} data-print-measure class={styles.measure} style={{ width: pt(endSheet.width - 2 * END_NOTES_MARGIN) }}>
          {endEntries.map((n) => <EndEntry key={n.id} note={n} text={texts.get(n.id) ?? ''} color={marks.get(n.id)} />)}
        </div>
      )}
      {plans && images && plans.map((plan, i) => (
        <Sheet key={i} plan={plan} pageName={pageNames[i]} turns={turnsOf(pageTurns, i)} image={images[i]} highlights={highlightsOf(i)} texts={texts} marks={marks} onSettled={() => onSettled(i)} />
      ))}
      {plans && images && endSheet && endPages.map((entries, i) => (
        <section key={`notes-${i}`} data-print-sheet data-print-notes-sheet class={`${styles.sheet} ${styles.endSheet}`} style={{ width: pt(endSheet.width), height: pt(endSheet.height), page: pageNames[pages.length] }}>
          {i === 0 && <h2 class={styles.endHeading}>{englishHighlightMessages.printNotesHeading}</h2>}
          {entries.map((n) => <EndEntry key={n.id} note={n} text={texts.get(n.id) ?? ''} color={marks.get(n.id)} />)}
        </section>
      ))}
    </div>,
    document.body,
  );
}
