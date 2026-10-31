import type { ToolCopy } from '#editor-ui/EditorToolStatus.tsx';
import type { SignToolType } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';

// Every tool-facing string, built from `t` per render (LOC-09 stage 1) so a
// Hebrew catalogue reaches it the same way the English default does.
export const buildToolCopy = (t: SignMessages): Record<SignToolType, ToolCopy> => ({
  text:      { action: t.textAction,      actionTouch: t.textActionTouch,      button: t.textButton },
  date:      { action: t.dateAction,      actionTouch: t.dateActionTouch,      button: t.dateButton },
  symbol:    { action: t.symbolAction,    actionTouch: t.symbolActionTouch,    button: t.symbolsButton },
  signature: { action: t.signatureAction, actionTouch: t.signatureActionTouch, button: t.signButton },
  whiteout:  { action: t.whiteoutAction,  actionTouch: t.whiteoutActionTouch,  button: t.whiteoutButton },
  ellipse:   { action: t.ellipseAction,   actionTouch: t.ellipseActionTouch,   button: t.shapesButton },
  rectangle: { action: t.rectangleAction, actionTouch: t.rectangleActionTouch, button: t.shapesButton },
  line:      { action: t.lineAction,      actionTouch: t.lineActionTouch,      button: t.shapesButton },
  highlight: { action: t.highlightAction, actionTouch: t.highlightActionTouch, button: t.highlightLabel },
  comment:   { action: t.commentAction,   actionTouch: t.commentActionTouch,   button: t.commentToolLabel },
});
