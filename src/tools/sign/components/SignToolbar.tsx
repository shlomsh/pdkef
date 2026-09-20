import { useState, useEffect, useRef } from 'preact/hooks';
import { useSignTool } from './SignToolContext.tsx';
import { useSavedSignatures } from './SavedSignaturesContext.tsx';
import SignFeedbackButton from './SignFeedbackButton.tsx';
import ViewControl from '../../../editor-ui/ViewControl.tsx';
import Popover from '../../../shell/Popover.tsx';
import EditorToolStatus from '../../../editor-ui/EditorToolStatus.tsx';
import ArmHint from '../../../editor-ui/ArmHint.tsx';
import ExportReadinessNotice from './ExportReadinessNotice.tsx';
import EditorExportActions from '../../../editor-ui/EditorExportActions.tsx';
import ToolShell, { FILE_ACTIONS, useToolShell } from '../../../shell/ToolShell.tsx';
import { makeArmTool, useAutoArmHint } from '../../../editor-ui/hooks/toolArming.js';
import { englishShellMessages, englishSignMessages, formatMessage, type SignMessages } from '../../../i18n/toolMessages';
import type { ActionHistoryEntry } from '../../../editor/model/actionHistory.ts';
import type { SavedSignature } from '../../../editor/model/savedSignature.ts';
import type { SignToolType } from '../../../editor/model/editorModel.ts';
import type { FieldNavigation } from '../useFieldNavigation.ts';
import type { FormDetectionState } from '../useFormFieldRegions.ts';
import styles from '../../../editor-ui/SignToolbar.module.css';
import controlStyles from '../../../editor-ui/EditorControls.module.css';

// The tools that live behind the Shapes button, so its pressed/locked state and
// its lock target read from one list instead of three copies of the same array.
type ShapeTool = Extract<SignToolType, 'ellipse' | 'rectangle' | 'line'>;
const SHAPE_TOOLS: readonly ShapeTool[] = ['ellipse', 'rectangle', 'line'];
const isShapeTool = (tool: SignToolType | null): tool is ShapeTool => (
  tool !== null && SHAPE_TOOLS.includes(tool as ShapeTool)
);

// Every SignToolType TOOL_COPY (below) has an entry for - a static list rather
// than deriving it from TOOL_COPY's own keys, since TOOL_COPY is now built
// per-render from the message catalogue (LOC-09 stage 1) and this guard has to
// exist before that render happens.
const SIGN_TOOL_TYPES: readonly SignToolType[] = ['text', 'date', 'symbol', 'signature', 'whiteout', 'ellipse', 'rectangle', 'line'];
const isSignToolType = (tool: string): tool is SignToolType => (SIGN_TOOL_TYPES as readonly string[]).includes(tool);

// What this file's own tests (and any other caller that has no fields to
// navigate) fall back to, same reasoning as PdfWorkspace.tsx's own copy of
// this constant: a fixed "nothing to do here" value rather than an optional
// prop every read site has to guard.
/** Nothing claimed about the document yet - the toolbar's own tests and any
 * caller that does not run the detector get this and say nothing. */
const NO_FORM_DETECTION: FormDetection = { state: 'pending', count: 0, detail: null };

/** What the detector found, as the toolbar needs it: the state of the one walk
 * per file, and how many regions it came back with. Regions themselves never
 * reach the toolbar - a count is the whole of what the copy may say, and a
 * label out of somebody's form is document content. */
export interface FormDetection {
  state: FormDetectionState;
  count: number;
  /**
   * One sanitised line naming what the walk died of, when it died - the
   * Feedback report's only automatic content. Null in every other state.
   * `formDetectionDetail.ts` is what makes it safe to carry; nothing else may
   * put an error into this field.
   */
  detail?: string | null;
}

const NOOP_FIELD_NAVIGATION: FieldNavigation = {
  hasFields: false,
  hasNext: false,
  hasPrevious: false,
  direction: 'ltr',
  goToNext: () => {},
  goToPrevious: () => {},
};

export default function SignToolbar({
  setAnnouncement,
  setDialogOpen,
  actionHistory,
  onUndo,
  onRedo,
  canRedo,
  toggleFullscreen,
  isFullscreen,
  onSavePdf,
  onDownloadPdf,
  onSharePdf,
  canSharePdf = false,
  shareReady = false,
  exporting = false,
  exportBlocked = false,
  exportIssueCount = 0,
  onReviewExportIssues = () => {},
  fieldNavigation = NOOP_FIELD_NAVIGATION,
  formDetection = NO_FORM_DETECTION,
  messages,
}: {
  setAnnouncement: (msg: string) => void;
  setDialogOpen: (open: boolean) => void;
  /** Newest-first log of the add/delete commands Undo can step back through;
   * the toolbar reads only its length, to disable Undo at the start. */
  actionHistory: ActionHistoryEntry[];
  /** One tap, one step back - the same thing Cmd/Ctrl+Z does. */
  onUndo: () => void;
  /** One tap forward again - Shift+Cmd/Ctrl+Z or Ctrl+Y. */
  onRedo: () => void;
  /** Whether anything has been undone that Redo could bring back. Required,
   * not defaulted: a caller that wired the handlers and forgot the flag would
   * typecheck and ship a Redo button that never enables. */
  canRedo: boolean;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  onSavePdf: () => void;
  onDownloadPdf: () => void;
  onSharePdf: () => void;
  canSharePdf?: boolean;
  shareReady?: boolean;
  /** True while a signed PDF is being generated - guards Save/Share/Download
   * against re-entry so a second click can't start an overlapping export. */
  exporting?: boolean;
  /** Preflight result supplied by the workspace; the toolbar never re-checks text. */
  exportBlocked?: boolean;
  exportIssueCount?: number;
  onReviewExportIssues?: () => void;
  /** Next/Previous across the document's own detected fields (MOBI-06);
   * PdfWorkspace.tsx passes the one PdfSignTool.tsx built, so its Tab shortcut
   * and this toolbar's control read the same hasNext/hasPrevious. */
  fieldNavigation?: FieldNavigation;
  /** FORM-11: the result of the one form-field detection run for this file
   * (`useFormFieldRegions`), which PdfWorkspace derives from the regions it
   * already holds. Counted, never quoted. */
  formDetection?: FormDetection;
  /** LOC-09 stage 1: the always-visible toolbar row's own catalogue - see
   * src/i18n/toolMessages.ts's SignMessages. Optional and English-default so
   * every existing caller (this file's own tests included) is unaffected;
   * PdfSignTool.tsx is the only caller passing a Hebrew edition. */
  messages?: Partial<SignMessages>;
}) {
  const { state, dispatch } = useSignTool();
  const selectedTool = state.selectedTool;
  const toolLocked = state.toolLocked;
  const { requestReplace, messages: shellMessages = englishShellMessages } = useToolShell();
  const { savedSignatures, activeSignature, setActiveSignature, onDeleteSavedSignature } = useSavedSignatures();
  const exportDisabled = exporting || exportBlocked;

  const t: SignMessages = { ...englishSignMessages, ...messages };

  // TOOL_COPY owns every tool-facing string (CLAUDE.md's editor rule) - built
  // from `t` per render rather than as a module constant (LOC-09 stage 1), so
  // a Hebrew catalogue reaches it the same way the English default does. Not
  // memoized: `t` is a fresh object every render (the spread above), so a
  // memo keyed on it would recompute every render anyway.
  const TOOL_COPY: Record<SignToolType, { action: string; button: string }> = {
    text:      { action: t.textAction,      button: t.textButton },
    date:      { action: t.dateAction,      button: t.dateButton },
    symbol:    { action: t.symbolAction,    button: t.symbolsButton },
    signature: { action: t.signatureAction, button: t.signButton },
    whiteout:  { action: t.whiteoutAction,  button: t.whiteoutButton },
    ellipse:   { action: t.ellipseAction,   button: t.shapesButton },
    rectangle: { action: t.rectangleAction, button: t.shapesButton },
    line:      { action: t.lineAction,      button: t.shapesButton },
  };

  const blockedExportTitle = formatMessage(exportIssueCount === 1 ? t.exportBlockedTitleOne : t.exportBlockedTitleOther, { count: exportIssueCount });

  const [showSigDropdown, setShowSigDropdown] = useState(false);
  const [showShapesDropdown, setShowShapesDropdown] = useState(false);
  // Which shape the Shapes button stands for once its menu has closed. The
  // button is the shape tool's button, so locking has to know what to lock
  // even after the one-shot placement has already disarmed the tool. Defaults
  // to Rectangle (the conventional default shape tool) so double-clicking
  // Shapes locks something even before the dropdown has ever been opened,
  // rather than silently doing nothing on a fresh page.
  const [lastShape, setLastShape] = useState<ShapeTool>('rectangle');

  const shapesCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openShapes = () => {
    clearTimeout(shapesCloseTimer.current);
    setShowShapesDropdown(true);
  };
  const scheduleCloseShapes = () => {
    clearTimeout(shapesCloseTimer.current);
    shapesCloseTimer.current = setTimeout(() => setShowShapesDropdown(false), 180);
  };

  const sigCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

  const handleSelectSavedSignature = (sig: SavedSignature) => {
    setActiveSignature(sig);
    dispatch({ type: 'SET_TOOL', payload: 'signature' });
    setShowSigDropdown(false);
    setAnnouncement(formatMessage(t.signToolActive, { action: TOOL_COPY.signature.action }));
    noteArmed('signature');
  };

  const setSelectedTool = (tool: SignToolType | null) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
  };

  // Absent when no tool is armed, which is also what a tool missing from
  // TOOL_COPY looks like: the status line falls back to the idle tip rather
  // than rendering a half-built sentence or throwing.
  const activeToolCopy = selectedTool ? TOOL_COPY[selectedTool] : null;
  // How to re-edit a text box is only worth saying once one exists. Before that
  // the idle tip has one job, which is to get you to pick a tool.
  const hasTextElement = state.elements.some((el) => el.type === 'text');

  // One-shot arming, double-click to lock. The gesture itself lives in
  // editor-ui/hooks/toolArming.js so this toolbar and Redact's cannot drift on it.
  const { autoShowTool, noteArmed } = useAutoArmHint();
  const armTool = makeArmTool({
    selectedTool,
    arm: (next: string | null) => {
      if (next !== null && !isSignToolType(next)) return;
      setSelectedTool(next);
      if (next) {
        setAnnouncement(formatMessage(t.toolActive, { button: TOOL_COPY[next].button, action: TOOL_COPY[next].action }));
        noteArmed(next);
      }
    },
    lock: (tool: string) => {
      if (isSignToolType(tool)) lockTool(tool);
    },
  });

  const lockTool = (tool: SignToolType) => {
    dispatch({ type: 'SET_TOOL', payload: { tool, locked: true } });
    setAnnouncement(formatMessage(t.toolLocked, { button: TOOL_COPY[tool].button }));
  };

  // The switch's other half, and deliberately not "disarm": a bare SET_TOOL
  // payload arms without locking, so switching off lands back in exactly the
  // state switching on was entered from. Dropping the tool here instead is what
  // made the old chip a one-way door - see EditorToolStatus.tsx.
  const unlockTool = (tool: SignToolType) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
    setAnnouncement(formatMessage(t.toolUnlocked, { button: TOOL_COPY[tool].button }));
  };

  const chooseShape = (tool: ShapeTool) => {
    setSelectedTool(tool);
    setLastShape(tool);
    setShowShapesDropdown(false);
    setAnnouncement(formatMessage(t.toolActive, { button: TOOL_COPY[tool].button, action: TOOL_COPY[tool].action }));
    // Shapes is one button standing for three tools, so the hint that follows
    // has to key off the button ("shapes"), not whichever shape happens to be
    // chosen - see the Shapes button's ArmHint below.
    noteArmed('shapes');
  };

  // Shapes locks from its own button rather than from a menu item, because a
  // menu item cannot be double-clicked: the first click closes the popover and
  // unmounts it, so the second click would land on whatever is underneath -
  // possibly the page, placing an element nobody asked for. The button is the
  // shape tool's button, so double-clicking it is the same gesture as on Text.
  // A real dblclick handler is safe here (unlike the toggle buttons, where the
  // second click would disarm before the lock landed): the two clicks only
  // toggle the popover, never the tool. `lastShape` always has a value (it
  // defaults to Rectangle), so this locks something even on a fresh page
  // where no shape has been chosen yet.
  const lockShape = () => {
    const shape = isShapeTool(selectedTool) ? selectedTool : lastShape;
    lockTool(shape);
    setShowShapesDropdown(false);
  };

  // Same reasoning as lockShape: Sign is also a dropdown-trigger button, so a
  // real dblclick handler on the wrapping div is what has to lock it - counting
  // e.detail on the button itself would be fighting floating-ui's own click
  // handler, which toggles the popover on every click including both of a
  // double-click. Locking only makes sense once a signature exists to place;
  // activeSignature outlives a one-shot placement's disarm, so double-clicking
  // right after placing one still re-arms and locks it, same as lastShape does
  // for shapes.
  const lockSignature = () => {
    if (!activeSignature) return;
    lockTool('signature');
    setShowSigDropdown(false);
  };

  // The chevrons keep typing's company: they exist to move between fields you
  // are filling, so standing over an idle document they were two controls for
  // a job nobody had started (Shlomi, 2026-09-20, on the live /sign/ - the
  // first iPhone where detection worked at all, so the first time anyone saw
  // them at rest). They arrive with Text or Date and leave with them.
  //
  // `selectedTool` alone will not do. A tool is one-shot and disarms on the
  // placement that opens the very first field (useWorkspaceGestures.ts's four
  // DISARM_TOOL sites), so gating on it alone would take the control away at
  // exactly the moment "tap a field, type, Next, type" begins. A selected text
  // box is the same context under another name, and it is what the person is
  // holding for the whole of that loop.
  //
  // Within that context the control still never blinks: `hasFields` and this
  // gate both hold steady across a move, and only `disabled` changes as either
  // end of the order is reached (FieldNavigation.hasFields, and the `fieldNav`
  // prop doc in EditorToolStatus.tsx).
  const activeElement = state.activeElementId
    ? state.elements.find((element) => element.id === state.activeElementId) ?? null
    : null;
  const fillingFields = selectedTool === 'text' || selectedTool === 'date' || activeElement?.type === 'text';

  const fieldNav = fieldNavigation.hasFields && fillingFields ? {
    hasNext: fieldNavigation.hasNext,
    hasPrevious: fieldNavigation.hasPrevious,
    onNext: fieldNavigation.goToNext,
    onPrevious: fieldNavigation.goToPrevious,
    direction: fieldNavigation.direction,
    nextLabel: t.nextFieldLabel,
    previousLabel: t.previousFieldLabel,
  } : null;

  // FORM-11: the detector's report, worded here because TOOL_COPY owns every
  // tool-facing string (CLAUDE.md's editor rule) and `t` is where a locale's
  // edition of it arrives. Four states, three of them things worth saying:
  //   - pending: null, so the line stays empty rather than flashing a count
  //     that is about to change, or claiming "none" before anyone has looked.
  //   - done with a count: what was found, without claiming it is everything
  //     (the detector runs at roughly 85% recall on a real form).
  //   - done with nothing: an answer about the document.
  //   - failed: an answer about us - the detector ran on this file and threw.
  //   - unavailable: the detector never loaded, which a shell cached before a
  //     deploy causes and reopening the page usually clears. It is the one a
  //     person can do something about, so it is the only one whose second
  //     sentence is an instruction rather than a pointer.
  //   - not-started: its inputs were not all there and it never ran. Nothing
  //     is thrown on that path, so this line is the only evidence that
  //     exists, which is why it says so rather than staying quiet.
  // Keeping all five apart is the point: before FORM-11 they were one
  // silence. See useFormFieldRegions.ts's `detection`.
  const fieldSummary = {
    problem: formDetection.state === 'failed'
      || formDetection.state === 'unavailable'
      || formDetection.state === 'not-started',
    text: (() => {
      if (formDetection.state === 'pending') return null;
      if (formDetection.state === 'not-started') return t.fieldsCheckNotStarted;
      if (formDetection.state === 'unavailable') return t.fieldsCheckUnavailable;
      if (formDetection.state === 'failed') return t.fieldsCheckFailed;
      if (formDetection.count === 0) return t.fieldsFoundNone;
      return formatMessage(
        formDetection.count === 1 ? t.fieldsFoundOne : t.fieldsFoundOther,
        { count: formDetection.count },
      );
    })(),
  };

  // The hint line, handed to the shell so it rides in the file row instead of
  // taking a line of its own directly above the document. EditorToolStatus owns
  // the shape of it, and the Keep adding / Stop chip that is the only exit from
  // a locked tool a phone actually has.
  const statusLine = (
    <EditorToolStatus
      copy={activeToolCopy}
      locked={toolLocked}
      onToggleKeepOn={() => selectedTool && (toolLocked ? unlockTool(selectedTool) : lockTool(selectedTool))}
      idle={`${t.tipIdle}${hasTextElement ? ` ${t.tipEditText}` : ''}`}
      reserveCopies={Object.values(TOOL_COPY)}
      fieldSummary={fieldSummary}
      fieldNav={fieldNav}
      keepOnLabel={t.keepOn}
      keepOnShort={t.keepOnShort}
      keepOnTitleOn={t.keepOnTitleOn}
      keepOnTitleOff={t.keepOnTitleOff}
      hintEsc={t.hintEsc}
      hintDoubleClick={t.hintDoubleClick}
      lang={t.lang}
      dir={t.dir}
    />
  );

  return (
    <>
      <ToolShell editor status={statusLine}>
        <div className={styles.toolbar} role="toolbar" aria-label={t.toolbarLabel} dir={t.dir} lang={t.lang}>
          {/* Order (2026-09-18, revised the same day as SIGN-29): the row
              reads in the order a form gets done. Text, Date, Symbols, Shapes
              and Whiteout come first - you fill the fields, tick the boxes,
              cover what is wrong - and Sign comes after them, the last thing
              you do to a filled form, even though it is the tool the page is
              named for (Redact's own order still leads with Blur, its named
              tool, since f48fcbd8). Undo and Redo sit beside the work they
              act on; the
              chrome - view density, full screen, Feedback - groups together
              next; Replace sits with the other finishing action; export
              (Share/Download) stays at the far edge. One kind of thing per
              group; the two-anchor comment at the end of
              SignToolbar.module.css says where labels show. */}
          <ArmHint tool="text" label={t.textButton} action={TOOL_COPY.text.action} locked={selectedTool === 'text' && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint}>
            <button
              type="button"
              className={`${styles.button}${selectedTool === 'text' ? ` ${styles.active}` : ''}${selectedTool === 'text' && toolLocked ? ` ${styles.locked}` : ''}`}
              onClick={armTool('text')}
              aria-pressed={selectedTool === 'text'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
              <span className={styles.label}>{t.textButton}</span>
            </button>
          </ArmHint>

          <ArmHint tool="date" label={t.dateButton} action={TOOL_COPY.date.action} locked={selectedTool === 'date' && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint}>
            <button
              type="button"
              className={`${styles.button}${selectedTool === 'date' ? ` ${styles.active}` : ''}${selectedTool === 'date' && toolLocked ? ` ${styles.locked}` : ''}`}
              onClick={armTool('date')}
              aria-pressed={selectedTool === 'date'}
              // Labelled again, and present at every width. Date gave its
              // label up purely to pay for a third history control (the
              // removed change-history dialog's button): the labelled desktop
              // row had no room for three of them, and a calendar is as plain
              // a convention as an undo arrow, so the 43.9px this label costs
              // bought the row instead. With History gone the budget is back
              // and the label with it - nothing else in the row ever depended
              // on Date being icon-only.
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className={styles.label}>{t.dateButton}</span>
            </button>
          </ArmHint>

          <ArmHint tool="symbol" label={t.symbolsButton} action={TOOL_COPY.symbol.action} locked={selectedTool === 'symbol' && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint}>
            <button
              type="button"
              className={`${styles.button}${selectedTool === 'symbol' ? ` ${styles.active}` : ''}${selectedTool === 'symbol' && toolLocked ? ` ${styles.locked}` : ''}`}
              onClick={armTool('symbol')}
              aria-pressed={selectedTool === 'symbol'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className={styles.label}>{t.symbolsButton}</span>
            </button>
          </ArmHint>

          {/* placement="bottom-start". A dropdown drops down - and it is the
              only surface here that does, which is what lets it coexist with
              ArmHint's tooltip rather than take turns with it: the tooltip
              opens upward, this opens downward, so both can be on screen at
              once and neither has to be suppressed. (Suppressing was tried,
              and it silently cost these two buttons their tooltip altogether,
              because the menu opens on the very hover the tooltip waits on.)

              Start-aligned, not centered. Centering was the old behaviour, on
              the argument that these buttons stretch to fill the row (`.toolbar
              > * { flex: 1 1 auto }`) while their icon and label stay centered
              inside, so start-aligning anchored the menu to an empty left edge
              rather than to visible content. That held while the menu was the
              narrower of the two, and stopped holding once the menu grew wider
              than the button: centering a wider box on a narrower one makes it
              overhang on both sides and line up with nothing. A shared edge is
              legible at any relative width; a shared centre is not. */}
          {/* ArmHint wraps this outer div, not the button Popover clones below:
              Popover already clones that button to attach its own Floating UI
              reference (for the Shapes menu itself), and a second, independent
              clone-and-ref from ArmHint needs a DOM node of its own to attach
              to - the div is already position:relative and already sized to
              match the button exactly (`.toolbar .dropdown > .button { width:
              100% }`), so anchoring here costs nothing visually. */}
          <ArmHint tool="shapes" label={t.shapesButton} action={t.shapesHintAction} locked={isShapeTool(selectedTool) && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint}>
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
                    className={`${styles.button}${isShapeTool(selectedTool) ? ` ${styles.active}` : ''}${isShapeTool(selectedTool) && toolLocked ? ` ${styles.locked}` : ''}`}
                    aria-pressed={isShapeTool(selectedTool)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 3l4 7H8z" />
                      <circle cx="7" cy="17" r="4" />
                      <rect x="13" y="13" width="8" height="8" rx="1" />
                    </svg>
                    <span className={styles.label}>{t.shapesButton}</span>
                    {/* The chevron sits outside the label so it survives the
                        icon-only band (SignToolbar.module.css's 1279px block
                        hides every .label): a menu still has to look like one. */}
                    <svg className={styles.chevron} width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                }
                content={
                <div 
                  className={`${controlStyles.popover} ${controlStyles['shapes-menu']}`}
                  role="menu"
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
                      {t.ellipseLabel}
                    </button>
                    <button
                      type="button"
                      className={controlStyles['menu-item']}
                      onClick={() => chooseShape('rectangle')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="6" width="18" height="12" rx="2" />
                      </svg>
                      {t.rectangleLabel}
                    </button>
                    <button
                      type="button"
                      className={controlStyles['menu-item']}
                      onClick={() => chooseShape('line')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <line x1="4" y1="20" x2="20" y2="4" />
                      </svg>
                      {t.lineLabel}
                    </button>
                  </div>
                </div>
              }
            />
            </div>
          </ArmHint>

          <ArmHint tool="whiteout" label={t.whiteoutButton} action={TOOL_COPY.whiteout.action} locked={selectedTool === 'whiteout' && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint}>
            <button
              type="button"
              className={`${styles.button}${selectedTool === 'whiteout' ? ` ${styles.active}` : ''}${selectedTool === 'whiteout' && toolLocked ? ` ${styles.locked}` : ''}`}
              onClick={armTool('whiteout')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                <path d="M22 21H7" />
                <path d="m13.3 4 5.3 5.3" />
              </svg>
              <span className={styles.label}>{t.whiteoutButton}</span>
            </button>
          </ArmHint>

          {/* Same wrapping reasoning as the Shapes button above: ArmHint anchors to
              the dropdown div, not the button Popover clones. `locked` doubles
              as "nothing to teach yet" here - before a signature exists, this
              button's click opens the create dialog rather than arming
              anything, and ArmHint's own `locked` branch already means "render
              the trigger plain, no hover wiring" for exactly that case, so
              there is no need for a second conditional path. */}
          <ArmHint
            tool="signature"
            label={t.signButton}
            action={TOOL_COPY.signature.action}
            locked={!activeSignature || (selectedTool === 'signature' && toolLocked)}
            autoShowTool={autoShowTool}
            hintTemplate={t.armHint}
          >
            <div
              className={styles.dropdown}
              onMouseEnter={openSig}
              onMouseLeave={scheduleCloseSig}
              onDblClick={lockSignature}
            >
              <Popover
                open={showSigDropdown}
                onOpenChange={setShowSigDropdown}
                placement="bottom-start"
                trigger={
                  <button
                    type="button"
                    className={`${styles.button}${selectedTool === 'signature' ? ` ${styles.active}` : ''}${selectedTool === 'signature' && toolLocked ? ` ${styles.locked}` : ''}`}
                    onClick={handleSignatureBtnClick}
                    // Only said here when there is nothing yet for ArmHint to
                    // teach: once a signature exists, ArmHint's own bubble
                    // (wrapping the div above) covers this button instead, and
                    // showing both would duplicate the description.
                    title={activeSignature ? undefined : t.selectSignatureTitle}
                    aria-pressed={selectedTool === 'signature'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 15c2 0 2.5-9 4.5-9s1 11 3 11 2.5-9 4.5-9 1.5 7 3 7c1 0 1.7-1 2.5-2" />
                      <path d="M3 21h18" />
                    </svg>
                    <span className={styles.label}>{t.signButton}</span>
                  </button>
                }
                content={
                <div
                  className={`${controlStyles.popover} ${controlStyles['signature-menu']}`}
                  data-editor-signature-popover
                  role="menu"
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
                        <img src={sig.dataUrl} alt={t.savedSignatureAlt} />
                        <button
                          type="button"
                          className={controlStyles['dropdown-item-delete']}
                          data-editor-signature-delete
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSavedSignature(sig.id, e);
                          }}
                          title={t.deleteSignatureLabel}
                          aria-label={t.deleteSignatureLabel}
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
                    <span className={styles.label}>{t.newSignatureButton}</span>
                  </button>
                </div>
              }
            />
            </div>
          </ArmHint>

          {/* Undo and Redo are the whole history model, the same pair
              RedactToolbar.tsx carries and in the same order: one tap each,
              and the keyboard shortcuts beside them
              (src/lib/history/useHistoryShortcuts.js). A third "History"
              control used to sit here and open a change-history dialog whose
              checklist could revert an arbitrary set; it was removed because
              a real Undo/Redo pair makes the timeline redundant and its
              selective revert fought linear redo. Do not bring it back. Both
              are `data-icon-only`: an arrow is a convention, neither is a
              tool, and the labelled desktop row has no width to spare (see the
              1300px block in SignToolbar.module.css). */}
          <button
            type="button"
            className={styles.button}
            onClick={onUndo}
            title={t.undoTitle}
            disabled={actionHistory.length === 0}
            data-icon-only
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
            <span className={styles.label}>{t.undoButton}</span>
          </button>

          <button
            type="button"
            className={styles.button}
            onClick={onRedo}
            title={t.redoTitle}
            disabled={!canRedo}
            data-icon-only
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
            <span className={styles.label}>{t.redoButton}</span>
          </button>

          <ViewControl
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
            labels={{
              relaxed: t.viewRelaxed,
              condensed: t.viewCondensed,
              fullscreen: t.viewFullscreen,
              exitFullscreen: t.viewExitFullscreen,
              densityLabel: t.viewDensityLabel,
            }}
          />

          {/* View density/full screen and Feedback are the chrome group, one
              kind of thing (about the workspace, not the document) beside each
              other. */}
          <SignFeedbackButton
            className={styles.button}
            labelClassName={styles.label}
            label={t.feedbackButton}
            title={t.feedbackTitle}
            lang={t.lang}
            dir={t.dir}
            /* FORM-11: the one thing this report ever fills in by itself, and
               only when the field walk threw. A failure a person cannot
               describe is a failure nobody can fix - an iPhone seeing no
               outlines and no snapping, on a document that works everywhere we
               can test, is a report we have had and could do nothing with. */
            detectionFailure={formDetection.detail ?? null}
          />

          {/* The united file action, in the exact slot Start over used to hold.
              Both meant "I want a different file"; this one says it once and
              actually gets you there. BasePdfTool decides whether swapping the
              file needs confirming - see requestReplace. The label/title text
              reads from the shell's own catalogue (fix from LOC-09 stage 1's
              inventory), the same way ToolShell.tsx's own FileActions() does -
              only the icon stays FILE_ACTIONS.replace's, since that is not text.
              Sits with export as the other finishing action, one step before
              Share/Download at the far edge. */}
          <button
            type="button"
            className={`${styles.button} ${styles.highlight}`}
            onClick={requestReplace}
            title={shellMessages.replaceTitle}
            aria-label={shellMessages.replaceLabel}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d={FILE_ACTIONS.replace.icon} />
            </svg>
            <span className={styles.label}>{shellMessages.replaceShort}</span>
          </button>

          <EditorExportActions
            variant="toolbar"
            canShare={canSharePdf}
            shareReady={shareReady}
            disabled={exportDisabled}
            onDownload={onDownloadPdf}
            onPrepareShare={onSavePdf}
            onShare={onSharePdf}
            shareLabel={t.shareButton}
            downloadLabel={t.downloadButton}
            dir={t.dir}
            lang={t.lang}
            downloadTitle={exportBlocked ? blockedExportTitle : t.downloadTitle}
            shareTitle={exportBlocked ? blockedExportTitle : (shareReady ? t.shareTitleReady : t.shareTitleUnsaved)}
            describedBy={exportBlocked ? 'sign-export-readiness' : undefined}
          />
        </div>
        {exportBlocked && <ExportReadinessNotice fieldCount={exportIssueCount} onReview={onReviewExportIssues} messages={messages} />}
      </ToolShell>
    </>
  );
}
