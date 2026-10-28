import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { useRecentWhiteoutColors } from '#editor-ui/whiteout/useRecentWhiteoutColors.ts';
import { rememberAppStyle } from '#editor/workspace/preferenceStore.ts';
import { brushStyleOf, type BrushSettings } from '../components/BrushControls.tsx';
import { brushKindOf, type RedactAction, type RedactState } from '../state/redactState.ts';
import type { RedactToolType } from '#editor/model/editorModel.ts';
import type { BlurStrength } from '#editor/model/blurStrength.ts';
import usePeekAll from './usePeekAll.ts';

/**
 * Which tool is armed and the settings a person chooses for it: the brush, the
 * whiteout colour, the blur strength, the recent colours and Peek. Each choice is
 * also remembered as the default for the next document.
 *
 * RED-40: colour and strength are per-document style, like the brush. The
 * browser-wide preferences are only the last fallback; `state.tool.carried` holds
 * only what this document's owner explicitly chose (it rides in the draft), and a
 * document that never chose follows the person's latest choice in any document.
 * A brush is not a tool of its own: it is Blur or Whiteout armed in brush mode.
 */
export default function useRedactArming({ state, dispatch }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
}) {
  const changeBrush = (next: BrushSettings) => {
    dispatch({ type: 'BRUSH_CHOSEN', brush: next, carriedPatch: brushStyleOf(next) });
    rememberAppStyle(brushStyleOf(next));
  };

  // The single entry point for arming: `setTool('blur')` for one box,
  // `setTool('blur', true)` to keep it on. Locking is meaningless without a
  // tool, so disarming always clears it.
  const setTool = (tool: RedactToolType | null, locked = false) => {
    dispatch(tool ? { type: 'TOOL_ARMED', tool, locked } : { type: 'TOOL_DISARMED' });
    if (tool) recordAction('arm_tool');
  };

  // Fired once a placement is committed. A locked tool ignores it and stays
  // armed - the same contract as the Sign reducer's DISARM_TOOL.
  const disarmTool = () => dispatch({ type: 'PLACEMENT_COMMITTED' });
  // The brush is armed when Blur or Whiteout is armed in brush mode. It is the
  // one documented exception to "a tool disarms after one placement": painting
  // takes several strokes, so it stays armed until Stop or Esc.
  const brushKind = brushKindOf(state);

  const rememberColor = (color: string) => {
    dispatch({ type: 'COLOR_CHOSEN', color });
    rememberAppStyle({ whiteoutColor: color });
  };

  // RED-53: the last custom colours, offered on a whiteout's toolbar. Only a
  // deliberate pick is recorded, never an automatic sample or a brush drag step.
  const [recentColors, rememberRecentColor] = useRecentWhiteoutColors();

  const rememberBlurStrength = (strength: BlurStrength) => {
    dispatch({ type: 'BLUR_STRENGTH_CHOSEN', strength });
    rememberAppStyle({ blurStrength: strength });
  };
  // RED-31: hold Peek (or Space) to see under every box. View state only.
  const { peekAll, setPeekAll } = usePeekAll();

  return {
    changeBrush, setTool, disarmTool, brushKind, rememberColor, recentColors, rememberRecentColor,
    rememberBlurStrength, peekAll, setPeekAll,
  };
}

export type RedactArming = ReturnType<typeof useRedactArming>;
