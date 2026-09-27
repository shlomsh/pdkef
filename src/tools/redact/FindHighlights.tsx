import { useEffect, useRef } from 'preact/hooks';
import type { FindMatch } from './find/types.ts';
import styles from './FindBar.module.css';

/**
 * RED-02: one page's find matches, drawn over the page. Pressing a match makes
 * it the current one; it never draws, so the press stops here instead of
 * reaching the page's draw handler underneath.
 */
export default function FindHighlights({
  matches,
  currentId,
  coveredIds,
  onPick,
}: {
  matches: FindMatch[];
  currentId: string | null;
  coveredIds: ReadonlySet<string>;
  onPick: (id: string) => void;
}) {
  const currentRef = useRef<HTMLDivElement>(null);
  const hasCurrent = matches.some((match) => match.id === currentId);

  useEffect(() => {
    if (hasCurrent) currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentId, hasCurrent]);

  const stop = (event: Event) => event.stopPropagation();

  return (
    <>
      {matches.flatMap((match) => match.boxes.map((box, i) => {
        const current = match.id === currentId;
        return (
          <div
            key={`${match.id}/${i}`}
            ref={current && i === 0 ? currentRef : undefined}
            className={`${styles.match}${current ? ` ${styles.current}` : ''}${coveredIds.has(match.id) ? ` ${styles.covered}` : ''}`}
            style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
            onMouseDown={stop}
            onTouchStart={stop}
            onClick={() => onPick(match.id)}
            data-redact-find-match={match.id}
            data-current={current ? 'true' : undefined}
            aria-hidden="true"
          />
        );
      }))}
    </>
  );
}
