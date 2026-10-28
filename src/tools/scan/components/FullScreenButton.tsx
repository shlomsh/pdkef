import { Expand, Minimize2 } from 'lucide-preact';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';

interface FullScreenButtonProps {
  full: boolean;
  onToggle: () => void;
  labels: { enter: string; exit: string };
}

/** The head's Full screen toggle: the corners and the page as it downloads share it. */
export default function FullScreenButton({ full, onToggle, labels }: FullScreenButtonProps) {
  return (
    <button type="button" class={workspaceStyles['quiet-button']} onClick={onToggle}>
      {full ? <Minimize2 size={16} aria-hidden="true" /> : <Expand size={16} aria-hidden="true" />}
      {full ? labels.exit : labels.enter}
    </button>
  );
}
