import type { SignToolType } from '#editor/model/editorModel.ts';
import styles from '#editor-ui/SignToolbar.module.css';

/**
 * Class and state attribute for a toolbar tool button. `chosen` is the tool
 * being the selected one; `locked` adds the keep-on state. aria-pressed stays
 * on the button itself, `data-locked` is the invisible twin of `.locked`.
 */
export function toolButtonProps(chosen: boolean, locked: boolean) {
  const keptOn = chosen && locked;
  return {
    className: `${styles.button}${chosen ? ` ${styles.active}` : ''}${keptOn ? ` ${styles.locked}` : ''}`,
    'data-locked': keptOn ? true : undefined,
  };
}

// The tools that live behind the Shapes button, so its pressed/locked state and
// its lock target read from one list instead of three copies of the same array.
export type ShapeTool = Extract<SignToolType, 'ellipse' | 'rectangle' | 'line'>;
const SHAPE_TOOLS: readonly ShapeTool[] = ['ellipse', 'rectangle', 'line'];
export const isShapeTool = (tool: SignToolType | null): tool is ShapeTool => (
  tool !== null && SHAPE_TOOLS.includes(tool as ShapeTool)
);
