import { useEffect, useRef } from 'preact/hooks';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import type { usePdfShare } from '#lib/output/usePdfShare.js';
import { englishHighlightMessages as t } from '../messages.ts';

type SharePdf = Pick<ReturnType<typeof usePdfShare>, 'canSharePdf' | 'shareReady' | 'clearPrepared' | 'sharePrepared'>;
type ShareResult = { status: string; error?: unknown };

/** What a finished share attempt says, and whether it counts as a share. `keepForTap` is the automatic attempt's error. */
function announceResult(result: ShareResult, setAnnouncement: (message: string) => void, keepForTap: boolean) {
  if (result.status === 'shared') {
    setAnnouncement(t.shared);
    recordAction('share');
  } else if (result.status === 'canceled') {
    setAnnouncement(t.shareCanceled);
  } else if (result.status === 'error') {
    if (keepForTap) {
      setAnnouncement(t.shareReady);
    } else {
      console.error(result.error);
      setAnnouncement(t.shareError);
    }
  }
}

/**
 * Share for Highlight, as Redact has it: the first tap builds the file, and where the browser still counts the tap
 * the sheet opens at once; otherwise the file stays prepared and the next tap opens it. A prepared file is dropped
 * whenever `resetKey` changes (the file, its revision or its name), so a stale one is never shared.
 */
export function useHighlightShare({ share, prepareFile, resetKey, setAnnouncement }: {
  share: SharePdf;
  prepareFile: () => Promise<boolean>;
  resetKey: unknown;
  setAnnouncement: (message: string) => void;
}) {
  const { shareReady, sharePrepared, clearPrepared } = share;
  const building = useRef(false);
  const wantsSheet = useRef(false);

  useEffect(() => {
    clearPrepared();
    wantsSheet.current = false;
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps -- clearPrepared is stable; the key is the trigger

  useEffect(() => {
    if (!shareReady || !wantsSheet.current) return;
    wantsSheet.current = false;
    void sharePrepared().then((result) => announceResult(result, setAnnouncement, true)); // reason: sharePrepared returns its failures in the result
  }, [shareReady]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per prepared file, inside the tap's activation window

  const onPrepareShare = async () => {
    if (building.current) return;
    building.current = true;
    wantsSheet.current = true;
    try {
      if (!(await prepareFile())) {
        wantsSheet.current = false;
        setAnnouncement(t.shareError);
      }
    } finally {
      building.current = false;
    }
  };

  const onShare = async () => announceResult(await sharePrepared(), setAnnouncement, false);

  return { canShare: share.canSharePdf, shareReady, onPrepareShare, onShare };
}
