import { englishShellMessages } from '../shellMessages.ts';
import { useToolShell } from '../ToolShell.tsx';
import type { useSaveToDrive } from './useSaveToDrive.ts';
import styles from './SaveToDriveButton.module.css';

type Drive = ReturnType<typeof useSaveToDrive>;

/** Whether the button renders at all: nothing while it is unavailable and has nothing to say. */
const showsSaveToDrive = (drive: Drive) => drive.available || drive.state !== 'idle';

/** MERGE-26: Save to Google Drive, with the unmodified Google mark; a failed save says so under the button, and a tap retries. */
export default function SaveToDriveButton({ drive }: { drive: Drive }) {
  const labels = useToolShell().messages?.saveToDrive ?? englishShellMessages.saveToDrive;
  if (!showsSaveToDrive(drive)) return null;
  const { state } = drive;
  const label = state === 'saving' ? labels.saving : state === 'saved' ? labels.saved : labels.save;
  return (
    <>
      <button type="button" class={styles['drive-button']} disabled={state === 'saving' || state === 'saved'} onClick={drive.save}>
        <img src="/images/brand/google-drive.png" alt="" width="16" height="16" />
        {label}
      </button>
      {state === 'failed' && <p class={styles['drive-note']} role="status">{labels.failed}</p>}
    </>
  );
}
