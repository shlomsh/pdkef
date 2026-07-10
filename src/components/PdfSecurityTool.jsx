import { useEffect, useRef, useState } from 'preact/hooks';
import { isPdfEncrypted, protectPdf, unlockPdf, WrongPasswordError, SecurityError } from '../lib/security.js';
import BasePdfTool from './BasePdfTool.jsx';
import PdfShareButton from './PdfShareButton.jsx';
import { usePdfShare } from '../lib/usePdfShare.js';

export default function PdfSecurityTool({ intent = 'unlock' }) {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  const [mode, setMode] = useState(null); // 'unlock' | 'protect' | null
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const downloadRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const handleFilesAdded = async (files) => {
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

  const handlePasswordChange = (event) => {
    setPassword(event.currentTarget.value);
    if (status !== 'idle') resetOutput();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file || !password || !mode) return;
    
    setStatus('processing');
    setAnnouncement(mode === 'unlock' ? 'Unlocking PDF…' : 'Protecting PDF…');

    try {
      const blob = mode === 'unlock' 
        ? await unlockPdf(file, password)
        : await protectPdf(file, password);
        
      setDownloadUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      prepare(blob, `${file.name.replace(/\.pdf$/i, '')}_${mode}ed.pdf`);
      setStatus('done');
      setAnnouncement(mode === 'unlock' 
        ? 'Your unlocked PDF is ready.'
        : 'Your protected PDF is ready.'
      );
    } catch (err) {
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

  const reset = () => {
    setFile(null);
    setPassword('');
    setMode(null);
    resetOutput();
    setAnnouncement('Cleared. Choose a PDF file to start again.');
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool 
      hasFiles={hasFiles} 
      onFilesAdded={handleFilesAdded} 
      multiple={false}
      emptyStateMessage={intent === 'unlock' ? 'Drop PDF here to unlock' : 'Drop PDF here to protect'}
    >
      {hasFiles && mode && (
        <div class="tool-workspace">
          <div class="list-header">
            <span class="list-count">{file.name}</span>
            <button type="button" class="clear-all" onClick={reset}>
              Start over
            </button>
          </div>

          <form class="unlock-form" onSubmit={handleSubmit}>
            <label class="unlock-label" htmlFor="security-password">
              {mode === 'unlock' ? 'PDF password' : 'Set Password'}
            </label>
            <input
              ref={passwordRef}
              id="security-password"
              class="unlock-password-input"
              type="password"
              value={password}
              onInput={handlePasswordChange}
              placeholder={mode === 'unlock' ? "Enter the PDF's password" : "Enter a new password"}
              autoComplete={mode === 'unlock' ? "off" : "new-password"}
              autoFocus
            />

            <button
              type="submit"
              class={`merge-button${status === 'processing' ? ' is-merging' : ''}${status === 'done' ? ' is-done' : ''}`}
              disabled={!password || status === 'processing'}
            >
              {status === 'processing' 
                ? (mode === 'unlock' ? 'Unlocking…' : 'Protecting…') 
                : (mode === 'unlock' ? 'Unlock PDF' : 'Protect PDF')}
            </button>
          </form>

          {status === 'error' && (
            <div class="error-message" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <span>
                <strong>That didn't work.</strong> {mode === 'unlock' ? 'The password may be incorrect.' : 'The file might already be encrypted or corrupted.'}
              </span>
            </div>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <a
                ref={downloadRef}
                class="download-button"
                href={downloadUrl}
                download={`${file.name.replace(/\.pdf$/i, '')}_${mode}ed.pdf`}
              >
                <svg class="download-check" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" class="check-circle" />
                  <path d="M7.5 12.5l3 3 6-6.5" class="check-mark" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </svg>
                Download {mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF
              </a>
              <PdfShareButton
                visible={canSharePdf && shareReady}
                onShare={handleShare}
                label={`Share ${mode === 'unlock' ? 'Unlocked' : 'Protected'} PDF`}
              />
              <button type="button" class="start-over" onClick={reset}>
                Start over
              </button>
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
