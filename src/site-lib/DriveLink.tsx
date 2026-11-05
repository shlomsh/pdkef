import { useEffect, useState } from 'preact/hooks';
import { driveOpenHref, DRIVE_HOME_HANDOFF } from './drive/driveIntent.ts';
import styles from './FileDropzone.module.css';

/* DRIVE-02: the Drive link starts as the server render has it (returning to "/", online) so nothing
   shifts; only the mount effects read location or navigator. A file picked in the Drive app comes
   back as a hand-off and is treated as a drop. Mounted for the first-screen launcher only. */
export default function DriveLink({ label, onFiles }: { label: string; onFiles: (files: File[]) => Promise<void> }) {
  const [returnTo, setReturnTo] = useState('/');
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setReturnTo(window.location.pathname);
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void import('#lib/drafts/draftStore.ts').then(async ({ takeHandoff }) => { // reason: the catch below covers a failed read
      const record = await takeHandoff(DRIVE_HOME_HANDOFF);
      if (cancelled || !record) return;
      const files = (record.files ?? [record]).filter(item => item?.fileBytes).map(item =>
        new File([item.fileBytes as ArrayBuffer], item.fileName ?? 'document.pdf', { type: item.fileType }));
      if (files.length) void onFiles(files); // reason: readCopies settles every read and handOff catches its own failure
    }).catch(() => {
      // expected: no store (private mode) means nothing came back
    });
    return () => { cancelled = true; };
  }, []);
  return <a class={styles.drive} href={driveOpenHref({ returnTo })} hidden={!online}>
    <img src="/images/brand/google-drive.png" alt="" width="20" height="20" />{label}
  </a>;
}
