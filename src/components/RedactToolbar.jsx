import FullscreenButton from './FullscreenButton';
import ColorPickerMenu from './ColorPickerMenu';

export default function RedactToolbar({
  activeStyle,
  setActiveStyle,
  activeColor,
  setActiveColor,
  toggleFullscreen,
  isFullscreen,
  setConfirmResetOpen,
  handleSavePdf,
  elementsCount
}) {
  return (
    <div className="sign-toolbar-container" style={{ marginTop: 'var(--space-5)' }}>
      <div className="sign-toolbar" role="toolbar" aria-label="PDF redaction">
        <button
          type="button"
          className={`sign-tool-btn${activeStyle === 'blackout' ? ' active' : ''}`}
          onClick={() => setActiveStyle('blackout')}
          title="Draw black redaction boxes"
          aria-pressed={activeStyle === 'blackout'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="5" x2="15" y2="5" />
            <rect x="3" y="9.5" width="18" height="5" rx="1" fill="currentColor" stroke="none" />
            <line x1="4" y1="19" x2="12" y2="19" />
          </svg>
          <span className="sign-tool-btn-text">Solid Box</span>
        </button>

        {activeStyle === 'blackout' && (
          <ColorPickerMenu
            value={activeColor}
            onChange={setActiveColor}
            title="Box color"
            defaultColor="#000000"
          />
        )}

        <button
          type="button"
          className={`sign-tool-btn${activeStyle === 'blur' ? ' active' : ''}`}
          onClick={() => setActiveStyle('blur')}
          title="Draw blur redaction boxes"
          aria-pressed={activeStyle === 'blur'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="5" x2="15" y2="5" />
            <rect x="3" y="9.5" width="18" height="5" rx="1" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2.5 2" />
            <line x1="4" y1="19" x2="12" y2="19" />
          </svg>
          <span className="sign-tool-btn-text">Blur</span>
        </button>

        <FullscreenButton isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />

        <button
          type="button"
          className="sign-tool-btn sign-tool-btn-reset"
          onClick={() => setConfirmResetOpen(true)}
          title="Discard your work and start over"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 2v6h6" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
          </svg>
          <span className="sign-tool-btn-text">Start over</span>
        </button>

        <button
          type="button"
          className="sign-tool-btn sign-tool-btn-download"
          onClick={handleSavePdf}
          disabled={elementsCount === 0}
          title={elementsCount === 0 ? 'Add at least one redaction box first' : 'Apply redactions and download'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className="sign-tool-btn-text">Download</span>
        </button>
      </div>
    </div>
  );
}
