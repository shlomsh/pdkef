import styles from './EditorPageHeader.module.css';

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
 */
export default function EditorPageHeader({ pageNumber, onClear, clearTitle }: { pageNumber: number; onClear: (() => void) | null; clearTitle?: string }) {
  return (
    <div className={styles['page-header']} data-editor-page-header>
      <span className={styles['page-number']} data-editor-page-number>Page {pageNumber}</span>
      {onClear && (
        <button
          type="button"
          className={styles['clear-page']}
          title={clearTitle}
          onClick={onClear}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Clear page
        </button>
      )}
    </div>
  );
}
