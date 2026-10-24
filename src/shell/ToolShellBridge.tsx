import type { ComponentChildren } from 'preact';
import { useToolShell } from './ToolShell.tsx';

/** BasePdfTool's file input, replace confirmation and clear confirmation are
 * reached through ToolShellContext, which only reaches components rendered
 * inside <BasePdfTool>'s children - not the tool's own function body, which is
 * BasePdfTool's parent. This tiny bridge is that one descendant, so a tool's
 * "Choose files", "Replace file" and "Clear all" go through the exact same
 * picker and confirmation every other tool uses. */
export default function ToolShellBridge({ children }: {
  children: (shell: { requestReplace: () => void; requestClear: () => void }) => ComponentChildren;
}) {
  const { requestReplace, requestClear } = useToolShell();
  return <>{children({ requestReplace, requestClear })}</>;
}
