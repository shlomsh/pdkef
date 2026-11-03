import { useEffect, useState } from 'preact/hooks';
import { parseDriveState } from './drive/driveState.ts';
import { fetchDriveFile } from './drive/driveClient.ts';
import { requestDriveToken } from './drive/googleToken.ts';
import { canRetry, driveMessage, type DriveFailure } from './drive/driveMessages.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import OpenWithChooser from './OpenWithChooser.tsx';
import styles from './DriveOpen.module.css';

/* MERGE-25: where Drive's "Open with > PDkef" lands. The person taps once (a popup needs a tap), Google
   hands this page a token for that one file, the file is fetched straight to the device, and the same
   chooser as /open/ takes over. The PDF goes from Drive to this device and nowhere else. */
type Phase =
  | { name: 'loading' }
  | { name: 'no-state' }
  | { name: 'ready'; fileId: string; resourceKey?: string }
  | { name: 'working' }
  | { name: 'error'; failure: DriveFailure; fileId: string; resourceKey?: string }
  | { name: 'chooser'; file: File };

function DriveOpen() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });

  useEffect(() => {
    const state = parseDriveState(location.search);
    setPhase(state.ok ? { name: 'ready', fileId: state.fileId, resourceKey: state.resourceKey } : { name: 'no-state' });
  }, []);

  const start = async (fileId: string, resourceKey?: string) => {
    const fail = (failure: DriveFailure) => setPhase({ name: 'error', failure, fileId, resourceKey });
    const token = await requestDriveToken();
    if (!token.ok) return fail(token.error);
    setPhase({ name: 'working' });
    const result = await fetchDriveFile(fetch, token.token, { fileId, resourceKey });
    if (!result.ok) return fail(result.error);
    setPhase({ name: 'chooser', file: new File([result.bytes], result.name, { type: 'application/pdf' }) });
  };

  if (phase.name === 'loading') return null;
  if (phase.name === 'chooser') return <OpenWithChooser initialFile={phase.file} />;
  if (phase.name === 'no-state') {
    return (
      <div class={styles.panel}>
        <p class={styles.lead}>To open a PDF from Google Drive, right-click it in Drive, choose Open with, then PDkef.</p>
        <p class={styles.lead}>
          Or open any PDkef tool and pick the file from Drive in your device's file picker, with no sign-in at all.{' '}
          <a href="/how-to-open-a-pdf-from-google-drive/">Step by step</a>
        </p>
      </div>
    );
  }
  if (phase.name === 'working') {
    return (
      <div class={styles.panel}>
        <p class={styles.lead} role="status">Getting your PDF from Drive...</p>
      </div>
    );
  }
  const { fileId, resourceKey } = phase;
  return (
    <div class={styles.panel}>
      {phase.name === 'error' ? (
        <p class={styles.error} role="alert">{driveMessage(phase.failure)}</p>
      ) : (
        <p class={styles.lead}>PDkef asks Google for access to this one file. It goes from Drive to this device and nowhere else.</p>
      )}
      {(phase.name === 'ready' || canRetry(phase.failure)) && (
        <button type="button" class={styles.primary} onClick={() => start(fileId, resourceKey)}>
          {phase.name === 'ready' ? 'Continue with Google' : 'Try again'}
        </button>
      )}
    </div>
  );
}

export default withIslandBoundary(DriveOpen);
