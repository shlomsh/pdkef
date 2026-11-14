import { useEffect, useRef, useState } from 'preact/hooks';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import { pdfFromLaunch, type LaunchParams } from './openWithLaunch.ts';
import styles from './OpenWithChooser.module.css';

/* ARCH-37: the installed app's "Open with" lands here (manifest.webmanifest's file_handlers), because
   a second file_handlers entry cannot carry its own name and so cannot offer the other tools beside Sign. The
   file reaches this page's launchQueue, is parked under the chosen tool's hand-off key, and the tool
   opens it exactly as it opens a file from the home page. Nothing leaves the device. */
const CHOICES = [
  { tool: 'sign', name: 'Sign', label: 'Sign it', note: 'Fill in and sign' },
  { tool: 'redact', name: 'Redact', label: 'Redact it', note: 'Black out private parts' },
  { tool: 'highlight-pdf', name: 'Highlight', label: 'Highlight it', note: 'Mark what matters' },
  { tool: 'compress', name: 'Compress', label: 'Compress it', note: 'Make the file smaller' },
  { tool: 'scan-to-pdf', name: 'Scan', label: 'Straighten it', note: 'Clean up a crooked scan' },
] as const;

/* `file` and `arriving` are /drive/'s way in (DRIVE-11): the choice shows while the file is still downloading,
   and a tool picked early opens the moment the file lands. The installed app passes neither and uses launchQueue. */
function OpenWithChooser({ file: given, arriving = false }: { file?: File; arriving?: boolean }) {
  const [launched, setLaunched] = useState<File | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const latestLaunch = useRef(0);
  const sending = useRef(false); // a second file launching mid-hand-off must not send a second one
  const file = given ?? launched;

  useEffect(() => {
    const launchQueue = (window as any).launchQueue;
    if (!launchQueue) return;
    launchQueue.setConsumer(async (params: LaunchParams) => {
      const launch = ++latestLaunch.current;
      const pdf = await pdfFromLaunch(params);
      if (launch !== latestLaunch.current || !pdf) return;
      setFailed(false);
      setLaunched(pdf);
    });
  }, []);

  // The hand-off needs both a choice and the file; either may come first.
  useEffect(() => {
    if (!chosen || !file || sending.current) return;
    sending.current = true;
    void (async () => {
      try {
        const fileBytes = await file.arrayBuffer();
        await sendHandoff(chosen, { fileName: file.name, fileType: 'application/pdf', fileBytes });
      } catch {
        // expected: saveHandoff reports its own failure; the person gets a line and can try again
        sending.current = false;
        setFailed(true);
        setChosen(null);
      }
    })();
  }, [chosen, file]);

  const choose = (tool: string) => {
    if (chosen) return;
    setFailed(false);
    setChosen(tool);
  };

  if (!file && !arriving) {
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
        {file ? <><span class={styles.fileName} dir="ltr">{file.name}</span> is ready.</> : 'Your file is on its way.'}
        {' '}What would you like to do with it?
      </p>
      <div class={styles.choices}>
        {CHOICES.map(({ tool, label, note }) => (
          <button type="button" class={styles.choice} disabled={chosen !== null} data-chosen={chosen === tool || undefined} onClick={() => choose(tool)}>
            <strong>{label}</strong>
            <span>{note}</span>
          </button>
        ))}
      </div>
      {chosen && !file && <p class={styles.lead} role="status">It opens as soon as it arrives.</p>}
      {failed && <p class={styles.error} role="alert">That did not open. Please try again.</p>}
    </div>
  );
}

export default withIslandBoundary(OpenWithChooser);
