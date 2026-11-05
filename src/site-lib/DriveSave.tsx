import { useEffect, useRef, useState } from 'preact/hooks';
import { DRIVE_SAVE_CHANNEL, driveSaveKey, type DriveSavePayload } from '#lib/handoff/driveSaveLink.ts';
import { saveToDrive, type DriveUploadError } from './drive/driveUpload.ts';
import { forgetSaved, savedToken, toGoogle } from './drive/driveSignIn.ts';
import styles from './DriveOpen.module.css';

/* MERGE-26: where a tool's Save to Google Drive lands. The tool parks its output and opens this page in a
   new tab; this page signs in (one redirect, no Picker frame), uploads, answers the tool on a
   BroadcastChannel and closes itself. The file is never lost: a failure offers it as a download. */
const TAKE_EVERY_MS = 250;
const TAKE_TRIES = 40;
const CLOSE_AFTER_MS = 900;

type Phase =
  | { name: 'waiting' }
  | { name: 'sign-in-failed' }
  | { name: 'saving' }
  | { name: 'saved'; link: string | null }
  | { name: 'expired' }
  | { name: 'failed'; error: DriveUploadError };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function answer(id: string, status: 'saved' | 'failed') {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(DRIVE_SAVE_CHANNEL);
    channel.postMessage({ id, status });
    channel.close();
  } catch {
    // expected: no channel in this browser; the tool simply is not told
  }
}

function retriedFlag(id: string) {
  const key = `drive-save-retried-${id}`;
  return {
    get: () => {
      try {
        return sessionStorage.getItem(key) === '1';
      } catch {
        // expected: storage blocked; the one retry is then not remembered
        return false;
      }
    },
    set: () => {
      try {
        sessionStorage.setItem(key, '1');
      } catch {
        // expected: storage blocked; the one retry is then not remembered
      }
    },
  };
}

async function takeRecord(id: string): Promise<DriveSavePayload | null> {
  const { takeHandoff } = await import('#lib/drafts/draftStore.ts');
  for (let i = 0; i < TAKE_TRIES; i++) {
    const record = await takeHandoff(driveSaveKey(id));
    if (record && Array.isArray(record.files) && record.files.length > 0) return record as unknown as DriveSavePayload;
    await pause(TAKE_EVERY_MS);
  }
  return null;
}

export default function DriveSave({ id, failed }: { id: string; failed: boolean }) {
  const [phase, setPhase] = useState<Phase>(failed ? { name: 'sign-in-failed' } : { name: 'waiting' });
  const payload = useRef<DriveSavePayload | null>(null);
  const token = useRef<string | null>(null);
  const [downloads, setDownloads] = useState<{ name: string; href: string }[]>([]);

  const upload = async () => {
    const data = payload.current;
    if (!data || !token.current) return;
    setPhase({ name: 'saving' });
    const result = await saveToDrive(fetch, token.current, data);
    if (result.ok) {
      answer(id, 'saved');
      setPhase({ name: 'saved', link: result.link });
      setTimeout(() => window.close(), CLOSE_AFTER_MS);
      return;
    }
    const retried = retriedFlag(id);
    if (result.error === 'unauthorized' && !retried.get()) {
      // The saved token was stale: park the file again (a redirect loses memory) and sign in once more.
      retried.set();
      forgetSaved();
      const { saveHandoff } = await import('#lib/drafts/draftStore.ts');
      if (await saveHandoff(driveSaveKey(id), data as Parameters<typeof saveHandoff>[1])) return toGoogle('none', location.search);
    }
    answer(id, 'failed');
    setDownloads(data.files.map((f) => ({ name: f.fileName, href: URL.createObjectURL(new Blob([f.fileBytes], { type: f.fileType })) })));
    setPhase({ name: 'failed', error: result.error });
  };

  useEffect(() => {
    if (failed) return;
    const saved = savedToken();
    if (!saved) return toGoogle('none', location.search);
    token.current = saved;
    void (async () => {
      payload.current = await takeRecord(id);
      if (!payload.current) {
        // Parked hand-offs age out (HANDOFF_MAX_AGE_MS), so a slow sign-in can arrive to nothing. The file is safe in the tool's tab.
        answer(id, 'failed');
        return setPhase({ name: 'expired' });
      }
      await upload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on arrival
  }, []);

  if (phase.name === 'sign-in-failed') {
    return (
      <div class={styles.panel}>
        <p class={styles.error} role="alert">Google sign-in did not finish. You can try again.</p>
        <button type="button" class={styles.primary} onClick={() => toGoogle('select_account', location.search)}>Try again</button>
      </div>
    );
  }
  if (phase.name === 'expired') {
    return (
      <div class={styles.panel}>
        <p class={styles.error} role="alert">That took a little too long. Your file is still in the tab you came from, so you can save it from there.</p>
      </div>
    );
  }
  if (phase.name === 'failed') {
    return (
      <div class={styles.panel}>
        <p class={styles.error} role="alert">
          {phase.error === 'quota' ? 'Your Google Drive is full.' : 'That did not reach Google Drive.'} You can download the file instead.
        </p>
        {downloads.map((d) => (
          <a key={d.href} class={styles.back} href={d.href} download={d.name}>Download {d.name}</a>
        ))}
        {phase.error !== 'quota' && payload.current && (
          <button type="button" class={styles.primary} onClick={() => void upload()}>Try again</button>
        )}
      </div>
    );
  }
  if (phase.name === 'saved') {
    return (
      <div class={styles.panel}>
        <p class={styles.lead} role="status">Saved to Google Drive</p>
        {phase.link && <a class={styles.back} href={phase.link} target="_blank" rel="noopener">Open in Google Drive</a>}
      </div>
    );
  }
  return (
    <div class={styles.panel}>
      <p class={styles.lead} role="status">Saving to Google Drive...</p>
    </div>
  );
}
