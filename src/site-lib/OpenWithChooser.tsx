import { useEffect, useRef, useState } from 'preact/hooks';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import { pdfFromLaunch, type LaunchParams } from './openWithLaunch.ts';
import styles from './OpenWithChooser.module.css';

/* ARCH-37: the installed app's "Open with" lands here (manifest.webmanifest's file_handlers), because
   a second file_handlers entry cannot carry its own name and so cannot offer Redact beside Sign. The
   file reaches this page's launchQueue, is parked under the chosen tool's hand-off key, and the tool
   opens it exactly as it opens a file from the home page. Nothing leaves the device. */
const CHOICES = [
  { tool: 'sign', name: 'Sign', label: 'Sign it', note: 'Fill in and sign' },
  { tool: 'redact', name: 'Redact', label: 'Redact it', note: 'Black out private parts' },
] as const;

function OpenWithChooser() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const latestLaunch = useRef(0);

  useEffect(() => {
    const launchQueue = (window as any).launchQueue;
    if (!launchQueue) return;
    launchQueue.setConsumer(async (params: LaunchParams) => {
      const launch = ++latestLaunch.current;
      const pdf = await pdfFromLaunch(params);
      if (launch !== latestLaunch.current || !pdf) return;
      setFailed(false);
      setFile(pdf);
    });
  }, []);

  const choose = async (tool: string) => {
    if (!file || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const fileBytes = await file.arrayBuffer();
      await sendHandoff(tool, { fileName: file.name, fileType: 'application/pdf', fileBytes });
    } catch {
      // expected: saveHandoff reports its own failure; the person gets a line and can try again
      setFailed(true);
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <div class={styles.chooser}>
        <p class={styles.lead}>Pick a tool, then add your PDF there.</p>
        <div class={styles.choices}>
          {CHOICES.map(({ tool, name }) => (
            <a class={styles.choice} href={`/${tool}/`}>{name}</a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class={styles.chooser}>
      <p class={styles.lead}>
        <span class={styles.fileName} dir="auto">{file.name}</span> is ready. What would you like to do with it?
      </p>
      <div class={styles.choices}>
        {CHOICES.map(({ tool, label, note }) => (
          <button type="button" class={styles.choice} disabled={busy} onClick={() => choose(tool)}>
            <strong>{label}</strong>
            <span>{note}</span>
          </button>
        ))}
      </div>
      {failed && <p class={styles.error} role="alert">That did not open. Please try again.</p>}
    </div>
  );
}

export default withIslandBoundary(OpenWithChooser);
