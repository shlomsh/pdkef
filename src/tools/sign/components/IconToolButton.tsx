import type { ComponentChildren } from 'preact';
import ArmHint from '#editor-ui/ArmHint.tsx';
import styles from '#editor-ui/SignToolbar.module.css';
import { toolButtonProps } from './toolButtonProps.ts';

/** One plain arm-a-tool button of Sign's toolbar: an icon, a label, the ArmHint
 * bubble that teaches the double-click lock. Whiteout, Highlight and Comment
 * are exactly this; the tools with a menu or a custom trigger (Shapes,
 * Signature, Symbols) stay inline in SignToolbar.tsx. */
export default function IconToolButton({ tool, label, action, selectedTool, toolLocked, autoShowTool, hintTemplate, touchHintTemplate, onArm, iconOnly = false, children }: {
  tool: string;
  label: string;
  action: string;
  selectedTool: string | null;
  toolLocked: boolean;
  autoShowTool: string | null;
  hintTemplate: string;
  touchHintTemplate: string;
  onArm: (event: MouseEvent) => void;
  /** Sign's `data-icon-only`: a convention the icon carries on the labelled desktop row, which has no width to spare. */
  iconOnly?: boolean;
  children: ComponentChildren;
}) {
  const locked = selectedTool === tool && toolLocked;
  return (
    <ArmHint tool={tool} label={label} action={action} locked={locked} autoShowTool={autoShowTool} hintTemplate={hintTemplate} touchHintTemplate={touchHintTemplate}>
      <button type="button" {...toolButtonProps(selectedTool === tool, toolLocked)} onClick={onArm} {...(iconOnly ? { 'data-icon-only': true } : {})}>
        {children}
        <span className={styles.label}>{label}</span>
      </button>
    </ArmHint>
  );
}
