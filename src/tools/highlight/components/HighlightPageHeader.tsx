import EditorPageHeader from '#editor-ui/EditorPageHeader.tsx';
import { englishSignMessages as t } from '#editor/registry/signMessages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';

/** The row above a page, as Sign draws it: Rotate always, Clear page once the page holds a mark or a comment. */
export default function HighlightPageHeader({ pageIndex, hasMarks, onRotate, onClear }: {
  pageIndex: number;
  hasMarks: boolean;
  onRotate: () => void;
  onClear: () => void;
}) {
  const number = pageIndex + 1;
  return (
    <EditorPageHeader
      pageNumber={number} pageLabel={formatMessage(t.pageLabel, { number })}
      onClear={hasMarks ? onClear : null} clearTitle={t.clearPageTitle} clearLabel={t.clearPageLabel}
      onRotate={onRotate} rotateLabel={t.rotatePageLabel} rotateTitle={formatMessage(t.rotatePageTitle, { number })}
      lang={t.lang} dir={t.dir}
    />
  );
}
