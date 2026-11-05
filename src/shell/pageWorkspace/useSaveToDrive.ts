import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { DRIVE_SAVE_CHANNEL, hasDriveConnection, driveFileLink, driveSaveHref, driveSaveKey, type DriveSaveAnswer, type DriveSaveCancel, type DriveSaveFile, type DriveSavePayload } from '#lib/handoff/driveSaveLink.ts';
import { parkHandoff } from '#lib/handoff/sendHandoff.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportToolLifecycleEvent, type AnalyticsTool } from '#lib/telemetry/productAnalytics.ts';

type SaveToDriveState = 'idle' | 'saving' | 'saved' | 'failed';
type BuiltFile = { blob: Blob; fileName: string };

interface SaveToDriveInput {
  tool: AnalyticsTool;
  /** Builds the file when Save is tapped, after the Drive tab is already open; null means nothing to save. */
  build: () => Promise<BuiltFile | null>;
  /** The identity of the output: a finished save no longer describes a new one (a change while saving is ignored). */
  generation: unknown;
  ready: boolean;
}

const TAB_CHECK_MS = 1000;

const readFile = async (blob: Blob, fileName: string): Promise<DriveSaveFile> => (
  { fileName, fileType: blob.type || 'application/pdf', fileBytes: await blob.arrayBuffer() }
);

/** Pure shape of what is parked: always one file. @testSeam */
export async function driveSavePayload(blob: Blob, fileName: string): Promise<DriveSavePayload> {
  return { files: [await readFile(blob, fileName)] };
}

const isDesktop = () => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches === true;
  } catch {
    // expected: no matchMedia, so not a desktop
    return false;
  }
};

/** Tells the waiting /drive/ tab nothing is coming. A fresh channel: the listening one never hears its own post. */
function postCancel(id: string) {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(DRIVE_SAVE_CHANNEL);
    channel.postMessage({ id, status: 'cancelled' } satisfies DriveSaveCancel);
    channel.close();
  } catch {
    // expected: no channel in this browser; the tab gives up on its own timer
  }
}

const newId = () => {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
};

/** MERGE-26: Save to Google Drive. The /drive/ tab alone talks to Google; one tap opens it, builds the file here and parks it. */
export function useSaveToDrive({ tool, build, generation, ready }: SaveToDriveInput) {
  const [state, setStateRaw] = useState<SaveToDriveState>('idle');
  const [link, setLink] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [connected, setConnected] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const stateRef = useRef<SaveToDriveState>('idle');
  const channelRef = useRef<BroadcastChannel | null>(null);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setState = (next: SaveToDriveState) => { stateRef.current = next; setStateRaw(next); };
  const stopWatching = () => { if (watchRef.current !== null) clearInterval(watchRef.current); watchRef.current = null; };
  const closeChannel = () => { stopWatching(); channelRef.current?.close(); channelRef.current = null; };

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);

  useEffect(() => setDesktop(isDesktop()), []);

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

  const available = ready && online && connected && desktop;
  useEffect(() => { if (available) reportToolLifecycleEvent('tool_drive_shown', tool); }, [available, generation, tool]);

  // Redact's generation changes when the build finishes, which is mid-save: that one must not reset it.
  useEffect(() => {
    if (stateRef.current === 'saving') return;
    closeChannel();
    setState('idle');
    setLink(null);
  }, [generation]);
  useEffect(() => closeChannel, []);

  const save = useCallback(() => {
    if (!available || stateRef.current === 'saving') return;
    recordAction('save_to_drive');
    reportToolLifecycleEvent('tool_drive_tapped', tool);
    const id = newId();
    // Synchronously, straight from the tap, and without noopener: the new tab closes itself.
    const tab = window.open(driveSaveHref(id));
    if (!tab) { setState('failed'); reportToolLifecycleEvent('tool_drive_failed', tool); return; }
    setState('saving');
    setLink(null);
    closeChannel();
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(DRIVE_SAVE_CHANNEL);
      channel.onmessage = (event: MessageEvent<DriveSaveAnswer>) => {
        if (event.data?.id !== id) return;
        if (event.data.status === 'saved') {
          setLink(driveFileLink(event.data.link));
          setState('saved');
          reportToolLifecycleEvent('tool_drive_saved', tool);
          reportToolLifecycleEvent('tool_result_ready', tool); // a save to Drive is a finished result
        } else {
          setState('failed');
          reportToolLifecycleEvent('tool_drive_failed', tool);
        }
        closeChannel();
      };
      channelRef.current = channel;
    }
    // A tab closed mid-sign-in never answers. The channel stays open: a late answer still lands.
    watchRef.current = setInterval(() => {
      if (!tab.closed) return;
      stopWatching();
      setState(stateRef.current === 'saving' ? 'idle' : stateRef.current);
    }, TAB_CHECK_MS);
    void (async () => { // reason: every failure below ends in the 'failed' state
      const fail = () => {
        closeChannel();
        setState('failed');
        reportToolLifecycleEvent('tool_drive_failed', tool);
      };
      let made: BuiltFile | null = null;
      try {
        made = await build();
      } catch {
        // expected: the build failed; handled like nothing to save
      }
      if (!made) { postCancel(id); fail(); return; }
      if (stateRef.current !== 'saving') return; // the tab was closed while building
      try {
        await parkHandoff(driveSaveKey(id), await driveSavePayload(made.blob, made.fileName));
        if (!channelRef.current) setState('idle');
      } catch {
        // expected: the file stays here to download
        postCancel(id);
        fail();
      }
    })();
  }, [available, tool, build]);

  return { state, link, available, save };
}
