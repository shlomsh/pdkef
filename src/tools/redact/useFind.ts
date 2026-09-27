import { useMemo, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { findMatches, isCovered } from './find/findMatches.ts';
import { PRESET_FINDERS, termFinder } from './find/finders.ts';
import type { FindMatch, PercentBox, PresetKey } from './find/types.ts';
import usePageTexts from './usePageTexts.ts';
import type { FindRedactStyle, FindSummary } from './FindBar.tsx';

type Cover = { pageIndex: number; type: string; [field: string]: unknown };

const isBox = (cover: Cover): cover is Cover & PercentBox => (
  cover.type !== 'delete'
  && [cover.left, cover.top, cover.width, cover.height].every((value) => typeof value === 'number')
);

const NO_MATCHES: FindMatch[] = [];

/**
 * RED-02: the find panel's state. Text is read only once the panel first
 * opens. `covers` are the document's redaction boxes, so a match already
 * under one shows as done and "Redact all" skips it.
 */
export default function useFind(pdfDocument: PDFDocumentProxy | null, numPages: number, covers: readonly Cover[]) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [preset, setPreset] = useState<PresetKey | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [redactStyle, setRedactStyle] = useState<FindRedactStyle>('blackout');
  const texts = usePageTexts(pdfDocument, numPages, open);

  const finder = useMemo(() => (preset ? PRESET_FINDERS[preset] : termFinder(term)), [preset, term]);
  const matches = useMemo(
    () => (open ? findMatches(texts.pages, finder) : NO_MATCHES),
    [open, texts.pages, finder],
  );
  const coveredIds = useMemo(() => {
    const boxes = covers.filter(isBox);
    return new Set(matches.filter((match) => isCovered(match, boxes)).map((match) => match.id));
  }, [matches, covers]);

  const currentIndex = Math.max(0, matches.findIndex((match) => match.id === currentId));
  const current = matches[currentIndex] ?? null;
  const openMatches = matches.filter((match) => !coveredIds.has(match.id));

  const step = (delta: number) => {
    if (matches.length === 0) return;
    setCurrentId(matches[(currentIndex + delta + matches.length) % matches.length].id);
  };

  /** The next match after the current one that is still open, for after a redaction. */
  const nextOpenAfter = (redacted: ReadonlySet<string>) => {
    for (let i = 1; i <= matches.length; i += 1) {
      const match = matches[(currentIndex + i) % matches.length];
      if (!coveredIds.has(match.id) && !redacted.has(match.id)) return match.id;
    }
    return current?.id ?? null;
  };

  const summary: FindSummary = {
    open: openMatches.length,
    covered: coveredIds.size,
    position: current ? currentIndex + 1 : 0,
    total: matches.length,
    pages: new Set(matches.map((match) => match.pageIndex)).size,
    reading: texts.status === 'reading' ? { done: texts.pages.length, of: numPages } : null,
    failed: texts.status === 'failed',
    currentCovered: current ? coveredIds.has(current.id) : false,
  };

  const matchesOnPage = (pageIndex: number) => matches.filter((match) => match.pageIndex === pageIndex);

  return {
    open,
    setOpen,
    term,
    setTerm: (next: string) => { setTerm(next); setCurrentId(null); },
    preset,
    setPreset: (next: PresetKey | null) => { setPreset(next); setCurrentId(null); },
    redactStyle,
    setRedactStyle,
    current,
    currentId: current?.id ?? null,
    setCurrentId,
    openMatches,
    coveredIds,
    summary,
    next: () => step(1),
    prev: () => step(-1),
    nextOpenAfter,
    matchesOnPage,
  };
}
