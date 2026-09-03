import { useRef, useState } from 'preact/hooks';
import { isPdfEncrypted, protectPdf, unlockPdf, WrongPasswordError } from '../lib/security.js';
import { useObjectUrls } from '../lib/useObjectUrls.js';
import BasePdfTool from './BasePdfTool.tsx';
import styles from './PdfSecurityTool.module.css';
import pdfToolStyles from './PdfTool.module.css';
import PdfShareButton from './PdfShareButton.tsx';
import ErrorMessage from './ErrorMessage.tsx';
import DownloadButton from './DownloadButton.tsx';
import { usePdfShare } from '../lib/usePdfShare.js';
import { describeFile } from '../lib/format.js';

export default function PdfSecurityTool({ intent = 'unlock' }: { intent?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  const [mode, setMode] = useState<string | null>(null); // 'unlock' | 'protect' | null
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    clearDownload();
  };

  const handleFilesAdded = async (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type === 'application/pdf');
    if (incoming.length === 0) return;
    
    const selectedFile = incoming[0];
    setFile(selectedFile);
    setPassword('');
    resetOutput();
    setMode(null);
    setAnnouncement(`Checking file "${selectedFile.name}"...`);

    const encrypted = await isPdfEncrypted(selectedFile);
    const newMode = encrypted ? 'unlock' : 'protect';
    setMode(newMode);
    
    if (newMode === 'unlock') {
      setAnnouncement(`File "${selectedFile.name}" loaded. Enter its password to unlock.`);
    } else {
      setAnnouncement(`File "${selectedFile.name}" loaded. Enter a password to protect it.`);
    }
  };

  const handlePasswordChange = (event: Event) => {
    setPassword((event.currentTarget as HTMLInputElement).value);
    if (status !== 'idle') resetOutput();
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!file || !password || !mode) return;
    
    setStatus('processing');
    setAnnouncement(mode === 'unlock' ? 'Unlocking PDF…' : 'Protecting PDF…');

    try {
      const blob = mode === 'unlock' 
        ? await unlockPdf(file, password)
        : await protectPdf(file, password);
        
      setDownloadBlob(blob);
      prepare(blob, `${file.name.replace(/\.pdf$/i, '')}_${mode}ed.pdf`);
      setStatus('done');
      setAnnouncement(mode === 'unlock' 
        ? 'Your unlocked PDF is ready.'
        : 'Your protected PDF is ready.'
      );
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      if (err instanceof WrongPasswordError) {
        setAnnouncement('Incorrect password.');
      } else {
        setAnnouncement(err.message || 'An error occurred.');
      }
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement(`${mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF shared successfully.`);
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your PDF is still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      emptyStateMessage={intent === 'unlock' ? 'Drop PDF here to unlock' : 'Drop PDF here to protect'}
      fileLabel={file?.name}
      fileMeta={describeFile(file)}
      hasWork={status === 'done' || password !== ''}
      workNoun="the password you entered"
    >
      {hasFiles && mode && (
        <div class="tool-workspace">
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

          {status === 'error' && (
            <ErrorMessage>
              {mode === 'unlock' ? 'The password may be incorrect.' : 'The file might already be encrypted or corrupted.'}
            </ErrorMessage>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <DownloadButton
                href={downloadUrl}
                download={`${file.name.replace(/\.pdf$/i, '')}_${mode}ed.pdf`}
                label={`Download ${mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF`}
              />
              <PdfShareButton
                visible={shareReady}
                onShare={handleShare}
                label={`Share ${mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF`}
              />
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
