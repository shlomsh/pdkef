import { useState, useEffect, useRef } from 'preact/hooks';
import { useSignTool } from './SignToolContext.jsx';
import FullscreenButton from '../FullscreenButton';
import Popover from '../Popover.jsx';
import ToolShell, { FILE_ACTIONS, useToolShell } from '../ToolShell.jsx';
import styles from './SignToolbar.module.css';
import controlStyles from '../EditorControls.module.css';

// The tools that live behind the Shapes button, so its pressed/locked state and
// its lock target read from one list instead of three copies of the same array.
const SHAPE_TOOLS = ['ellipse', 'rectangle', 'line'];
// Tools drawn by dragging rather than by a single click, which is the one thing
// the status line phrases differently. Derived from SHAPE_TOOLS so adding a
// shape does not need this list updated too.
const DRAG_DRAWN_TOOLS = ['whiteout', ...SHAPE_TOOLS];

export default function SignToolbar({
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
  onSavePdf,
  onDownloadPdf,
  onSharePdf,
  canSharePdf = false,
  shareReady = false
}) {
  const { state, dispatch } = useSignTool();
  const selectedTool = state.selectedTool;
  const toolLocked = state.toolLocked;
  const { requestReplace } = useToolShell();

  const [showSigDropdown, setShowSigDropdown] = useState(false);
  const [showShapesDropdown, setShowShapesDropdown] = useState(false);
  // Which shape the Shapes button stands for once its menu has closed. The
  // button is the shape tool's button, so locking has to know what to lock
  // even after the one-shot placement has already disarmed the tool.
  const [lastShape, setLastShape] = useState(null);

  const shapesCloseTimer = useRef(null);
  const openShapes = () => {
    clearTimeout(shapesCloseTimer.current);
    setShowShapesDropdown(true);
  };
  const scheduleCloseShapes = () => {
    clearTimeout(shapesCloseTimer.current);
    shapesCloseTimer.current = setTimeout(() => setShowShapesDropdown(false), 180);
  };

  const sigCloseTimer = useRef(null);
  const openSig = () => {
    clearTimeout(sigCloseTimer.current);
    if (savedSignatures.length > 0) {
      setShowSigDropdown(true);
    }
  };
  const scheduleCloseSig = () => {
    clearTimeout(sigCloseTimer.current);
    sigCloseTimer.current = setTimeout(() => setShowSigDropdown(false), 180);
  };

  useEffect(() => {
    return () => {
      clearTimeout(shapesCloseTimer.current);
      clearTimeout(sigCloseTimer.current);
    };
  }, []);

  const handleSignatureBtnClick = () => {
    if (savedSignatures.length === 0) {
      setDialogOpen(true);
    }
  };

  const handleSelectSavedSignature = (sig) => {
    setActiveSignature(sig);
    dispatch({ type: 'SET_TOOL', payload: 'signature' });
    setShowSigDropdown(false);
    setAnnouncement('Signature tool active. Click anywhere on a page to place.');
  };

  const setSelectedTool = (tool) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
  };

  // A tool arms for a single placement. Double-click locks it on for repeats -
  // the Figma/Illustrator convention. `detail` is the click count on the same
  // button, so the second click of a double-click locks instead of toggling the
  // tool back off; no dblclick handler and no timer needed.
  const armTool = (tool, label) => (e) => {
    if (e.detail >= 2) {
      lockTool(tool, label);
      return;
    }
    const next = selectedTool === tool ? null : tool;
    setSelectedTool(next);
    if (next) setAnnouncement(`${label} tool active. Click a page to place one.`);
  };

  const lockTool = (tool, label) => {
    dispatch({ type: 'SET_TOOL', payload: { tool, locked: true } });
    setAnnouncement(`${label} tool locked on. Press Escape to stop adding.`);
  };

  const chooseShape = (tool) => {
    setSelectedTool(tool);
    setLastShape(tool);
    setShowShapesDropdown(false);
    setAnnouncement(`${tool} tool active. Drag on a page to draw one.`);
  };

  // Shapes locks from its own button rather than from a menu item, because a
  // menu item cannot be double-clicked: the first click closes the popover and
  // unmounts it, so the second click would land on whatever is underneath -
  // possibly the page, placing an element nobody asked for. The button is the
  // shape tool's button, so double-clicking it is the same gesture as on Text.
  // A real dblclick handler is safe here (unlike the toggle buttons, where the
  // second click would disarm before the lock landed): the two clicks only
  // toggle the popover, never the tool.
  const lockShape = () => {
    const shape = SHAPE_TOOLS.includes(selectedTool) ? selectedTool : lastShape;
    if (!shape) return;
    lockTool(shape, shape);
    setShowShapesDropdown(false);
  };

  return (
    <>
      <ToolShell editor>
        <div className={styles.toolbar} role="toolbar" aria-label="PDF annotations">
          <button
            type="button"
            className={`${styles.button}${selectedTool === 'text' ? ` ${styles.active}` : ''}${selectedTool === 'text' && toolLocked ? ` ${styles.locked}` : ''}`}
            onClick={armTool('text', 'Text')}
            title="Click here, then click a page to add text. Double-click to keep adding"
            aria-pressed={selectedTool === 'text'}
            data-label-priority="1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
            <span className={styles.label}>Text</span>
          </button>

          <button
            type="button"
            className={`${styles.button}${selectedTool === 'symbol' ? ` ${styles.active}` : ''}${selectedTool === 'symbol' && toolLocked ? ` ${styles.locked}` : ''}`}
            onClick={armTool('symbol', 'Symbols')}
            title="Click here, then click a page to place symbols. Double-click to keep adding"
            aria-pressed={selectedTool === 'symbol'}
            data-label-priority="1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className={styles.label}>Symbols</span>
          </button>

          <div
            className={styles.dropdown}
            onMouseEnter={openShapes}
            onMouseLeave={scheduleCloseShapes}
            onDblClick={lockShape}
          >
            <Popover
              open={showShapesDropdown}
              onOpenChange={setShowShapesDropdown}
              placement="bottom-start"
              trigger={
                <button
                  type="button"
                  className={`${styles.button}${SHAPE_TOOLS.includes(selectedTool) ? ` ${styles.active}` : ''}${SHAPE_TOOLS.includes(selectedTool) && toolLocked ? ` ${styles.locked}` : ''}`}
                  title="Click here to select a shape. Double-click to keep adding"
                  aria-pressed={SHAPE_TOOLS.includes(selectedTool)}
                  data-label-priority="1"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 3l4 7H8z" />
                    <circle cx="7" cy="17" r="4" />
                    <rect x="13" y="13" width="8" height="8" rx="1" />
                  </svg>
                  <span className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    Shapes
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
              }
              content={
                <div 
                  className={controlStyles.popover}
                  role="menu" 
                  style={{ minWidth: '140px', borderRadius: '12px', padding: '0.25rem' }}
                  onMouseEnter={openShapes}
                  onMouseLeave={scheduleCloseShapes}
                >
                  <div className={`${controlStyles['dropdown-list']} ${controlStyles.clean}`}>
                    <button
                      type="button"
                      className={controlStyles['menu-item']}
                      onClick={() => chooseShape('ellipse')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <ellipse cx="12" cy="12" rx="10" ry="7" />
                      </svg>
                      Ellipse
                    </button>
                    <button
                      type="button"
                      className={controlStyles['menu-item']}
                      onClick={() => chooseShape('rectangle')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="6" width="18" height="12" rx="2" />
                      </svg>
                      Rectangle
                    </button>
                    <button
                      type="button"
                      className={controlStyles['menu-item']}
                      onClick={() => chooseShape('line')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <line x1="4" y1="20" x2="20" y2="4" />
                      </svg>
                      Line
                    </button>
                  </div>
                </div>
              }
            />
          </div>

          <button
            type="button"
            className={`${styles.button}${selectedTool === 'whiteout' ? ` ${styles.active}` : ''}${selectedTool === 'whiteout' && toolLocked ? ` ${styles.locked}` : ''}`}
            onClick={armTool('whiteout', 'Whiteout')}
            title="Click here, then drag on a page to hide text. Double-click to keep adding"
            data-label-priority="1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
              <path d="M22 21H7" />
              <path d="m13.3 4 5.3 5.3" />
            </svg>
            <span className={styles.label}>Whiteout</span>
          </button>

          <div
            className={styles.dropdown}
            onMouseEnter={openSig}
            onMouseLeave={scheduleCloseSig}
          >
            <Popover
              open={showSigDropdown}
              onOpenChange={setShowSigDropdown}
              placement="bottom-start"
              trigger={
                <button
                  type="button"
                  className={`${styles.button}${selectedTool === 'signature' ? ` ${styles.active}` : ''}`}
                  onClick={handleSignatureBtnClick}
                  title="Click here to select or create a signature"
                  aria-pressed={selectedTool === 'signature'}
                  data-label-priority="1"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 15c2 0 2.5-9 4.5-9s1 11 3 11 2.5-9 4.5-9 1.5 7 3 7c1 0 1.7-1 2.5-2" />
                    <path d="M3 21h18" />
                  </svg>
                  <span className={styles.label}>Sign</span>
                </button>
              }
              content={
                <div
                  className={controlStyles.popover}
                  data-editor-signature-popover
                  role="menu"
                  style={{ borderRadius: '12px', padding: '0.25rem' }}
                  onMouseEnter={openSig}
                  onMouseLeave={scheduleCloseSig}
                >
                  <div className={`${controlStyles['dropdown-list']} ${controlStyles.clean}`}>
                    {savedSignatures.map((sig) => (
                      <div
                        key={sig.id}
                        className={controlStyles['dropdown-item']}
                        data-editor-signature-item
                        role="menuitem"
                        onClick={() => handleSelectSavedSignature(sig)}
                      >
                        <img src={sig.dataUrl} alt="Saved signature" />
                        <button
                          type="button"
                          className={controlStyles['dropdown-item-delete']}
                          data-editor-signature-delete
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSavedSignature(sig.id, e);
                          }}
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
                    className={controlStyles['dropdown-add-button']}
                    onClick={() => {
                      setShowSigDropdown(false);
                      setDialogOpen(true);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span className={styles.label}>New Signature</span>
                  </button>
                </div>
              }
            />
          </div>

          <button
            type="button"
            className={styles.button}
            onClick={() => setUndoModalOpen(true)}
            title="Undo changes"
            disabled={actionHistory.length === 0}
            data-label-priority="2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
            <span className={styles.label}>Undo</span>
          </button>

          <FullscreenButton isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />

          {/* The united file action, in the exact slot Start over used to hold.
              Both meant "I want a different file"; this one says it once and
              actually gets you there. BasePdfTool decides whether swapping the
              file needs confirming - see requestReplace. */}
          <button
            type="button"
            className={`${styles.button} ${styles.highlight}`}
            onClick={requestReplace}
            title={FILE_ACTIONS.replace.title}
            aria-label={FILE_ACTIONS.replace.label}
            data-label-priority="2"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d={FILE_ACTIONS.replace.icon} />
            </svg>
            <span className={styles.label}>{FILE_ACTIONS.replace.shortLabel}</span>
          </button>

          <button
            type="button"
            className={`${styles.button} ${styles.download}${canSharePdf ? ` ${styles['desktop-download']}` : ''}`}
            onClick={onDownloadPdf}
            title="Save your changes and download the signed PDF"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className={styles.label}>Download</span>
          </button>

          {canSharePdf && (
            <button
              type="button"
              className={`${styles.button} ${styles.share}`}
              onClick={shareReady ? onSharePdf : onSavePdf}
              title={shareReady ? 'Share the signed PDF' : 'Save your changes to share the signed PDF'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
              </svg>
              <span className={styles.label}>{shareReady ? 'Share now' : 'Share'}</span>
            </button>
          )}
        </div>
      </ToolShell>

      {/* Status Helper */}
      {selectedTool ? (
        <div className={styles.help} role="status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            {DRAG_DRAWN_TOOLS.includes(selectedTool)
              ? <>Click and drag on a PDF page below to draw your <strong>{selectedTool}</strong>.</>
              : <>Click anywhere on the PDF pages below to place your <strong>{selectedTool}</strong> layer.</>}
            {toolLocked
              ? <> The tool stays on until you press <strong>Esc</strong>.</>
              : <> One at a time. Double-click the tool to keep adding.</>}
          </span>
        </div>
      ) : (
        <div className={styles.help} style={{ color: 'var(--color-muted-light)' }}>
          <span>Tip: Select a tool above and click on the PDF to place, or drag existing items. Double-click a text box to edit it, and hover a line to adjust it.</span>
        </div>
      )}
    </>
  );
}
