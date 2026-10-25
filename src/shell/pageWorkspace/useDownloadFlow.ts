import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { OutputPart, PreparedOutput } from '../../lib/usePreparedOutput.ts';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import type { DownloadElementState } from '../DownloadElement.tsx';

export type HandoffTool = 'compress' | 'sign';

export interface DownloadFlowInput {
  prepared: Pick<PreparedOutput, 'status' | 'blob' | 'url' | 'parts' | 'generation' | 'prepareNow'>;
  fileName: string;
  hrefs: Record<HandoffTool, string>;
  /** Why Download cannot run at all: too few files, or a file/build error. */
  blocked: 'one-file' | 'error' | null;
  /** The plan leaves no page to export (every page skipped). */
  nothing?: boolean;
  announce: (message: string) => void;
  messages: { ready: string; shared: string; canceled: string; shareError: string };
  /** Called when a tap delivers the result (the tool's "done" moment). */
  onDelivered?: () => void;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

/* Pure: the state the Download element shows. A blocked tool wins, then an
   empty output ('nothing'); a ready
   output is 'saved' once delivered; otherwise a tap that beat the build is
   'preparing' and everything else keeps the ready look (quiet means quiet). */
export function decideDownloadState(
  blocked: DownloadFlowInput['blocked'],
  status: PreparedOutput['status'],
  downloadedOnce: boolean,
  pendingDownload: boolean,
  nothing = false,
): DownloadElementState {
  if (blocked) return blocked;
  if (nothing) return 'nothing';
  if (status === 'ready') return downloadedOnce ? 'saved' : 'ready';
  // Quiet means quiet: while the build waits or runs, Download keeps its ready look.
  // 'preparing' is for a tap that beat the build, or files still being read.
  return status === 'pending' && !pendingDownload ? 'ready' : 'preparing';
}

const PART_GAP_MS = 200;
const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** Saves a multi-file output: the first part at once, the rest `PART_GAP_MS`
 * apart so the browser does not drop the later downloads. */
export async function deliverParts(
  parts: OutputPart[],
  download: (blob: Blob, filename: string) => void,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) await wait(PART_GAP_MS);
    download(parts[i].blob, parts[i].filename);
  }
}

const opensStrip = () => window.matchMedia('(max-width: 1023px)').matches;

/** The finish flow both page tools share: Download (prepared in the
 * background), the phone's done strip, hand-offs to Compress/Sign, Share. */
export function useDownloadFlow(input: DownloadFlowInput) {
  const { prepared, fileName, hrefs, blocked, nothing, announce, messages, onDelivered } = input;
  const navigate = input.navigate ?? ((href: string) => { window.location.href = href; });
  /* MERGE-12 analytics: the person's intent is the Download tap; the
     speculative background build is not counted. See ANALYTICS.md. */
  const [tap, setTap] = useState<'idle' | 'processing' | 'done'>('idle');
  const [pendingDownload, setPendingDownload] = useState(false);
  // MERGE-24 (2026-10-23): the phone done strip under the sticky bar. Only the
  // quiet Download opens it; a quiet tap that beat the build is remembered in
  // the ref until the pending download is delivered.
  const [stripOpen, setStripOpen] = useState(false);
  const quietPendingRef = useRef(false);
  // Only the person's Download tap, not the speculative background build.
  useHoldUpdate(tap === 'processing');
  const [downloadedOnce, setDownloadedOnce] = useState(false);
  const { shareReady, prepare, prepareFiles, clearPrepared, sharePrepared, download } = usePdfShare();
  /* MERGE-14: hand the result to Compress or Sign without re-picking. */
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();
  const [handoffFailed, setHandoffFailed] = useState(false);
  // DEBT-19: reset() (a new file was picked) bumps this so a hand-off still saving never navigates.
  const handoffRunRef = useRef(0);

  // Once the output is ready, any subsequent edit takes the Download element
  // back through preparing -> ready; this only has to stop pretending a stale
  // "saved" still applies to the new blob.
  useEffect(() => {
    if (prepared.status !== 'ready') {
      setDownloadedOnce(false);
      setHandoffFailed(false);
    }
  }, [prepared.status]);

  // A fresh blob is what Share hands out; an invalidated one is cleared so
  // the sheet never offers a stale order.
  useEffect(() => {
    if (prepared.status === 'ready' && prepared.parts) {
      prepareFiles(prepared.parts.map((part) => ({ blob: part.blob, filename: part.filename, type: part.blob.type || 'application/pdf' })));
    } else if (prepared.status === 'ready' && prepared.blob) prepare(prepared.blob, fileName);
    else clearPrepared();
  }, [prepared.status, prepared.generation, fileName]);

  // The tap arrived while the background build was still running: deliver the blob
  // (or every part) the moment it exists, through the same download path Share uses.
  useEffect(() => {
    if (!pendingDownload || prepared.status !== 'ready' || !(prepared.blob || prepared.parts)) return;
    setPendingDownload(false);
    if (quietPendingRef.current) {
      quietPendingRef.current = false;
      setStripOpen(true);
    }
    if (prepared.parts) void deliverParts(prepared.parts, download);
    else if (prepared.blob) download(prepared.blob, fileName);
    setTap('done');
    setDownloadedOnce(true);
    onDelivered?.();
    announce(messages.ready);
  }, [pendingDownload, prepared.status, prepared.generation]);

  // MERGE-14: park the output bytes for the target tool and navigate. The
  // draft stays (MERGE-13), so Back returns to the same set.
  //
  // MEM-01/02: this used to ask first and, on confirmation, delete Sign's
  // existing draft before handing off - a holdover from the old one-slot-per-tool
  // model, where opening a second file in Sign meant overwriting the only
  // draft it could hold. Under the entry model every source PDF (content hash)
  // keeps its own `work` map, so claiming this hand-off in Sign
  // (useEditorDraftPersistence's beforeRestore -> cacheRecentFile) just moves
  // Sign's pointer to the output's own entry; whatever Sign was
  // previously pointed at, and its work, is untouched. Nothing here needs to
  // discard anything, so there is nothing left to confirm.
  const performHandoff = useCallback(async (tool: HandoffTool) => {
    if (!prepared.blob) return;
    const run = ++handoffRunRef.current;
    setHandoffBusy(true);
    setHandoffFailed(false);
    try {
      // The store is only needed once a result is being handed off, so it
      // stays out of the eager graph like the grid and the draft hook.
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      const saved = await saveHandoff(tool, {
        fileName,
        fileType: 'application/pdf',
        fileBytes: await prepared.blob.arrayBuffer(),
      });
      if (run !== handoffRunRef.current) {
        setHandoffBusy(false);
        return;
      }
      if (!saved) throw new Error('handoff');
      navigate(hrefs[tool]);
    } catch {
      // expected: saveHandoff reports its own failure, this shows the handoffFailed state
      setHandoffFailed(true);
      setHandoffBusy(false);
    }
  }, [prepared.blob, fileName, hrefs.compress, hrefs.sign]);

  const requestHandoff = useCallback(async (tool: HandoffTool) => {
    if (handoffBusy || !prepared.blob) return;
    await performHandoff(tool);
  }, [handoffBusy, prepared.blob, performHandoff]);

  const onDownloadTap = useCallback(() => {
    setTap('processing');
    setDownloadedOnce(true);
    onDelivered?.();
    announce(messages.ready);
    recordAction('download');
  }, [messages.ready, onDelivered, announce]);

  // One page's image saved from its own cell: counted like a Download tap, but
  // the Download element stays as it was (it did not save the whole output).
  const onPartSaved = useCallback(() => {
    setTap('processing');
    recordAction('download');
  }, []);

  // The tap beat the quiet-time build: show 'preparing', build now, deliver on ready.
  const onPreparingTap = useCallback(() => {
    setTap('processing');
    setPendingDownload(true);
    prepared.prepareNow();
  }, [prepared.prepareNow]);

  // The quiet Download's taps, which also open the done strip below 1024px.
  const onQuietDownloadTap = useCallback(() => {
    onDownloadTap();
    if (opensStrip()) setStripOpen(true);
  }, [onDownloadTap]);
  // The completion row's own preparing tap never opens the strip, whatever an earlier quiet tap left.
  const onRowPreparingTap = useCallback(() => {
    quietPendingRef.current = false;
    onPreparingTap();
  }, [onPreparingTap]);
  const onQuietPreparingTap = useCallback(() => {
    quietPendingRef.current = opensStrip();
    onPreparingTap();
  }, [onPreparingTap]);

  // A tap on a ready Download: 'processing' renders once so BasePdfTool reports
  // tool_operation_started, then 'done' reports tool_result_ready.
  useEffect(() => {
    if (tap === 'processing' && !pendingDownload && prepared.status === 'ready') setTap('done');
  }, [tap, pendingDownload, prepared.status]);

  const handleShare = async () => {
    const result = await sharePrepared();
    // A completed Share counts like a Download tap (ANALYTICS.md); the effect above settles it to 'done'.
    if (result.status === 'shared') setTap('processing');
    if (result.status === 'shared') recordAction('share');
    if (result.status === 'shared') announce(messages.shared);
    else if (result.status === 'canceled') announce(messages.canceled);
    else if (result.status === 'error') announce(messages.shareError);
  };

  const downloadState = decideDownloadState(blocked, prepared.status, downloadedOnce, pendingDownload, nothing);
  // The strip belongs to the saved output; any change or clear closes it.
  const showStrip = stripOpen && downloadState === 'saved';
  // Only leaving 'saved' closes it: a tap that beat the build opens the strip in the very commit
  // that moves 'ready' to 'saved', and that commit must not close it again.
  const prevDownloadStateRef = useRef(downloadState);
  useEffect(() => {
    if (prevDownloadStateRef.current === 'saved' && downloadState !== 'saved') setStripOpen(false);
    prevDownloadStateRef.current = downloadState;
  }, [downloadState]);
  // The sticky bar (and the strip in it) is hidden from 1024px: close the strip when the window widens past it.
  useEffect(() => {
    if (!showStrip) return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => { if (!mq.matches) setStripOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [showStrip]);
  // The same condition DownloadElement uses for its link (`isLink`).
  const downloadLinkReady = (downloadState === 'ready' || downloadState === 'saved') && prepared.status === 'ready' && !!prepared.url;

  // What Clear all clears: the shared finish-flow state and the Share blob.
  const reset = useCallback(() => {
    clearPrepared();
    handoffRunRef.current += 1;
    setTap('idle');
    setPendingDownload(false);
    quietPendingRef.current = false;
    setStripOpen(false);
    setDownloadedOnce(false);
    setHandoffFailed(false);
  }, [clearPrepared]);

  return {
    tap,
    downloadState,
    downloadedOnce,
    downloadLinkReady,
    showStrip,
    shareReady,
    handoffBusy,
    handoffFailed,
    requestHandoff,
    onDownloadTap,
    onPartSaved,
    onQuietDownloadTap,
    onQuietPreparingTap,
    onRowPreparingTap,
    handleShare,
    closeStrip: () => setStripOpen(false),
    reset,
  };
}
