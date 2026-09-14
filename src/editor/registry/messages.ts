/**
 * DEBT-04: the message shape the editor's registry (`NodeRenderContext.messages`
 * in `./types.ts`) and the Sign/Redact chrome (`editor-ui/FontPickerMenu.tsx`,
 * Sign's own toolbar and dialogs) render from. `src/i18n/toolMessages.ts`
 * supplies the actual English/Hebrew values and re-exports this type, so the
 * editor core itself never imports from `src/i18n/`.
 */

/**
 * LOC-09 stage 1: the Sign editor's always-visible toolbar row and its status
 * line only (docs/sign-tool-product-decisions.md's LOC-02 pilot decision kept
 * the editor English; this is the first crack in that, scoped deliberately
 * narrow). Popovers, dialogs, element controls and screen-reader announcements
 * are NOT covered by this catalogue yet and stay English - `toolActive`,
 * `signToolActive`, `toolLocked` and `toolUnlocked` are defined here so a
 * later stage has them ready, but SignToolbar.tsx's `setAnnouncement()` calls
 * do not read them yet.
 *
 * `lang`/`dir` let the toolbar's own bidi-isolation wrapper (added in
 * 5a1af03 as a hardcoded `dir="ltr" lang="en"`, back when the whole editor
 * was English) follow the catalogue instead: 'ltr'/'en' here, 'rtl'/'he' in
 * the Hebrew edition, since a Hebrew toolbar should not force its own English
 * bidi isolation on itself.
 */
export interface SignMessages {
  toolbarLabel: string;
  textButton: string;
  symbolsButton: string;
  shapesButton: string;
  whiteoutButton: string;
  signButton: string;
  newSignatureButton: string;
  undoButton: string;
  undoTitle: string;
  feedbackButton: string;
  feedbackTitle: string;
  shareButton: string;
  downloadButton: string;
  textAction: string;
  symbolAction: string;
  signatureAction: string;
  whiteoutAction: string;
  ellipseAction: string;
  rectangleAction: string;
  lineAction: string;
  shapesHintAction: string;
  tipIdle: string;
  /** No leading space - EditorToolStatus's idle tip composes `${tipIdle} ${tipEditText}` itself. */
  tipEditText: string;
  keepOn: string;
  keepOnTitleOn: string;
  keepOnTitleOff: string;
  hintEsc: string;
  hintDoubleClick: string;
  armHint: string;
  /** Not yet wired into SignToolbar.tsx's setAnnouncement() calls - see this
   * catalogue's header comment. */
  toolActive: string;
  signToolActive: string;
  toolLocked: string;
  toolUnlocked: string;
  selectSignatureTitle: string;
  downloadTitle: string;
  shareTitleReady: string;
  shareTitleUnsaved: string;
  exportBlockedTitleOne: string;
  exportBlockedTitleOther: string;
  viewRelaxed: string;
  viewCondensed: string;
  viewFullscreen: string;
  viewExitFullscreen: string;
  viewDensityLabel: string;
  /** LOC-16 stage 2-5: the shapes menu's plain labels (SignToolbar.tsx) - not
   * to be confused with `ellipseAction` etc above, which describe the arm
   * hint ("Click and drag..."). Also reused by ElementToolbar.tsx's shape
   * switcher and by useWorkspaceGestures.ts/PdfWorkspace.tsx/PdfSignTool.tsx
   * wherever a history description or announcement needs a tool/element
   * type's display name (see `signElementTypeLabel` above) instead of its
   * raw id. */
  ellipseLabel: string;
  rectangleLabel: string;
  lineLabel: string;
  /** SignToolbar.tsx's saved-signatures popover. */
  savedSignatureAlt: string;
  deleteSignatureLabel: string;
  /** SignatureDialog.tsx, full string audit (LOC-16). */
  createSignatureTitle: string;
  closeDialogLabel: string;
  tabDraw: string;
  tabType: string;
  tabUpload: string;
  penColorTitle: string;
  thicknessLabel: string;
  clearDrawingLabel: string;
  typedNamePlaceholder: string;
  signaturePreviewPlaceholder: string;
  uploadDropHint: string;
  uploadFormatsHint: string;
  uploadSizeHint: string;
  uploadedPreviewAlt: string;
  processingSignature: string;
  removeWhiteBackgroundLabel: string;
  changeImageLabel: string;
  dialogCancelLabel: string;
  saveSignatureLabel: string;
  /** UndoHistoryModal.tsx. */
  undoHistoryTitle: string;
  revertSelectedLabel: string;
  /** Shared between EditorPageHeader.tsx, UndoHistoryModal.tsx's per-action
   * page line, and PdfWorkspace.tsx's clearPage announcement/title. */
  pageLabel: string;
  clearPageLabel: string;
  clearPageTitle: string;
  /** PdfSignTool.tsx's "Delete signature?" ConfirmDialog. */
  deleteSignatureConfirmTitle: string;
  deleteSignatureConfirmBody: string;
  /** ElementToolbar.tsx, full string audit (LOC-16). */
  decreaseFontSizeTitle: string;
  increaseFontSizeTitle: string;
  boldLabel: string;
  boldUnavailableTemplate: string;
  italicLabel: string;
  italicUnavailableTemplate: string;
  rtlTextTitle: string;
  ltrTextTitle: string;
  directionRtlAria: string;
  directionLtrAria: string;
  oneBoxFewerTitle: string;
  boxesFixedTitle: string;
  boxesFollowingTitle: string;
  oneBoxMoreTitle: string;
  textColorTitle: string;
  checkMarkTitle: string;
  xMarkTitle: string;
  dotMarkTitle: string;
  checkboxColorTitle: string;
  lineThicknessTitle: string;
  shapeColorTitle: string;
  signatureColorTitle: string;
  whiteoutColorTitle: string;
  duplicateElementTitle: string;
  deleteElementTitle: string;
  /** FontPickerMenu.tsx. */
  searchFontsPlaceholder: string;
  fontsListAriaLabel: string;
  noFontsFound: string;
  fontTriggerTitleTemplate: string;
  fallbackFontNoteTemplate: string;
  doesntSupportText: string;
  /** ElementResizers.tsx. */
  dragToResizeTitle: string;
  dragToResizeFontSizeTitle: string;
  dragToSpanBoxesTitle: string;
  /** SignTool/nodes/TextNode.tsx's two placeholders. */
  typeYourTextPlaceholder: string;
  doubleClickToEditPlaceholder: string;
  /** SignTool/ExportReadinessNotice.tsx. */
  exportReadinessBoldOne: string;
  exportReadinessBoldOther: string;
  exportReadinessSuffix: string;
  reviewFieldsLabel: string;
  /** SignTool/FontSupportNotice.tsx. */
  textNeedsAttentionAria: string;
  textNeedsAttentionTitle: string;
  /** SignTool/textMessages.ts's text-policy sentences. */
  fontSubstitutionTemplate: string;
  unrepresentableSavingTemplate: string;
  unrepresentableTypingTemplate: string;
  wherePageOneTemplate: string;
  wherePagesManyTemplate: string;
  pageListAndWord: string;
  fallbackFontNotice: string;
  noFontForCharactersTemplate: string;
  noSingleFontTemplate: string;
  noSingleFontMoreClause: string;
  pieceInFontTemplate: string;
  /** PdfSignTool.tsx's setAnnouncement() calls and history descriptions. */
  fontNotReadyTemplate: string;
  defaultFontUnavailable: string;
  exportGenericFailure: string;
  editsChangedWhilePreparing: string;
  revertedSelectedActions: string;
  undidActionTemplate: string;
  invalidPdfFile: string;
  placedSignatureOnPage: string;
  signaturePlacedNotSaved: string;
  removedElement: string;
  finishedEditingHint: string;
  copiedElement: string;
  pastedElement: string;
  writingSignaturesIntoPdf: string;
  signingStoppedLabel: string;
  signedPdfReadyToShare: string;
  pdfSignedDownloadStarted: string;
  downloadStarted: string;
  pdfSignedSuccessfully: string;
  sharingCanceledStillReady: string;
  shareOpenFailed: string;
  signatureDeleted: string;
  signatureDeletedNotSaved: string;
  addedSignatureDescription: string;
  deletedElementDescriptionTemplate: string;
  duplicatedElementDescriptionTemplate: string;
  /** PdfWorkspace.tsx's own strings. */
  savingDocumentLayers: string;
  pdfMayBeProtectedOrEncrypted: string;
  reviewingFirstIssueAnnouncement: string;
  clearedPageAnnouncementTemplate: string;
  clearedPageDescriptionOne: string;
  clearedPageDescriptionOther: string;
  /** src/lib/useWorkspaceGestures.ts's announcements and history descriptions -
   * `addedShapeDescriptionTemplate`/`addedShapeAnnouncementTemplate` fix the
   * raw-tool-id interpolation bug this ticket calls out, via
   * `signElementTypeLabel` above. */
  removedSymbolFromBoxAnnouncement: string;
  removedSymbolFromBoxDescription: string;
  addedTextBoxDescription: string;
  addedTextBoxCombAnnouncementTemplate: string;
  addedTextBoxAnnouncement: string;
  addedSymbolDescription: string;
  addedSymbolInBoxAnnouncement: string;
  addedSymbolAnnouncement: string;
  addedWhiteoutDescription: string;
  addedWhiteoutAnnouncement: string;
  addedShapeDescriptionTemplate: string;
  addedShapeAnnouncementTemplate: string;
  /** src/editor/workspace/loadPdf.ts is shared with Redact, so it takes its
   * own small locally-typed message param rather than this whole catalogue -
   * these four keys are only where Sign sources that param's overrides from. */
  pdfLoadTimeout: string;
  pdfLoadFailedGeneric: string;
  pdfRestoredTemplate: string;
  pdfLoadedTemplate: string;
  lang: string;
  dir: 'ltr' | 'rtl';
}
