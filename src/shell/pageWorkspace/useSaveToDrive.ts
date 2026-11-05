import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { DRIVE_SAVE_CHANNEL, hasDriveConnection, driveSaveHref, driveSaveKey, type DriveSaveAnswer, type DriveSaveFile, type DriveSavePayload } from '#lib/handoff/driveSaveLink.ts';
import type { OutputPart } from '#lib/output/usePreparedOutput.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportToolLifecycleEvent, type AnalyticsTool } from '#lib/telemetry/productAnalytics.ts';

type SaveToDriveState = 'idle' | 'saving' | 'saved' | 'failed';

interface SaveToDriveInput {
  tool: AnalyticsTool;
  blob: Blob | null;
  parts: OutputPart[] | null;
  fileName: string;
  /** The identity of the output: a finished save no longer describes a new one. */
  generation: unknown;
  ready: boolean;
}

const TAB_CHECK_MS = 1000;

const readFile = async (blob: Blob, fileName: string): Promise<DriveSaveFile> => (
  { fileName, fileType: blob.type || 'application/pdf', fileBytes: await blob.arrayBuffer() }
);

/** Pure shape of what is parked: one file, or several parts in one folder named for the output. @testSeam */
export async function driveSavePayload(blob: Blob | null, parts: OutputPart[] | null, fileName: string): Promise<DriveSavePayload> {
  if (parts && parts.length > 1) {
    const files = await Promise.all(parts.map((part) => readFile(part.blob, part.filename)));
    return { files, folderName: fileName.replace(/\.[^./]+$/, '') };
  }
  const only = parts?.[0];
  return { files: [await (only ? readFile(only.blob, only.filename) : readFile(blob as Blob, fileName))] };
}

const newId = () => {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
};

/** MERGE-26: Save to Google Drive. The /drive/ tab alone talks to Google; this parks the file and opens it. */
export function useSaveToDrive({ tool, blob, parts, fileName, generation, ready }: SaveToDriveInput) {
  const [state, setState] = useState<SaveToDriveState>('idle');
  const [online, setOnline] = useState(true);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopWatching = () => { if (watchRef.current !== null) clearInterval(watchRef.current); watchRef.current = null; };
  const closeChannel = () => { stopWatching(); channelRef.current?.close(); channelRef.current = null; };

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);

  useEffect(() => {
    const read = () => {
      try {
        setConnected(hasDriveConnection(localStorage));
      } catch {
        // expected: storage blocked, so not connected
        setConnected(false);
      }
    };
    read();
    window.addEventListener('storage', read); // connecting happens in another tab
    return () => window.removeEventListener('storage', read);
  }, []);

  const available = ready && online && connected;
  useEffect(() => { if (available) reportToolLifecycleEvent('tool_drive_shown', tool); }, [available, generation, tool]);

  useEffect(() => {
    closeChannel();
    setState('idle');
    return closeChannel;
  }, [generation]);

  const save = useCallback(() => {
    if (!ready || state === 'saving') return;
    recordAction('save_to_drive');
    reportToolLifecycleEvent('tool_drive_tapped', tool);
    const id = newId();
    // Synchronously, straight from the tap, and without noopener: the new tab closes itself.
    const tab = window.open(driveSaveHref(id));
    if (!tab) { setState('failed'); reportToolLifecycleEvent('tool_drive_failed', tool); return; }
    setState('saving');
    closeChannel();
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(DRIVE_SAVE_CHANNEL);
      channel.onmessage = (event: MessageEvent<DriveSaveAnswer>) => {
        if (event.data?.id !== id) return;
        const saved = event.data.status === 'saved';
        setState(saved ? 'saved' : 'failed');
        reportToolLifecycleEvent(saved ? 'tool_drive_saved' : 'tool_drive_failed', tool);
        closeChannel();
      };
      channelRef.current = channel;
    }
    // A tab closed mid-sign-in never answers. The channel stays open: a late answer still lands.
    watchRef.current = setInterval(() => {
      if (!tab.closed) return;
      stopWatching();
      setState((now) => (now === 'saving' ? 'idle' : now));
    }, TAB_CHECK_MS);
    void (async () => { // reason: every failure below ends in the 'failed' state
      try {
        const payload = await driveSavePayload(blob, parts, fileName);
        const { saveHandoff } = await import('#lib/drafts/draftStore.ts');
        if (!(await saveHandoff(driveSaveKey(id), payload))) throw new Error('park');
        if (!channelRef.current) setState('idle');
      } catch {
        // expected: the file stays here to download
        closeChannel();
        setState('failed');
        reportToolLifecycleEvent('tool_drive_failed', tool);
      }
    })();
  }, [ready, state, tool, blob, parts, fileName]);

  return { state, available, save };
}
