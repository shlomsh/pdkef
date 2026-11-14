import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchDriveFile } from './drive/driveClient.ts';
import { requestDriveToken } from './drive/googleToken.ts';
import { canRetry, driveMessage, pickerLabels, type DriveFailure } from './drive/driveMessages.ts';
import type { DriveOpenWithFile } from './drive/types.ts';
import { DRIVE_HOME_HANDOFF, parseDriveIntent } from './drive/driveIntent.ts';
import { driveRouteFor } from './drive/driveRoute.ts';
import { forgetSaved, remember, savedToken, takeRedirectReturn, toGoogle } from './drive/driveSignIn.ts';
import { loadPicker, openPicker } from './drive/drivePicker.ts';
import DriveSave from './DriveSave.tsx';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import OpenWithChooser from './OpenWithChooser.tsx';
import GoogleSignInButton from './GoogleSignInButton.tsx';
import styles from './DriveOpen.module.css';

/* MERGE-25 / DRIVE-01: where Drive's "Open with > PDkef" lands, and where a tool sends a person to pick a
   file from Google Drive. Google hands this page a token, the file is fetched straight to the device, and
   then either the same chooser as /open/ takes over (Open with) or the file is parked and the person goes
   back to the tool they came from (pick). The file goes from Drive to this device and nowhere else. */
const PICK_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

type Pick = { tool: string | null; returnTo: string };
type Phase =
  | { name: 'loading' }
  | { name: 'no-state' }
  | { name: 'ready'; file: DriveOpenWithFile }
  | { name: 'pick-ready'; pick: Pick }
  | { name: 'working' }
  | { name: 'error'; failure: DriveFailure; retry: (() => void) | null; returnTo: string | null }
  | { name: 'chooser'; file: File };

function DriveOpen() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [save, setSave] = useState<{ id: string; failed: boolean } | null>(null);
  const starting = useRef(false); // a second tap before the token returns must not start a second fetch

  const pickFrom = async (token: string, pick: Pick, multi: boolean) => {
    const retry = () => (multi ? void pickFrom(token, pick, multi) : setPhase({ name: 'pick-ready', pick }));
    const fail = (failure: DriveFailure) => {
      if (failure === 'unauthorized') {
        forgetSaved(); // the saved token is no longer good
      }
      setPhase({ name: 'error', failure, retry, returnTo: pick.returnTo });
    };
    if (!(await loadPicker())) return fail('script');
    const picked = await openPicker({ token, multi, mimeTypes: PICK_TYPES, ...pickerLabels(pick.returnTo) });
    if (picked.action === 'cancel') return location.assign(pick.returnTo);
    setPhase({ name: 'working' });
    const files = [];
    for (const doc of picked.docs) {
      const result = await fetchDriveFile(fetch, token, { fileId: doc.id }, { accept: PICK_TYPES });
      if (!result.ok) return fail(result.error);
      files.push({ fileName: result.name, fileType: result.mimeType, fileBytes: result.bytes });
    }
    try {
      const payload = files.length === 1 ? files[0] : { files };
      await sendHandoff(pick.tool ?? DRIVE_HOME_HANDOFF, payload, { href: pick.returnTo });
    } catch {
      // expected: the device would not keep the file; the person sees the same line as a dropped connection
      fail('network');
    }
  };

  // The popup is required on these browsers even with a saved token. On iPhone the Picker frame shows
  // "Can't access your Google Account" without it (measured 2026-11-05), and it must come from a tap.
  const pickByPopup = async (pick: Pick) => {
    const token = await requestDriveToken();
    if (!token.ok) {
      return setPhase({ name: 'error', failure: token.error, returnTo: pick.returnTo, retry: () => setPhase({ name: 'pick-ready', pick }) });
    }
    remember(token.token, token.expiresInSeconds);
    await pickFrom(token.token, pick, false);
  };

  useEffect(() => {
    const back = takeRedirectReturn();
    if (back.handled) return;
    const intent = parseDriveIntent(location.search);
    if (intent.kind === 'open-with') {
      // DRIVE-10: a token in hand opens the file with no screen; desktop Chrome gets one quietly by redirect.
      const { kind: _kind, ...file } = intent;
      const token = back.token ?? savedToken(file.userId);
      if (token) return void openWith(token, file, false);
      if (!back.failed && driveRouteFor(navigator.userAgent) === 'redirect') return toGoogle('none', location.search);
      return setPhase({ name: 'ready', file });
    }
    if (intent.kind === 'none') return setPhase({ name: 'no-state' });
    if (intent.kind === 'save') return setSave({ id: intent.id, failed: back.failed });
    const pick = { tool: intent.tool, returnTo: intent.returnTo };
    if (back.failed) {
      // Google said no after the person was asked; a tap sends them back to choose an account.
      return setPhase({ name: 'error', failure: 'denied', returnTo: pick.returnTo, retry: () => toGoogle('select_account', location.search) });
    }
    if (driveRouteFor(navigator.userAgent) === 'popup') return setPhase({ name: 'pick-ready', pick });
    const token = back.token ?? savedToken();
    if (token) void pickFrom(token, pick, true); // reason: pickFrom shows every failure through its own fail()
    else toGoogle('none', location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on arrival
  }, []);

  // A token that was saved or came back from the redirect falls back to the button when Google refuses it,
  // never to another redirect, so a bad token cannot loop. A token from a tap shows the failure instead.
  const openWith = async (token: string, file: DriveOpenWithFile, fromTap: boolean) => {
    setPhase({ name: 'working' });
    const result = await fetchDriveFile(fetch, token, { fileId: file.fileId, resourceKey: file.resourceKey });
    if (result.ok) return setPhase({ name: 'chooser', file: new File([result.bytes], result.name, { type: 'application/pdf' }) });
    if (result.error === 'unauthorized') forgetSaved();
    if (!fromTap && (result.error === 'unauthorized' || result.error === 'not-found')) return setPhase({ name: 'ready', file });
    setPhase({ name: 'error', failure: result.error, returnTo: null, retry: () => void start(file) });
  };

  const start = async (file: DriveOpenWithFile) => {
    if (starting.current) return;
    starting.current = true; // set before the first await so the token popup still opens inside the tap
    try {
      const token = await requestDriveToken(file.userId);
      if (!token.ok) return setPhase({ name: 'error', failure: token.error, returnTo: null, retry: () => void start(file) });
      remember(token.token, token.expiresInSeconds, file.userId); // the next Open with, within the hour, needs no tap
      await openWith(token.token, file, true);
    } finally {
      starting.current = false;
    }
  };

  if (save) return <DriveSave id={save.id} failed={save.failed} />;
  if (phase.name === 'loading') return null;
  if (phase.name === 'chooser') return <OpenWithChooser initialFile={phase.file} />;
  if (phase.name === 'no-state') {
    return (
      <div class={styles.panel}>
        <p class={styles.lead}>To open a PDF from Google Drive, right-click it in Drive, choose Open with, then PDkef.</p>
        <p class={styles.lead}>
          Or open any PDkef tool and pick the file from Google Drive in your device's file picker, with no sign-in at all.{' '}
          <a href="/how-to-open-a-pdf-from-google-drive/">Step by step</a>
        </p>
      </div>
    );
  }
  if (phase.name === 'working') {
    return (
      <div class={styles.panel}>
        <p class={styles.lead} role="status">Getting your file from Google Drive...</p>
      </div>
    );
  }
  if (phase.name === 'pick-ready') {
    return (
      <div class={styles.panel}>
        <p class={styles.lead}>PDkef asks Google for access to the files you choose. They go from Google Drive to this device and nowhere else.</p>
        <button type="button" class={styles.primary} onClick={() => void pickByPopup(phase.pick)}>
          Choose from Google Drive
        </button>
      </div>
    );
  }
  if (phase.name === 'error') {
    return (
      <div class={styles.panel}>
        <p class={styles.error} role="alert">{driveMessage(phase.failure)}</p>
        {phase.retry && canRetry(phase.failure) && (
          <button type="button" class={styles.primary} onClick={phase.retry}>Try again</button>
        )}
        {phase.returnTo && <a class={styles.back} href={phase.returnTo}>Back to where you were</a>}
      </div>
    );
  }
  return (
    <div class={styles.panel}>
      <p class={styles.lead}>PDkef asks Google for access to this one file. It goes from Google Drive to this device and nowhere else.</p>
      <GoogleSignInButton onClick={() => void start(phase.file)} />
    </div>
  );
}

export default withIslandBoundary(DriveOpen);
