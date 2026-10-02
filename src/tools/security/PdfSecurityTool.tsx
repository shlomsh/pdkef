import { useRef, useState } from 'preact/hooks';
import { Eraser, FileSignature } from 'lucide-preact';
import { protectPdf, unlockPdf, WrongPasswordError } from './security.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { reportError } from '../../lib/errorReport.ts';
import { useObjectUrls } from '../../lib/useObjectUrls.js';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import styles from './PdfSecurityTool.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import DownloadButton from '../../shell/DownloadButton.tsx';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { describeFile } from '../../lib/format.js';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';

// One name for the Download button, the share sheet and the hand-off, so they cannot drift.
const outputFileName = (name: string, mode: string) => `${name.replace(/\.pdf$/i, '')}_${mode}ed.pdf`;

const WRONG_PASSWORD = 'The password may be incorrect.';
const DAMAGED = 'This file could not be unlocked. It may be damaged.';
const PROTECT_FAILED = 'The file might already be encrypted or corrupted.';

export default function PdfSecurityTool({ intent = 'unlock', navigate = (href) => { window.location.href = href; } }: {
  intent?: string;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  useHoldUpdate(status === 'processing');
  useHoldUpdate(file !== null, 'open');
  const [mode, setMode] = useState<string | null>(null); // 'unlock' | 'protect' | null
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [outputBytes, setOutputBytes] = useState<ArrayBuffer | null>(null); // what the hand-off row passes on
  const [noPassword, setNoPassword] = useState(false); // owner-password-only: unlocked with no password asked
  const [errorText, setErrorText] = useState('');
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();
  const [handoffFailed, setHandoffFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [readError, setReadError] = useState<string | null>(null); // why the picked file could not be checked
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const passwordRef = useRef<HTMLInputElement | null>(null);
  // DEBT-18: both async paths here belong to one file, so they share one run.
  // `begin()` supersedes whatever was in flight (a second pick retires the
  // first file's encryption check), and resetOutput - which every file pick
  // and every password edit already calls - retires a running unlock/protect.
  // No keys: nothing invalidates a run without going through one of those.
  const fileRun = useLatestRun();

  const resetOutput = () => {
    fileRun.invalidate();
    clearPrepared();
    setStatus('idle');
    clearDownload();
    setOutputBytes(null);
    setHandoffFailed(false);
  };

  // Shared by the password form and the no-password path. Captured before the
  // await, and used instead of the `file`/`mode` state below, so the result can
  // never be written under a newer file's name.
  const runSecurity = async (sourceFile: File, sourceMode: string, pw: string) => {
    setStatus('processing');
    setAnnouncement(sourceMode === 'unlock' ? 'Unlocking PDF…' : 'Protecting PDF…');
    const run = fileRun.begin();

    try {
      const blob = sourceMode === 'unlock'
        ? await unlockPdf(sourceFile, pw)
        : await protectPdf(sourceFile, pw);
      const bytes = await blob.arrayBuffer();

      if (!run.isCurrent()) return;
      run.settle();
      setDownloadBlob(blob);
      setOutputBytes(bytes);
      prepare(blob, outputFileName(sourceFile.name, sourceMode));
      setStatus('done');
      setAnnouncement(sourceMode === 'unlock'
        ? 'Your unlocked PDF is ready.'
        : 'Your protected PDF is ready.'
      );
    } catch (err: any) {
      console.error(err);
      // Same rule on the way out: a failure for a file nobody is looking at
      // any more must not put the loaded one into an error state.
      if (!run.isCurrent()) return;
      if (!(err instanceof WrongPasswordError)) reportError('pdf_tool_run', err, sourceMode);
      run.settle();
      setStatus('error');
      const wrongPassword = err instanceof WrongPasswordError;
      setErrorText(sourceMode !== 'unlock' ? PROTECT_FAILED : wrongPassword ? WRONG_PASSWORD : DAMAGED);
      if (wrongPassword) {
        setAnnouncement('Incorrect password.');
        passwordRef.current?.focus();
        passwordRef.current?.select();
      } else {
        setAnnouncement(sourceMode === 'unlock' ? DAMAGED : err.message || 'An error occurred.');
      }
    }
  };

  const handleFilesAdded = async (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type === 'application/pdf');
    if (incoming.length === 0) return;
    
    const selectedFile = incoming[0];
    setFile(selectedFile);
    setPassword('');
    resetOutput();
    setMode(null);
    setReadError(null);
    setNoPassword(false);
    setAnnouncement(`Checking file "${selectedFile.name}"...`);

    const run = fileRun.begin();
    let protection: Awaited<ReturnType<typeof probeEncryption>>;
    try {
      protection = await probeEncryption(await selectedFile.arrayBuffer());
    } catch (err: any) {
      console.error(err);
      if (!run.isCurrent()) return;
      reportError('pdf_tool_run', err, 'check_encryption');
      run.settle();
      const message = 'Something went wrong while opening it. Please try again.';
      setReadError(message);
      setStatus('error');
      setAnnouncement(`This file could not be read. ${message}`);
      return;
    }
    // A slower check on a file that has since been replaced must not decide
    // the form's mode: offering Unlock for a file with no password sends
    // handleSubmit down the unlockPdf branch, which can only ever fail.
    if (!run.isCurrent()) return;
    run.settle();
    if (protection === 'unreadable') {
      const message = 'Make sure it is a PDF and is not damaged.';
      setReadError(message);
      setStatus('error');
      setAnnouncement(`This file could not be read. ${message}`);
      return;
    }
    const newMode = protection === 'open' ? 'protect' : 'unlock';
    setMode(newMode);

    if (protection === 'owner-restricted') {
      // Opens with an empty password: no field to show, the unlock just runs.
      setNoPassword(true);
      await runSecurity(selectedFile, 'unlock', '');
    } else if (newMode === 'unlock') {
      setAnnouncement(`File "${selectedFile.name}" loaded. Enter its password to unlock.`);
    } else {
      setAnnouncement(`File "${selectedFile.name}" loaded. Enter a password to protect it.`);
    }
  };

  useHandoffIntake('unlock', (handedOff) => { void handleFilesAdded([handedOff]); });

  const handlePasswordChange = (event: Event) => {
    setPassword((event.currentTarget as HTMLInputElement).value);
    if (status !== 'idle') resetOutput();
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!file || !password || !mode) return;
    await runSecurity(file, mode, password);
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement(`${mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF shared successfully.`);
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your PDF is still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  // Park the unlocked bytes for the target tool and navigate. The Download
  // above stays; this is only a next step.
  const handOff = async (tool: 'redact' | 'sign') => {
    if (handoffBusy || !file || !outputBytes) return;
    setHandoffBusy(true);
    setHandoffFailed(false);
    try {
      // The store is only needed once a result is being handed off.
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      const saved = await saveHandoff(tool, {
        fileName: outputFileName(file.name, 'unlock'),
        fileType: 'application/pdf',
        fileBytes: outputBytes,
      });
      if (!saved) throw new Error('handoff');
      navigate(`/${tool}/`);
    } catch (err) {
      // expected: saveHandoff reports its own failure, this shows the handoff-failed line
      console.error(err);
      setHandoffFailed(true);
      setHandoffBusy(false);
    }
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool={mode === 'protect' ? 'protect' : mode === 'unlock' ? 'unlock' : undefined}
      analyticsStatus={status}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      emptyStateMessage={intent === 'unlock' ? 'Drop PDF here to unlock' : 'Drop PDF here to protect'}
      fileLabel={file?.name}
      fileMeta={describeFile(file)}
    >
      {hasFiles && !mode && status === 'error' && readError && (
        <div class="tool-workspace">
          <ErrorMessage title="This file could not be read.">{readError}</ErrorMessage>
        </div>
      )}

      {hasFiles && mode && (
        <div class="tool-workspace">
          {noPassword ? (
            status === 'error' ? (
              <p class={styles.line}>Choose another file with Replace.</p>
            ) : (
              <p class={styles.line}>
                No password needed. This takes the protection off.{status === 'processing' ? ' Unlocking…' : ''}
              </p>
            )
          ) : (
            <form class={styles['unlock-form']} onSubmit={handleSubmit}>
              <label class={styles['unlock-label']} htmlFor="security-password">
                {mode === 'unlock' ? 'PDF password' : 'Set Password'}
              </label>
              <input
                ref={passwordRef}
                id="security-password"
                class={styles['unlock-password-input']}
                type="password"
                value={password}
                onInput={handlePasswordChange}
                placeholder={mode === 'unlock' ? "Enter the PDF's password" : "Enter a new password"}
                autoComplete={mode === 'unlock' ? "off" : "new-password"}
                autoFocus
              />

              <button
                type="submit"
                class={`${pdfToolStyles['tool-primary-action']}${status === 'processing' ? ` ${pdfToolStyles['is-processing']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
                disabled={!password || status === 'processing'}
              >
                {status === 'processing'
                  ? (mode === 'unlock' ? 'Unlocking…' : 'Protecting…')
                  : (mode === 'unlock' ? 'Unlock PDF' : 'Protect PDF')}
              </button>
            </form>
          )}

          {status === 'error' && <ErrorMessage>{errorText}</ErrorMessage>}

          {status === 'done' && downloadUrl && (
            <>
              <DownloadButton
                href={downloadUrl}
                download={outputFileName(file.name, mode)}
                label={`Download ${mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF`}
              />
              <PdfShareButton
                visible={shareReady}
                onShare={handleShare}
                label={`Share ${mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF`}
              />
              {mode === 'unlock' && outputBytes && (
                <>
                  <div class={styles['handoff-row']}>
                    <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => handOff('redact')}>
                      <Eraser size={16} aria-hidden="true" />
                      Redact it
                    </button>
                    <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => handOff('sign')}>
                      <FileSignature size={16} aria-hidden="true" />
                      Sign it
                    </button>
                  </div>
                  {handoffFailed && (
                    <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
                      Could not hand this off. Download it instead and open it there.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

    </BasePdfTool>
  );
}
