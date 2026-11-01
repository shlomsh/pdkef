import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { underlineInk, UNDERLINE_LIFT, UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { readInkBounds } from '../hooks/readInkBounds.ts';
import { turnedPageBox } from '../lib/zoom/turnedBox.ts';
import { printNotes } from '../lib/print/printNotes.ts';
import { usePrintPaper } from '../hooks/usePrintPaper.ts';
import { NOTE_FONT_PT, printPlan, type PagePrintPlan, type PrintNote, type PrintPage } from '../lib/print/printPlan.ts';
import styles from './PrintSheets.module.css';

interface Props {
  pdfDocument: PDFDocumentProxy;
  elements: EditorElement[];
  withNotes: boolean;
  /** Quarter turns a person gave each page; a turned sheet is drawn and sized turned. Marks are stored in percent of the turned page. */
  pageTurns?: PageTurns;
  /** Once every page image has loaded and the sheets are laid out: the moment to call `window.print()`. */
  onReady(): void;
}

type NoteSeed = Omit<PrintNote, 'height'>;

/** Pages are drawn at twice their printed size so a sheet stays sharp on paper. */
const PRINT_OVERSAMPLE = 2;
const CSS_PX_PER_PT = 96 / 72;

const NO_TURNS: PageTurns = {};

/** pdf.js rotation for a page: its own /Rotate plus the person's turns. */
const turnedRotation = (page: { rotate?: number }, turns: PageTurns, index: number) =>
  (((page.rotate ?? 0) + 90 * turnsOf(turns, index)) % 360 + 360) % 360;

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

function Sheet({ plan, pageName, image, highlights, texts, marks, onSettled }: {
  plan: PagePrintPlan;
  /** The named @page that sizes this sheet's paper. */
  pageName?: string;
  image: string;
  highlights: HighlightElement[];
  texts: ReadonlyMap<string, string>;
  marks: ReadonlyMap<string, string>;
  onSettled(): void;
}) {
  const { sheet, pageBox, notesBox, pageScale } = plan;
  return (
    <section data-print-sheet class={styles.sheet} style={{ width: pt(sheet.width), height: pt(sheet.height), page: pageName }}>
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
export default function PrintSheets({ pdfDocument, elements, withNotes, pageTurns = NO_TURNS, onReady }: Props) {
  const [pages, setPages] = useState<PrintPage[]>([]);
  const [images, setImages] = useState<string[] | null>(null);
  const [measured, setMeasured] = useState<{ notes: NoteSeed[]; heights: ReadonlyMap<string, number> } | null>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const settled = useRef(new Set<number>());
  const fired = useRef<string[] | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Page sizes in points.
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const sizes: PrintPage[] = [];
        // The zoom code's ink read, applied to the pages that read upright (or upside down) as shown.
        const ink = withNotes ? await readInkBounds(pdfDocument, () => current, pageTurns).catch(() => null) : null;
        if (!current) return;
        for (let n = 1; n <= pdfDocument.numPages; n++) {
          const page = await pdfDocument.getPage(n);
          const rotation = turnedRotation(page, pageTurns, n - 1);
          const { width, height } = page.getViewport({ scale: 1, rotation });
          if (!ink || rotation % 180 !== 0) { sizes.push({ width, height }); continue; }
          const box = turnedPageBox({ width, height }, rotation / 90, ink);
          sizes.push({ width, height, inkLeft: box.textLeft, inkRight: box.textRight });
        }
        if (current) setPages(sizes);
      } catch (error) {
        if (current) reportError('pdf_render', error, 'print_page_sizes');
      }
    })();
    return () => { current = false; };
  }, [pdfDocument, pageTurns, withNotes]);

  const pageNames = usePrintPaper(pages);

  const basePlan = useMemo(() => printPlan(pages, withNotes ? [] : null), [pages, withNotes]);

  // Page images, each at 2x of its printed size.
  useEffect(() => {
    if (pages.length === 0) return undefined;
    let current = true;
    setImages(null);
    (async () => {
      try {
        const urls: string[] = [];
        for (let i = 0; i < pages.length; i++) {
          const scale = PRINT_OVERSAMPLE * (basePlan[i].pageBox.width / pages[i].width) * CSS_PX_PER_PT;
          const page = await pdfDocument.getPage(i + 1);
          const canvas = await renderPageToCanvas(page, { scale, rotation: turnedRotation(page, pageTurns, i) });
          urls.push(canvas.toDataURL('image/png'));
          canvas.width = 0;
          if (!current) return;
        }
        settled.current = new Set();
        setImages(urls);
      } catch (error) {
        if (current) reportError('pdf_render', error, 'print_render');
      }
    })();
    return () => { current = false; };
  }, [pdfDocument, pages, basePlan, pageTurns]);

  const seeds = useMemo(() => (withNotes && pages.length > 0 ? printNotes(elements, pages) : null), [withNotes, elements, pages]);
  const marks = markColors(elements);
  const texts = useMemo(() => new Map(elements.flatMap((el) => (el.type === 'comment' ? [[el.id, el.comment] as const] : []))), [elements]);

  // Cards are measured hidden at the notes width, then handed to printPlan.
  const needsMeasure = seeds !== null && seeds.length > 0 && measured?.notes !== seeds;
  useLayoutEffect(() => {
    if (!needsMeasure || !seeds || !measureRef.current) return;
    const heights = new Map<string, number>();
    measureRef.current.querySelectorAll<HTMLElement>('[data-print-card]').forEach((card) => {
      heights.set(card.dataset.noteId ?? '', (card.offsetHeight * 72) / 96);
    });
    setMeasured({ notes: seeds, heights });
  }, [needsMeasure, seeds]);

  const plans = useMemo(() => {
    if (pages.length === 0) return null;
    if (seeds === null) return printPlan(pages, null);
    if (seeds.length === 0) return printPlan(pages, []);
    if (measured?.notes !== seeds) return null;
    return printPlan(pages, seeds.map((n) => ({ ...n, height: measured.heights.get(n.id) ?? 0 })));
  }, [pages, seeds, measured]);

  const onSettled = (index: number) => {
    settled.current.add(index);
    if (images && settled.current.size === images.length && fired.current !== images) {
      fired.current = images;
      onReadyRef.current();
    }
  };

  const highlightsOf = (pageIndex: number) =>
    elements.filter((el): el is HighlightElement => el.type === 'highlight' && el.pageIndex === pageIndex);

  return createPortal(
    <div data-print-root class={styles.root}>
      {needsMeasure && seeds && (
        <div ref={measureRef} data-print-measure class={styles.measure}>
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
      {plans && images && plans.map((plan, i) => (
        <Sheet key={i} plan={plan} pageName={pageNames[i]} image={images[i]} highlights={highlightsOf(i)} texts={texts} marks={marks} onSettled={() => onSettled(i)} />
      ))}
    </div>,
    document.body,
  );
}
