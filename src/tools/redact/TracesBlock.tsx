import styles from './SavedFileCheck.module.css';
import { describeTraces, survivedRows } from './check/describeTraces.ts';
import type { TracePart } from './check/describeTraces.ts';
import {
  DROP_IT,
  KEEP_IT,
  KEPT,
  TRACES_LEAD,
  TRACES_NONE,
  TRACES_READ_BACK,
  TRACES_SURVIVED_ALERT,
  TRACE_SURVIVED,
} from './check/checkCopy.ts';
import { hasNoTraces } from '../../editor/adapters/pdf/documentTraces.js';
import type { DocumentTraces } from '../../editor/adapters/pdf/documentTraces.js';

function Part({ part }: { part: TracePart }) {
  if (part.type === 'value') return <bdi dir="auto">{part.text}</bdi>;
  if (part.type === 'date') return <time dateTime={part.iso}>{part.text}</time>;
  return <>{part.text}</>;
}

/**
 * RED-59: the original file's details, each struck through with a check once
 * the saved file is read back without it; one that survived turns danger.
 */
export default function TracesBlock({
  traces,
  keptAttachments,
  onKeepAttachment,
  onDropAttachment,
  locale,
  now,
}: {
  traces: { original: DocumentTraces; saved: DocumentTraces };
  keptAttachments: readonly string[];
  onKeepAttachment?: (name: string) => void;
  onDropAttachment?: (name: string) => void;
  locale?: string;
  now?: Date;
}) {
  if (hasNoTraces(traces.original)) {
    return <p className={styles.rb} data-traces>{TRACES_NONE}</p>;
  }
  const rows = describeTraces(traces.original, { locale: locale ?? navigator.language, now: now ?? new Date() });
  const survived = survivedRows(rows, traces.saved);
  return (
    <div data-traces>
      <h3 className={styles.tracesLead}>{TRACES_LEAD}</h3>
      <ul className={styles.traces}>
        {rows.map((row) => {
          const bad = survived.has(row.id);
          const name = row.attachment;
          const kept = name !== undefined && keptAttachments.includes(name);
          const struck = !bad && !kept;
          const body = row.parts.map((part, i) => <Part key={i} part={part} />);
          return (
            <li
              key={row.id}
              className={bad ? `${styles.traceRow} ${styles.danger}` : styles.traceRow}
              data-trace-row={row.id}
              data-trace-survived={bad ? '' : undefined}
            >
              {bad && <span className={styles.mark} aria-hidden="true">!</span>}
              {struck && <span className={styles.mark} aria-hidden="true">{'✓'}</span>}
              {struck ? <s>{body}</s> : <span>{body}</span>}
              {bad && <strong> {TRACE_SURVIVED}</strong>}
              {kept && <span className={styles.note}>{KEPT}</span>}
              {kept && onDropAttachment && name !== undefined && (
                <button type="button" className={styles.cover} onClick={() => onDropAttachment(name)}>{DROP_IT}</button>
              )}
              {!kept && !bad && name !== undefined && onKeepAttachment && (
                <button type="button" className={styles.cover} onClick={() => onKeepAttachment(name)}>{KEEP_IT}</button>
              )}
            </li>
          );
        })}
      </ul>
      {survived.size > 0 ? (
        <p className={styles.danger} role="alert">{TRACES_SURVIVED_ALERT}</p>
      ) : (
        <p className={styles.rb}>{TRACES_READ_BACK}</p>
      )}
    </div>
  );
}
