/**
 * What Split, Edit Pages and PDF to Image each did identically (ARCH-58): one Undo/Redo
 * history over the page plan, the one open path, the PDF filter on added files, the
 * hand-off intake and the bulk include/skip/invert actions.
 *
 * What is an island's own (its option state, the download flow reset) goes in through
 * `onPick`, which runs first on a new pick, before the history is reset to empty.
 */
import { useCallback } from 'preact/hooks';
import { isPdfFile } from '../../lib/handoff/fileKind.js';
import { includeAll, invert, planForFile, skipAll, withIncludedPages, type PlanEntry } from '../../lib/pages/pagePlan.ts';
import { useDocumentHistory } from '../../lib/history/useDocumentHistory.ts';
import { useHandoffIntake } from '../../lib/handoff/useHandoffIntake.ts';
import { recordAction } from '../../lib/telemetry/actionTrail.ts';
import type { AnalyticsTool } from '../../lib/telemetry/usageEventSchema.ts';
import type { NeedsUnlockKind } from '../NeedsUnlock.tsx';
import { useOpenPageDocument, type OpenPageDocument, type PageDocumentLoader } from './useOpenPageDocument.ts';

// The one file has one source in the shared plan.
const FILE_ID = 0;

interface PageDocument {
  plan: PlanEntry[];
}

const EMPTY_DOCUMENT: PageDocument = { plan: [] };

export interface PageToolSessionOptions {
  /** The analytics id: the history's edit events and the hand-off a tool collects. */
  tool: AnalyticsTool;
  loader: PageDocumentLoader;
  unlockKinds: readonly NeedsUnlockKind[];
  /** The tool's catalogue; `announceRestricted` is only read when `unlockKinds` names it. */
  messages: {
    announceNeedsPassword: string;
    announceRestricted?: string;
    loaded: string;
    loadFailed: string;
    undoneAnnouncement: string;
    redoneAnnouncement: string;
    allIncluded: string;
    allSkipped: string;
    inverted: string;
  };
  announce: (text: string) => void;
  /** Synchronous, on a new pick, before the history is reset: the island's own reset. */
  onPick?: (file: File) => void;
  /** Names of the files added that are not PDFs, whenever files are added. */
  onRejected?: (names: string[]) => void;
}

export type PageToolSession = ReturnType<typeof useDocumentHistory<PageDocument>> & OpenPageDocument & {
  /** One PDF opens: the first of the added files. */
  handleFilesAdded: (files: FileList | File[]) => Promise<void>;
  onIncludeAll: () => void;
  onSkipAll: () => void;
  onInvert: () => void;
  onSelectPages: (numbers: number[], options: { merge: boolean }) => void;
};

export function usePageToolSession({
  tool, loader, unlockKinds, messages, announce, onPick, onRejected,
}: PageToolSessionOptions): PageToolSession {
  const history = useDocumentHistory<PageDocument>(EMPTY_DOCUMENT, {
    tool,
    announce,
    messages: { undone: messages.undoneAnnouncement, redone: messages.redoneAnnouncement },
  });
  const { present, reset, onPlanChange } = history;
  const { plan } = present;

  // The one open path (useOpenPageDocument.ts): stale-pick guard, protection check, repaired copy.
  const document = useOpenPageDocument({
    loader,
    unlockKinds,
    messages: {
      needsPassword: messages.announceNeedsPassword,
      restricted: messages.announceRestricted,
      loaded: messages.loaded,
      loadFailed: messages.loadFailed,
    },
    announce,
    onPick: (file) => {
      onPick?.(file);
      // A new file starts a fresh document: reset (not commit) so the previous
      // file's undo/redo stacks don't leak across files.
      reset(EMPTY_DOCUMENT);
    },
    onLoaded: ({ pageCount: count }) => reset({ plan: planForFile(FILE_ID, count) }),
  });
  const { open } = document;

  const handleFilesAdded = useCallback(async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => isPdfFile(f));
    onRejected?.(incoming.filter((f) => !isPdfFile(f)).map((f) => f.name));
    if (pdfs.length === 0) return;
    await open(pdfs[0]);
  }, [open, onRejected]);

  // SITE-42 / MERGE-14: a PDF handed off from another tool (or the home page) is collected
  // on mount and dropped into the same path a manual pick takes.
  useHandoffIntake(tool, (f) => handleFilesAdded([f]));

  // A bulk action is one step, and none at all when it changes nothing.
  const bulk = (update: (current: PlanEntry[]) => PlanEntry[], message: string) => () => {
    if (update(plan) === plan) return;
    onPlanChange(update);
    recordAction('select_pages');
    announce(message);
  };

  const onSelectPages = useCallback((numbers: number[], options: { merge: boolean }) => {
    onPlanChange((current) => withIncludedPages(current, numbers), options);
  }, [onPlanChange]);

  return {
    ...history,
    ...document,
    handleFilesAdded,
    onIncludeAll: bulk(includeAll, messages.allIncluded),
    onSkipAll: bulk(skipAll, messages.allSkipped),
    onInvert: bulk(invert, messages.inverted),
    onSelectPages,
  };
}
