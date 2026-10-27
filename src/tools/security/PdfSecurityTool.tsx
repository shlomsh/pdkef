import { useEffect, useRef, useState } from 'preact/hooks';
import { Download, Eraser, FileEdit, FileSignature, Merge, Shrink } from 'lucide-preact';
import { protectPdf, unlockPdf, UnreadablePdfError, WrongPasswordError } from './security.js';
import { isPdfFile } from '../../lib/fileKind.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { useObjectUrls } from '../../lib/useObjectUrls.js';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import UnlockVerb from './verb/UnlockVerb.tsx';
import PagePreview from './PagePreview.tsx';
import { planPreview } from './previewPlan.js';
import ToolShell, { FileActions } from '../../shell/ToolShell.tsx';
import styles from './PdfSecurityTool.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import DownloadButton from '../../shell/DownloadButton.tsx';
import { useDownloadFlow } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { describeFile } from '../../lib/format.js';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { UNLOCK_RETURN_IDS, handoffHrefOf, type UnlockReturnId } from '../../lib/toolIds.ts';
import { outputFileName } from './outputName.ts';
import { englishSecurityMessages, type SecurityMessages } from './messages.ts';
import { formatMessage } from '../../lib/formatMessage.ts';

// The tools that can send a protected file here as a detour, and the way back to each. Unlock's done
// state leads with "Continue in <name>" for a file that arrived with that `from` (guidelines 13).
// Which tools those are, and their pages, come from the registry (src/lib/toolIds.ts); the name and icon are this tool's wording.
const RETURN_ICON: Record<UnlockReturnId, typeof Eraser> = {
  redact: Eraser,
  sign: FileSignature,
  compress: Shrink,
  'edit-pdf': FileEdit,
  merge: Merge,
};
const RETURN_NAME_KEY: Record<UnlockReturnId, keyof SecurityMessages> = {
  redact: 'returnRedact',
  sign: 'returnSign',
  compress: 'returnCompress',
  'edit-pdf': 'returnEditPdf',
  merge: 'returnMerge',
};
const RETURN_TO = Object.fromEntries(
  UNLOCK_RETURN_IDS.map((id) => [id, { Icon: RETURN_ICON[id], href: handoffHrefOf(id) as string }]),
) as Record<UnlockReturnId, { Icon: typeof Eraser; href: string }>;
type ReturnTool = UnlockReturnId;
const returnToolOf = (from: string | null): ReturnTool | null => (from && from in RETURN_TO ? from as ReturnTool : null);


export default function PdfSecurityTool({ intent = 'unlock', navigate = (href) => { window.location.href = href; }, messages }: {
  intent?: string;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
  messages?: Partial<SecurityMessages>;
}) {
  const t: SecurityMessages = { ...englishSecurityMessages, ...messages };
  // The result cell before there is a mode: the encryption check is running, or the file could not be read.
  const CHECKING_PLAN = { tag: t.tagChecking, source: 'none', locked: false, protectedDone: false } as const;
  const UNREADABLE_PLAN = { tag: t.tagNotReadable, source: 'none', locked: false, protectedDone: false } as const;
  const WRONG_PASSWORD = t.wrongPassword;
  const DAMAGED = t.damaged;
  // Not the file's fault: the unlock itself threw something other than a password or a read error.
  const UNLOCK_FAILED = t.unlockFailed;
  const PROTECT_FAILED = t.protectFailed;
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  useHoldUpdate(status === 'processing');
  useHoldUpdate(file !== null, 'open');
  const [mode, setMode] = useState<string | null>(null); // 'unlock' | 'protect' | null
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null); // what Download, Share and the hand-off row pass on
  const outputGenerationRef = useRef(0);
  const [noPassword, setNoPassword] = useState(false); // owner-password-only: unlocked with no password asked
  // The tool that sent the file here, if one did. Redact sends a protected file over as a detour, so
  // once it is open the way on is back to Redact, not a choice of next steps (ux-design-guidelines 13).
  const [origin, setOrigin] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [readError, setReadError] = useState<string | null>(null); // why the picked file could not be checked
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // The output exists only after a password submit, so it is not a usePreparedOutput build: this is
  // the finished result the shared flow shares, counts, and hands off.
  const unlocked = mode === 'unlock';
  const downloadFlow = useDownloadFlow({
    prepared: {
      status: outputBlob && status === 'done' ? 'ready' : 'idle',
      blob: outputBlob,
      url: downloadUrl,
      parts: null,
      generation: outputGenerationRef.current,
      prepareNow: () => {},
    },
    fileName: file && mode ? outputFileName(file.name, mode) : '',
    blocked: null,
    announce: setAnnouncement,
    messages: {
      ready: unlocked ? t.readyUnlocked : t.readyProtected,
      shared: unlocked ? t.sharedUnlocked : t.sharedProtected,
      canceled: t.canceled,
      shareError: t.shareError,
    },
    navigate,
  });
  const { shareReady, handoffBusy, handoffFailed, requestHandoff, onDownloadTap, handleShare, reset: resetDownloadFlow } = downloadFlow;
  // DEBT-18: both async paths here belong to one file, so they share one run.
  // `begin()` supersedes whatever was in flight (a second pick retires the
  // first file's encryption check), and resetOutput - which every file pick
  // and every password edit already calls - retires a running unlock/protect.
  // No keys: nothing invalidates a run without going through one of those.
  const fileRun = useLatestRun();

  const resetOutput = () => {
    fileRun.invalidate();
    resetDownloadFlow();
    setStatus('idle');
    clearDownload();
    setOutputBlob(null);
  };

  // Shared by the password form and the no-password path. Captured before the
  // await, and used instead of the `file`/`mode` state below, so the result can
  // never be written under a newer file's name.
  const runSecurity = async (sourceFile: File, sourceMode: string, pw: string) => {
    setStatus('processing');
    setAnnouncement(sourceMode === 'unlock' ? t.unlockingAnnounce : t.protectingAnnounce);
    const run = fileRun.begin();

    try {
      const blob = sourceMode === 'unlock'
        ? await unlockPdf(sourceFile, pw)
        : await protectPdf(sourceFile, pw);

      if (!run.isCurrent()) return;
      run.settle();
      setDownloadBlob(blob);
      outputGenerationRef.current += 1;
      setOutputBlob(blob);
      setStatus('done');
      setAnnouncement(sourceMode === 'unlock'
        ? t.readyUnlocked
        : t.readyProtected
      );
    } catch (err: any) {
      console.error(err);
      // Same rule on the way out: a failure for a file nobody is looking at
      // any more must not put the loaded one into an error state.
      if (!run.isCurrent()) return;
      const wrongPassword = err instanceof WrongPasswordError;
      // A file that would not open wraps what pdf-lib threw; report that, it is the frame that says where.
      if (!wrongPassword) reportError('pdf_tool_run', err instanceof UnreadablePdfError && err.cause instanceof Error ? err.cause : err, sourceMode);
      run.settle();
      setStatus('error');
      setErrorText(sourceMode !== 'unlock' ? PROTECT_FAILED : wrongPassword ? WRONG_PASSWORD : err instanceof UnreadablePdfError ? DAMAGED : UNLOCK_FAILED);
      if (wrongPassword) {
        setAnnouncement(t.incorrectPassword);
        passwordRef.current?.focus();
        passwordRef.current?.select();
      } else {
        setAnnouncement(sourceMode === 'unlock' ? (err instanceof UnreadablePdfError ? DAMAGED : UNLOCK_FAILED) : err.message || t.errorFallback);
      }
    }
  };

  const handleFilesAdded = async (files: FileList | File[], from: string | null = null) => {
    const incoming = Array.from(files).filter((f) => isPdfFile(f));
    if (incoming.length === 0) return;
    
    const selectedFile = incoming[0];
    setFile(selectedFile);
    setPassword('');
    resetOutput();
    setMode(null);
    setReadError(null);
    setNoPassword(false);
    setOrigin(from);
    recordAction('add_files');
    setAnnouncement(formatMessage(t.checkingFile, { name: selectedFile.name }));

    const run = fileRun.begin();
    let protection: Awaited<ReturnType<typeof probeEncryption>>;
    try {
      protection = await probeEncryption(await selectedFile.arrayBuffer());
    } catch (err: any) {
      console.error(err);
      if (!run.isCurrent()) return;
      reportError('pdf_tool_run', err, 'check_encryption');
      run.settle();
      const message = t.openFailed;
      setReadError(message);
      setStatus('error');
      setAnnouncement(formatMessage(t.couldNotRead, { message }));
      return;
    }
    // A slower check on a file that has since been replaced must not decide
    // the form's mode: offering Unlock for a file with no password sends
    // handleSubmit down the unlockPdf branch, which can only ever fail.
    if (!run.isCurrent()) return;
    run.settle();
    if (protection === 'unreadable') {
      const message = t.unreadable;
      setReadError(message);
      setStatus('error');
      setAnnouncement(formatMessage(t.couldNotRead, { message }));
      return;
    }
    const newMode = protection === 'open' ? 'protect' : 'unlock';
    setMode(newMode);

    if (protection === 'owner-restricted') {
      // Opens with an empty password: no field to show, the unlock just runs.
      setNoPassword(true);
      await runSecurity(selectedFile, 'unlock', '');
    } else if (newMode === 'unlock') {
      setAnnouncement(formatMessage(t.loadedUnlock, { name: selectedFile.name }));
    } else {
      setAnnouncement(formatMessage(t.loadedProtect, { name: selectedFile.name }));
    }
  };

  useHandoffIntake('unlock', (handedOff, from) => {
    // reason: handleFilesAdded catches and shows its own failure
    void handleFilesAdded([handedOff], from ?? null);
  });

  const handlePasswordChange = (event: Event) => {
    setPassword((event.currentTarget as HTMLInputElement).value);
    if (status !== 'idle') resetOutput();
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!file || !password || !mode) return;
    recordAction('export');
    await runSecurity(file, mode, password);
  };

  const hasFiles = !!file;
  const returnTool = returnToolOf(origin);
  const preview = planPreview({ mode: mode as 'unlock' | 'protect' | null, status, noPassword }, t);
  const previewSource = preview?.source === 'input' ? file : preview?.source === 'output' ? outputBlob : null;

  return (
    <BasePdfTool
      emptyArt={<UnlockVerb />}
      hasFiles={hasFiles}
      analyticsTool={mode === 'protect' ? 'protect' : mode === 'unlock' ? 'unlock' : undefined}
      pageTool={intent === 'protect' ? 'protect' : 'unlock'}
      // A mistyped password is the form working, not an operation that failed: it stays out of the failure count.
      analyticsStatus={status === 'error' && errorText === WRONG_PASSWORD ? 'needs_password' : status}
      onFilesAdded={(files: FileList | File[]) => handleFilesAdded(files)}
      multiple={false}
      emptyStateMessage={intent === 'unlock' ? t.emptyUnlock : t.emptyProtect}
      file={file}
      fileLabel={file?.name}
      fileMeta={describeFile(file)}
      hideIdentity
    >
      {hasFiles && (
        <div class={styles['loaded-layout']}>
          <div class={styles.strip}>
            <ToolShell flush>
              <FileActions />
            </ToolShell>
          </div>
          <div class={styles.controls}>
          {!mode && status === 'error' && readError && (
            <ErrorMessage title={t.readErrorTitle}>{readError}</ErrorMessage>
          )}
          {mode && (noPassword ? (
            <p class={styles.line}>
              {status === 'error'
                ? t.noPasswordFailed
                : status === 'done'
                  ? t.noPasswordDone
                  : status === 'processing' ? t.noPasswordProcessing : t.noPasswordTakesOff}
            </p>
          ) : !(mode === 'unlock' && status === 'done') && (
            // Once unlocked, the password has done its job and the form goes. Protect keeps its field:
            // there the password is a setting of the output, and changing it starts over.
            <form class={styles['unlock-form']} onSubmit={handleSubmit}>
              <label class={styles['unlock-label']} htmlFor="security-password">
                {mode === 'unlock' ? t.passwordLabelUnlock : t.passwordLabelProtect}
              </label>
              <input
                ref={passwordRef}
                id="security-password"
                class={styles['unlock-password-input']}
                type="password"
                value={password}
                onInput={handlePasswordChange}
                placeholder={mode === 'unlock' ? t.passwordPlaceholderUnlock : t.passwordPlaceholderProtect}
                autoComplete={mode === 'unlock' ? "off" : "new-password"}
                autoFocus
              />

              {/* One primary control with states: when the output exists, Download takes its place. */}
              {status !== 'done' && (
                <button
                  type="submit"
                  class={`${pdfToolStyles['tool-primary-action']}${status === 'processing' ? ` ${pdfToolStyles['is-processing']}` : ''}`}
                  disabled={!password || status === 'processing'}
                >
                  {status === 'processing'
                    ? (mode === 'unlock' ? t.unlocking : t.protecting)
                    : (mode === 'unlock' ? t.unlockPdf : t.protectPdf)}
                </button>
              )}
            </form>
          ))}

          {mode && status === 'error' && <ErrorMessage>{errorText}</ErrorMessage>}
          </div>

          {preview ? <PagePreview plan={preview} source={previewSource} failed={status === 'error'} label={t.firstPageLabel} /> : (
            <PagePreview plan={readError ? UNREADABLE_PLAN : CHECKING_PLAN} source={null} pending={!readError} label={t.firstPageLabel} />
          )}

          <div class={styles.actions}>
          {mode && status === 'done' && downloadUrl && (
            returnTool && mode === 'unlock' && outputBlob ? (
              <>
                <ContinueButton tool={returnTool} name={t[RETURN_NAME_KEY[returnTool]]} label={t.continueIn} disabled={handoffBusy} onClick={() => {
                  // reason: requestHandoff catches its own failure and shows the hand-off error
                  void requestHandoff(returnTool);
                }} />
                <div class={styles['handoff-row']}>
                  <a class={styles['handoff-button']} href={downloadUrl} download={outputFileName(file.name, mode)} onClick={onDownloadTap}>
                    <Download size={16} aria-hidden="true" />
                    {t.downloadUnlockedPdf}
                  </a>
                  <PdfShareButton visible={shareReady} onShare={handleShare} label={t.share} className={styles['handoff-button']} />
                </div>
              </>
            ) : (
              <>
                <DownloadButton
                  href={downloadUrl}
                  download={outputFileName(file.name, mode)}
                  label={mode === 'unlock' ? t.downloadLabelUnlocked : t.downloadLabelProtected}
                  onClick={onDownloadTap}
                />
                <PdfShareButton visible={shareReady} onShare={handleShare} label={t.share} />
                {mode === 'unlock' && outputBlob && (
                  <div class={styles['handoff-row']}>
                    <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => {
                      // reason: requestHandoff catches its own failure and shows the hand-off error
                      void requestHandoff('redact');
                    }}>
                      <Eraser size={16} aria-hidden="true" />
                      {t.redactIt}
                    </button>
                    <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => {
                      // reason: requestHandoff catches its own failure and shows the hand-off error
                      void requestHandoff('sign');
                    }}>
                      <FileSignature size={16} aria-hidden="true" />
                      {t.signIt}
                    </button>
                  </div>
                )}
              </>
            )
          )}

          {status === 'done' && handoffFailed && (
            <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
              {t.handoffFailed}
            </p>
          )}
          </div>
        </div>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

    </BasePdfTool>
  );
}

/** The done state's primary control when another tool sent the file here: the way back to that tool. */
function ContinueButton({ tool, name, label, disabled, onClick }: { tool: ReturnTool; name: string; label: string; disabled: boolean; onClick: () => void }) {
  const { Icon } = RETURN_TO[tool];
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <button ref={ref} type="button" class={`${pdfToolStyles['download-button']} ${styles['continue-button']}`} disabled={disabled} onClick={onClick}>
      <Icon size={20} aria-hidden="true" />
      <span class={pdfToolStyles['download-button-label']}>{formatMessage(label, { name })}</span>
    </button>
  );
}
