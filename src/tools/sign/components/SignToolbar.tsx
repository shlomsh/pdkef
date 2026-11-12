import { useState, useEffect, useRef } from 'preact/hooks';
import { documentStyleOf, useSignTool } from './SignToolContext.tsx';
import { useSavedSignatures } from './SavedSignaturesContext.tsx';
import { signFeedbackUrl } from './SignFeedbackButton.tsx';
import MoreToolsMenu, { isMoreTool, moreLabelFor } from './MoreToolsMenu.tsx';
import FullscreenButton from '#editor-ui/FullscreenButton.tsx';
import Popover from '#shell/Popover.tsx';
import { buildToolCopy } from './toolCopy.ts';
import EditorToolStatus from '#editor-ui/EditorToolStatus.tsx';
import ArmHint from '#editor-ui/ArmHint.tsx';
import ExportReadinessNotice from './ExportReadinessNotice.tsx';
import EditorExportActions from '#editor-ui/EditorExportActions.tsx';
import ToolShell, { FILE_ACTIONS, useToolShell } from '#shell/ToolShell.tsx';
import { useArmTool, useAutoArmHint, useDoubleTap } from '#editor-ui/hooks/toolArming.js';
import IconToolButton from './IconToolButton.tsx';
import MarkIcon from './MarkIcon.tsx';
import { WhiteoutIcon } from '#editor-ui/toolIcons.tsx';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import { useFill } from './fill/FillContext.tsx';
import { englishSignMessages } from '../messages';
import type { SignMessages } from '#editor/registry/messages.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { ActionHistoryEntry } from '#editor/model/actionHistory.ts';
import type { SavedSignature } from '#editor/model/savedSignature.ts';
import type { SignToolType } from '#editor/model/editorModel.ts';
import type { FieldNavigation } from '../hooks/useFieldNavigation.ts';
import type { FormDetectionState } from '../hooks/useFormFieldRegions.ts';
import styles from '#editor-ui/SignToolbar.module.css';
import { isShapeTool, toolButtonProps, type ShapeTool } from './toolButtonProps.ts';
import UndoRedoButtons from '#editor-ui/UndoRedoButtons.tsx';
import controlStyles from '#editor-ui/EditorControls.module.css';
import { recordAction } from '#lib/telemetry/actionTrail.ts';

// Every SignToolType TOOL_COPY (below) has an entry for - a static list rather
// than deriving it from TOOL_COPY's own keys, since TOOL_COPY is now built
// per-render from the message catalogue (LOC-09 stage 1) and this guard has to
// exist before that render happens.
const SIGN_TOOL_TYPES: readonly SignToolType[] = ['text', 'date', 'symbol', 'signature', 'whiteout', 'ellipse', 'rectangle', 'line', 'highlight', 'comment'];
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
   * SignMessages. Optional and English-default so
   * every existing caller (this file's own tests included) is unaffected;
   * PdfSignTool.tsx is the only caller passing a Hebrew edition. */
  messages?: Partial<SignMessages>;
}) {
  const { state, dispatch } = useSignTool();
  const nextMark = documentStyleOf(state).symbolMark ?? 'check'; // what the next placement draws
  const selectedTool = state.selectedTool;
  const toolLocked = state.toolLocked;
  const { requestReplace, messages: shellMessages = englishShellMessages } = useToolShell();
  const { savedSignatures, activeSignature, setActiveSignature, onDeleteSavedSignature } = useSavedSignatures();
  const exportDisabled = exporting || exportBlocked;

  const t: SignMessages = { ...englishSignMessages, ...messages };

  // TOOL_COPY owns every tool-facing string (see toolCopy.ts).
  const TOOL_COPY = buildToolCopy(t);

  const blockedExportTitle = formatMessage(exportIssueCount === 1 ? t.exportBlockedTitleOne : t.exportBlockedTitleOther, { count: exportIssueCount });

  // MOBI-16 follow-up: while a text box is actually in an edit session on a
  // touch device, `DraggableWrapper.tsx` grows its own Previous/Next beside
  // the element - this status-line pair would then be a second, redundant
  // copy sitting over the identity row for no reason (Shlomi, on the shipped
  // MOBI-16: "those buttons and the real estate they consume should have
  // been gone"). The pointer question is asked in one place for both this and
  // DraggableWrapper's side of the same hand-off - see editor-ui/hooks/useCoarsePointer.ts.
  const isCoarsePointer = useCoarsePointer();
  // Fill mode (SNG-15), off (FILL_OFF) unless PdfSignTool.tsx provided a real
  // value - see docs/sign-fill-mode.md, "The toolbar".
  const { enabled } = useFill();
  // Text reads as chosen only when it is armed (SIGN-45): with nothing armed
  // a click on the page makes no text, and a second press disarms it through
  // the usual arming toggle.
  const textChosen = selectedTool === 'text';
  const [showSigDropdown, setShowSigDropdown] = useState(false);
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
      clearTimeout(sigCloseTimer.current);
    };
  }, []);

  const handleSignatureBtnClick = (e: MouseEvent) => {
    if (savedSignatures.length === 0) {
      setDialogOpen(true);
      return;
    }
    if (isDoubleTap('signature', e, showSigDropdown)) lockSignature();
  };

  const handleSelectSavedSignature = (sig: SavedSignature) => {
    setActiveSignature(sig);
    // Preserve the lock only if Sign itself was already the locked tool: this
    // re-arms `signature` from a menu rather than switching tools, so a
    // locked Sign that was double-clicked before picking a different saved
    // signature must stay locked. But if some OTHER tool was locked (Text,
    // say) when this menu happened to be opened, `toolLocked` describes THAT
    // tool, not this one - carrying it over would lock Sign nobody asked to
    // lock. A bare SET_TOOL always clears `toolLocked` (SignToolContext.tsx),
    // which is right for switching tools but wrong for a same-family re-arm -
    // see SIGN-30.
    dispatch({ type: 'SET_TOOL', payload: { tool: 'signature', locked: toolLocked && selectedTool === 'signature' } });
    setShowSigDropdown(false);
    setAnnouncement(formatMessage(t.signToolActive, { action: TOOL_COPY.signature.action }));
    noteArmed('signature');
    recordAction('arm_tool');
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
  const armTool = useArmTool({
    selectedTool,
    arm: (next: string | null) => {
      if (next !== null && !isSignToolType(next)) return;
      setSelectedTool(next);
      if (next) {
        setAnnouncement(formatMessage(t.toolActive, { button: TOOL_COPY[next].button, action: TOOL_COPY[next].action }));
        // One hint for the More button, whichever of its tools was armed.
        noteArmed(isMoreTool(next) ? 'more' : next);
        recordAction('arm_tool');
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
    // The lock carries only across shapes: picking another shape re-arms the
    // same family, but another tool's lock (Text, say) must not leak onto the
    // shape picked - SIGN-30. A bare SET_TOOL always clears `toolLocked`.
    dispatch({ type: 'SET_TOOL', payload: { tool, locked: toolLocked && isShapeTool(selectedTool) } });
    setAnnouncement(formatMessage(t.toolActive, { button: TOOL_COPY[tool].button, action: TOOL_COPY[tool].action }));
    noteArmed('more');
    recordAction('arm_tool');
  };

  // Sign is a dropdown-trigger button, so a
  // real dblclick handler on the wrapping div is what has to lock it - counting
  // e.detail on the button itself would be fighting floating-ui's own click
  // handler, which toggles the popover on every click including both of a
  // double-click. Locking only makes sense once a signature exists to place;
  // activeSignature outlives a one-shot placement's disarm, so double-clicking
  // right after placing one still re-arms and locks it, same as More's last pick
  // does.
  const lockSignature = () => {
    if (!activeSignature) return;
    lockTool('signature');
    setShowSigDropdown(false);
  };

  // A phone sends no dependable dblclick, so on touch Sign locks on two quick taps instead (SIGN-31, toolArming.js's useDoubleTap),
  // and only while the menu the first tap opened is still open: a pick from
  // the menu closes it, so "tap, pick, tap to reopen" can never lock.
  // Sign's menu opens by tap alone there: the hover opener below would fire on
  // the same tap as the click that toggles the menu, opening and shutting it
  // at once, so the first tap looked like it did nothing.
  const isDoubleTap = useDoubleTap();
  const hoverMenu = <T,>(handler: T) => (isCoarsePointer ? undefined : handler);

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
  // Within that context the control still never blinks on desktop: `hasFields`
  // and this gate both hold steady across a move, and only `disabled` changes
  // as either end of the order is reached (FieldNavigation.hasFields, and the
  // `fieldNav` prop doc in EditorToolStatus.tsx). On a touch device it blinks
  // exactly once more, deliberately: it steps aside the moment an edit session
  // opens (`state.editingElementId`), because that is the moment
  // `DraggableWrapper.tsx`'s own Previous/Next, anchored to the element, takes
  // over the job - see the `isCoarsePointer` comment above. Selecting a box
  // without opening it (a tap that only activates, not edits) still shows this
  // one, same as always.
  const activeElement = state.activeElementId
    ? state.elements.find((element) => element.id === state.activeElementId) ?? null
    : null;
  const fillingFields = selectedTool === 'text' || selectedTool === 'date' || activeElement?.type === 'text';
  const elementNavTakesOver = isCoarsePointer && state.editingElementId !== null;

  // Off in fill mode (docs/sign-fill-mode.md): the platform's own next/
  // previous (iOS's keyboard arrows, Tab) does the hopping there instead.
  const fieldNav = !enabled && fieldNavigation.hasFields && fillingFields && !elementNavTakesOver ? {
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
  //   - pending and done: null. No count, no "none found": the detector
  //     drives fill mode and says nothing about the document.
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
    // A failed or unstarted check ends in a link to the prefilled report.
    action: formDetection.state === 'failed' || formDetection.state === 'not-started'
      ? { label: t.fieldsCheckDetailsLink, href: signFeedbackUrl(formDetection.detail ?? null) }
      : undefined,
    text: (() => {
      if (formDetection.state === 'pending') return null;
      if (formDetection.state === 'not-started') return t.fieldsCheckNotStarted;
      if (formDetection.state === 'unavailable') return t.fieldsCheckUnavailable;
      if (formDetection.state === 'failed') return t.fieldsCheckFailed;
      // A clean run is silent: Sign never claims what a form has or needs.
      return null;
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
      reserveFieldNav={fieldNavigation.hasFields}
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
        <div
          className={styles.toolbar}
          role="toolbar"
          aria-label={t.toolbarLabel}
          dir={t.dir}
          lang={t.lang}
          // ToolHero.astro folds the hero on desktop while this exists.
          data-editor-toolbar
        >
          {/* Order (2026-09-18, revised the same day as SIGN-29): the row
              reads in the order a form gets done. Text, Date, Mark
              and Whiteout come first - you fill the fields, tick the boxes,
              cover what is wrong - and Sign comes after them, the last thing
              you do to a filled form, even though it is the tool the page is
              named for (Redact's own order still leads with Blur, its named
              tool, since f48fcbd8). Undo and Redo sit beside the work they
              act on; the
              chrome - More, full screen - groups together
              next; Replace sits with the other finishing action; export
              (Share/Download) stays at the far edge. One kind of thing per
              group; the two-anchor comment at the end of
              SignToolbar.module.css says where labels show. */}
          <ArmHint tool="text" label={t.textButton} action={TOOL_COPY.text.action} locked={selectedTool === 'text' && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint} touchHintTemplate={t.armHintTouch}>
            <button
              type="button"
              {...toolButtonProps(textChosen, selectedTool === 'text' && toolLocked)}
              onClick={armTool('text')}
              aria-pressed={textChosen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
              <span className={styles.label}>{t.textButton}</span>
            </button>
          </ArmHint>

          <ArmHint tool="date" label={t.dateButton} action={TOOL_COPY.date.action} locked={selectedTool === 'date' && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint} touchHintTemplate={t.armHintTouch}>
            <button
              type="button"
              {...toolButtonProps(selectedTool === 'date', toolLocked)}
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

          <ArmHint tool="symbol" label={t.markButton} action={TOOL_COPY.symbol.action} locked={selectedTool === 'symbol' && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint} touchHintTemplate={t.armHintTouch}>
            <button
              type="button"
              {...toolButtonProps(selectedTool === 'symbol', toolLocked)}
              onClick={armTool('symbol')}
              aria-pressed={selectedTool === 'symbol'}
            >
              <MarkIcon mark={nextMark} size={18} strokeWidth={2.5} />
              <span className={styles.label}>{t.markButton}</span>
            </button>
          </ArmHint>

          <IconToolButton tool="whiteout" label={t.whiteoutButton} action={TOOL_COPY.whiteout.action} selectedTool={selectedTool} toolLocked={toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint} touchHintTemplate={t.armHintTouch} onArm={armTool('whiteout')}>
            <WhiteoutIcon strokeWidth={2.5} />
          </IconToolButton>

          {/* ArmHint anchors to
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
            hintTemplate={t.armHint} touchHintTemplate={t.armHintTouch}
          >
            <div
              className={styles.dropdown}
              onMouseEnter={hoverMenu(openSig)}
              onMouseLeave={hoverMenu(scheduleCloseSig)}
              onDblClick={lockSignature}
            >
              <Popover
                open={showSigDropdown}
                onOpenChange={setShowSigDropdown}
                placement="bottom-start"
                trigger={
                  <button
                    type="button"
                    {...toolButtonProps(selectedTool === 'signature', toolLocked)}
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

          {/* More holds what is used less often: Highlight, Comment, the shapes
              and Feedback (SIGN-49). ArmHint wraps the dropdown div, as with
              Sign above, so its tooltip and the menu open opposite ways. */}
          <ArmHint tool="more" label={moreLabelFor(isMoreTool(selectedTool) ? selectedTool : null, t)} action={isMoreTool(selectedTool) ? TOOL_COPY[selectedTool].action : t.moreTitle} locked={isMoreTool(selectedTool) && toolLocked} autoShowTool={autoShowTool} hintTemplate={t.armHint} touchHintTemplate={t.armHintTouch}>
            <MoreToolsMenu
              t={t}
              selectedTool={selectedTool}
              toolLocked={toolLocked}
              onPick={(tool, event) => (isShapeTool(tool) ? chooseShape(tool) : armTool(tool)(event))}
              onLock={lockTool}
              feedbackHref={signFeedbackUrl(formDetection.detail ?? null)}
            />
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
          <UndoRedoButtons
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={actionHistory.length > 0}
            canRedo={canRedo}
            iconOnly
            labels={{ undoTitle: t.undoTitle, undoButton: t.undoButton, redoTitle: t.redoTitle, redoButton: t.redoButton }}
          />

          <FullscreenButton isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} label={t.viewFullscreen} exitLabel={t.viewExitFullscreen} />

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
            className={styles.button}
            onClick={requestReplace}
            title={shellMessages.replaceTitle}
            aria-label={shellMessages.replaceLabel} data-icon-only
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
            keepDownloadOnPhone
          />
        </div>
        {exportBlocked && <ExportReadinessNotice fieldCount={exportIssueCount} onReview={onReviewExportIssues} messages={messages} />}
      </ToolShell>
    </>
  );
}
