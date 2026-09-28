import { useState } from 'preact/hooks';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import styles from './SavedFileCheck.module.css';
import {
  attachmentsNote,
  canCover,
  CHECK_FAILED,
  CHECK_LEAD,
  CHECKING,
  COVER_IT,
  findingText,
  NO_MATCH,
  NOTHING_COVERED,
  picturePagesNote,
  SEARCH_BUTTON,
  SEARCH_LABEL,
  unsolidNote,
} from './check/checkCopy.ts';
import type { CheckTerm } from './check/types.ts';
import type { SavedFileCheckState } from './useSavedFileCheck.ts';

/**
 * RED-17: the check of the saved file, under the export actions. It reports
 * what it found and where; it never says a term is absent (checkCopy.ts).
 */
export default function SavedFileCheck({
  state,
  onSearch,
  onCover,
}: {
  state: SavedFileCheckState;
  onSearch: (text: string) => void;
  onCover: (term: CheckTerm, pageIndex: number) => void;
}) {
  const [query, setQuery] = useState('');
  if (state.status === 'idle') return null;
  if (state.status === 'checking') {
    return <p className={pdfToolStyles['hint-message']} role="status">{CHECKING}</p>;
  }
  if (state.status === 'failed') {
    return <p className={pdfToolStyles['hint-message']} role="status">{CHECK_FAILED}</p>;
  }

  const { outcome, typed } = state;
  const results = [...outcome.results, ...typed];
  const unsolid = unsolidNote(outcome.unsolidPages);
  const pictures = picturePagesNote(outcome.context.saved.picturePages);
  const attachments = attachmentsNote(outcome.context.saved.attachmentCount);

  return (
    <section className={styles.check} aria-label="Check of the saved file" data-saved-file-check>
      {unsolid && <p className={styles.danger} role="alert">{unsolid}</p>}
      <p className={styles.lead}>{CHECK_LEAD}</p>
      {outcome.results.length === 0 && <p className={styles.note}>{NOTHING_COVERED}</p>}
      {results.length > 0 && (
        <ul className={styles.terms}>
          {results.map(({ term, findings }) => (
            <li key={`${term.source}:${term.label}`} data-check-term={term.label}>
              <span className={styles.term}>&ldquo;{term.label}&rdquo;</span>
              {findings.length === 0 ? (
                <span className={styles.finding}>{NO_MATCH}</span>
              ) : (
                <ul className={styles.findings}>
                  {findings.map((finding) => (
                    <li key={findingText(finding)} className={styles.finding}>
                      {findingText(finding)}
                      {canCover(finding) && (
                        <button type="button" className={styles.cover} onClick={() => onCover(term, finding.pageIndex)}>
                          {COVER_IT}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {pictures && <p className={styles.note}>{pictures}</p>}
      {attachments && <p className={styles.note}>{attachments}</p>}
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(query);
          setQuery('');
        }}
      >
        <label className={styles.label}>
          {SEARCH_LABEL}
          <input
            className={styles.input}
            type="search"
            value={query}
            onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button type="submit" className={styles.submit} disabled={!query.trim()}>{SEARCH_BUTTON}</button>
      </form>
    </section>
  );
}

