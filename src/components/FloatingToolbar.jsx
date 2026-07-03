import { useState, useEffect } from 'preact/hooks';
import FullscreenButton from './FullscreenButton';

export default function FloatingToolbar({
  selectedTool,
  setSelectedTool,
  setAnnouncement,
  savedSignatures,
  activeSignature,
  setActiveSignature,
  onDeleteSavedSignature,
  setDialogOpen,
  setUndoModalOpen,
  actionHistory,
  toggleFullscreen,
  isFullscreen,
  setConfirmResetOpen,
  onSavePdf
}) {
  const [showSigDropdown, setShowSigDropdown] = useState(false);

  // Handle outside clicks to close the signature dropdown
  useEffect(() => {
    if (!showSigDropdown) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.sign-dropdown-trigger') && !e.target.closest('.sign-dropdown-menu')) {
        setShowSigDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [showSigDropdown]);

  const handleSignatureBtnClick = () => {
    if (savedSignatures.length > 0) {
      setShowSigDropdown(!showSigDropdown);
    } else {
      setDialogOpen(true);
    }
  };

  const handleSelectSavedSignature = (sig) => {
    setActiveSignature(sig);
    setSelectedTool('signature');
    setShowSigDropdown(false);
    setAnnouncement('Signature tool active. Click anywhere on a page to place.');
  };

  return (
    <>
      <div className="sign-toolbar-container">
        <div className="sign-toolbar" role="toolbar" aria-label="PDF annotations">
          <button
            type="button"
            className={`sign-tool-btn${selectedTool === 'text' ? ' active' : ''}`}
            onClick={() => {
              setSelectedTool(selectedTool === 'text' ? null : 'text');
              setAnnouncement('Text tool active. Click anywhere on a page to place.');
            }}
            title="Click here, then click a page to add text"
            aria-pressed={selectedTool === 'text'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
            <span className="sign-tool-btn-text">Text</span>
          </button>

          <button
            type="button"
            className={`sign-tool-btn${selectedTool === 'checkmark' ? ' active' : ''}`}
            onClick={() => {
              setSelectedTool(selectedTool === 'checkmark' ? null : 'checkmark');
              setAnnouncement('Checkmark tool active. Click a page to place.');
            }}
            title="Click here, then click a page to tick checkboxes"
            aria-pressed={selectedTool === 'checkmark'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="sign-tool-btn-text">Check</span>
          </button>

          <button
            type="button"
            className={`sign-tool-btn${selectedTool === 'whiteout' ? ' active' : ''}`}
            onClick={() => {
              setSelectedTool(selectedTool === 'whiteout' ? null : 'whiteout');
              setAnnouncement('Whiteout tool active. Click a page to place.');
            }}
            title="Click here, then click a page to hide text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="5" x2="15" y2="5" />
              <rect x="3" y="9.5" width="18" height="5" rx="1" fill="currentColor" stroke="none" />
              <line x1="4" y1="19" x2="12" y2="19" />
            </svg>
            <span className="sign-tool-btn-text">Whiteout</span>
          </button>

          <div className="sign-tool-dropdown-container">
            <button
              type="button"
              className={`sign-tool-btn sign-dropdown-trigger${selectedTool === 'signature' ? ' active' : ''}`}
              onClick={handleSignatureBtnClick}
              title="Click here to select or create a signature"
              aria-pressed={selectedTool === 'signature'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 15c2 0 2.5-9 4.5-9s1 11 3 11 2.5-9 4.5-9 1.5 7 3 7c1 0 1.7-1 2.5-2" />
                <path d="M3 21h18" />
              </svg>
              <span className="sign-tool-btn-text">Sign</span>
            </button>

            {showSigDropdown && (
              <>
                <div className="sign-dropdown-backdrop" onClick={() => setShowSigDropdown(false)} />
                <div className="sign-dropdown-menu" role="menu">
                  <div className="sign-dropdown-list">
                    {savedSignatures.map((sig) => (
                      <div
                        key={sig.id}
                        className="sign-dropdown-item"
                        role="menuitem"
                        onClick={() => handleSelectSavedSignature(sig)}
                      >
                        <img src={sig.dataUrl} alt="Saved signature" />
                        <button
                          type="button"
                          className="sign-dropdown-item-delete"
                          onClick={(e) => onDeleteSavedSignature(sig.id, e)}
                          title="Delete signature"
                          aria-label="Delete signature"
                        >
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="sign-dropdown-add-btn"
                    onClick={() => {
                      setShowSigDropdown(false);
                      setDialogOpen(true);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span className="sign-tool-btn-text">New Signature</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="sign-tool-btn"
            onClick={() => setUndoModalOpen(true)}
            title="Undo changes"
            disabled={actionHistory.length === 0}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
            <span className="sign-tool-btn-text">Undo</span>
          </button>

          <FullscreenButton isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />

          <button
            type="button"
            className="sign-tool-btn sign-tool-btn-reset"
            onClick={() => setConfirmResetOpen(true)}
            title="Discard your work and start over"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 2v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
            </svg>
            <span className="sign-tool-btn-text">Start over</span>
          </button>

          <button
            type="button"
            className="sign-tool-btn sign-tool-btn-download"
            onClick={onSavePdf}
            title="Save your changes and download the signed PDF"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="sign-tool-btn-text">Download</span>
          </button>
        </div>
      </div>

      {/* Status Helper */}
      {selectedTool ? (
        <div className="sign-help-tip" role="status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Click anywhere on the PDF pages below to place your <strong>{selectedTool}</strong> layer.</span>
        </div>
      ) : (
        <div className="sign-help-tip" style={{ color: 'var(--color-muted-light)' }}>
          <span>Tip: Select a tool above and click on the PDF to place, or drag existing items. Click outside item to deselect.</span>
        </div>
      )}
    </>
  );
}
