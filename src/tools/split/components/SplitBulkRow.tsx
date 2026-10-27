import { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import type { SplitMessages } from '../messages';

interface SplitBulkRowProps {
  onIncludeAll: () => void;
  onSkipAll: () => void;
  onInvert: () => void;
  messages: SplitMessages;
}

/** Include all, skip all and invert: the quiet row of bulk page actions. */
export default function SplitBulkRow({ onIncludeAll, onSkipAll, onInvert, messages: t }: SplitBulkRowProps) {
  return (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onIncludeAll}>{t.includeAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onSkipAll}>{t.skipAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onInvert}>{t.invertPages}</button>
    </div>
  );
}
