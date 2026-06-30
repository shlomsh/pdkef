import { useEffect, useRef, useState } from 'preact/hooks';
import { protectPdf, ProtectError } from '../lib/protect.js';
import BasePdfTool from './BasePdfTool.jsx';

export default function PdfProtectTool() {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const downloadRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  const resetOutput = () => {
    setStatus('idle');
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const handleFilesAdded = (files) => {
    const incoming = Array.from(files).filter((f) => f.type === 'application/pdf');
    if (incoming.length === 0) return;
    setFile(incoming[0]);
    setPassword('');
    resetOutput();
    setAnnouncement(`File "${incoming[0].name}" loaded. Enter a password to protect it.`);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.currentTarget.value);
    if (status !== 'idle') resetOutput();
  };

  const handleProtect = async (event) => {
    event.preventDefault();
    if (!file || !password) return;
    setStatus('processing');
    setAnnouncement('Protecting PDF…');

    try {
      const blob = await protectPdf(file, password);
      setDownloadUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setStatus('done');
      setAnnouncement('Your protected PDF is ready to download.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to protect PDF. It might already be encrypted or corrupted.');
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }
  };

  const reset = () => {
    setFile(null);
    setPassword('');
    resetOutput();
    setAnnouncement('Cleared. Choose a PDF file to start again.');
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool hasFiles={hasFiles} onFilesAdded={handleFilesAdded} multiple={false}>
      {hasFiles && (
        <div class="tool-workspace">
          <div class="list-header">
            <span class="list-count">{file.name}</span>
            <button type="button" class="clear-all" onClick={reset}>
              Start over
            </button>
          </div>

          <form class="unlock-form" onSubmit={handleProtect}>
            <label class="unlock-label" htmlFor="protect-password">
              Set Password
            </label>
            <input
              ref={passwordRef}
              id="protect-password"
              class="unlock-password-input"
              type="password"
              value={password}
              onInput={handlePasswordChange}
              placeholder="Enter a new password"
              autoComplete="new-password"
              autoFocus
            />

            <button
              type="submit"
              class={`merge-button${status === 'processing' ? ' is-merging' : ''}${status === 'done' ? ' is-done' : ''}`}
              disabled={!password || status === 'processing'}
            >
              {status === 'processing' ? 'Protecting…' : 'Protect PDF'}
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
                <strong>That didn't work.</strong> The file might already be encrypted or corrupted.
              </span>
            </div>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <a
                ref={downloadRef}
                class="download-button"
                href={downloadUrl}
                download={`${file.name.replace(/\.pdf$/i, '')}_protected.pdf`}
              >
                <svg class="download-check" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" class="check-circle" />
                  <path d="M7.5 12.5l3 3 6-6.5" class="check-mark" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </svg>
                Download Protected PDF
              </a>
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
