import styles from './EditorPageHeader.module.css';
import ToolbarMenu, { type ToolbarMenuItem } from './ToolbarMenu.tsx';
import { TrashIcon } from './toolIcons.tsx';

/*
 * The row above each rendered page in the Sign and Redact editors: the page's
 * number, and - only once that page actually holds something - a "Clear page"
 * action that wipes that one page's work and nothing else.
 *
 * It lives here rather than in either tool because both editors render the same
 * stack of pages and the button means the same thing in each; only the noun in
 * its tooltip differs (boxes vs annotations). The header itself is rendered
 * unconditionally so a page doesn't shift up and down as its last element is
 * added or removed - the button is what appears and disappears.
 *
 * `clearOptions` (RED-03, Redact) turns the button into a short menu when
 * clearing has more than one meaning, e.g. keeping boxes repeated on every
 * page; without it the button clears in one tap, as it always has.
 */
export default function EditorPageHeader({
  pageNumber,
  onClear,
  clearOptions,
  clearTitle,
  // LOC-16: "Page N" and "Clear page" are now sourced from SignMessages on
  // /he/sign/ (see PdfWorkspace.tsx) - the props below default to the exact
  // English strings this component always rendered, so PdfRedactTool.tsx
  // (which passes neither) is unaffected.
  pageLabel,
  clearLabel = 'Clear page',
  lang = 'en',
  dir = 'ltr',
}: {
  pageNumber: number;
  onClear: (() => void) | null;
  clearOptions?: ToolbarMenuItem[];
  clearTitle?: string;
  pageLabel?: string;
  clearLabel?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}) {
  const trashIcon = <TrashIcon />;
  return (
    <div className={styles['page-header']} data-editor-page-header dir={dir} lang={lang}>
      <span className={styles['page-number']} data-editor-page-number>{pageLabel ?? `Page ${pageNumber}`}</span>
      {onClear && clearOptions && clearOptions.length > 0 ? (
        <ToolbarMenu
          title={clearTitle ?? clearLabel}
          triggerClassName={styles['clear-page']}
          triggerAttrs={{ 'data-editor-clear-page-trigger': true }}
          triggerContent={<>{trashIcon}{clearLabel}</>}
          items={clearOptions}
        />
      ) : onClear && (
        <button
          type="button"
          className={styles['clear-page']}
          title={clearTitle}
          onClick={onClear}
        >
          {trashIcon}
          {clearLabel}
        </button>
      )}
    </div>
  );
}
