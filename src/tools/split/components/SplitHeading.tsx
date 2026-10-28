import { pagesLabel, skippedLabel } from '#shell/pageWorkspace/pageCounts.ts';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import OutputName from '#shell/OutputName.tsx';
import type { ShellMessages } from '#shell/shellMessages.ts';
import type { SplitMessages } from '../messages';

interface SplitHeadingProps {
  combined: boolean;
  title: string;
  fileName: string;
  outputCount: number;
  skippedCount: number;
  /** Counts the files of One PDF per page. */
  pdfsLabel: (n: number) => string;
  onRename: (next: string) => void;
  onEditingChange: (editing: boolean) => void;
  messages: SplitMessages;
  shellMessages: ShellMessages;
}

/** The document heading: the editable output name, or the fixed per-page file pattern. */
export default function SplitHeading({
  combined, title, fileName, outputCount, skippedCount, pdfsLabel,
  onRename, onEditingChange, messages: t, shellMessages: sm,
}: SplitHeadingProps) {
  return (
    <h2 class={workspaceStyles['doc-heading']} id="page-grid-heading">
      <span class="sr-only">{t.documentHeading}</span>
      {combined ? (
        <OutputName
          prefix="extracted_"
          name={title}
          label={t.fileNameEditableLabel}
          onRename={onRename}
          onEditingChange={onEditingChange}
          wrapOnPhone
        >
          <span class={workspaceStyles['doc-heading-count']}>
            {' · '}{pagesLabel(outputCount, sm)}
            {skippedCount > 0 ? ` · ${skippedLabel(skippedCount, t)}` : ''}
          </span>
        </OutputName>
      ) : (
        <>
          <bdi dir="ltr">{fileName}</bdi>
          <span class={workspaceStyles['doc-heading-count']}>
            {' · '}{pdfsLabel(outputCount)}
            {skippedCount > 0 ? ` · ${skippedLabel(skippedCount, t)}` : ''}
          </span>
        </>
      )}
    </h2>
  );
}
