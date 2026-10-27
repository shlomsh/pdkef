import { useCallback, useState } from 'preact/hooks';
import { partitionTurned } from '../lib/scanPages.ts';
import type { PageResult } from '../state/scanWork.ts';

/** What the island shows besides the pages: results, turned previews, skipped files and the live-region text. */
export function useScanBoard() {
  const [results, setResults] = useState<Record<number, PageResult>>({});
  /** Each turned page's preview, turned the same way for the corner editor, by `${id}|${turns}`. */
  const [turnedPreviews, setTurnedPreviews] = useState<Record<string, string>>({});
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  /** Bumped when a build lands, so the per-key maps the work object holds are read again. */
  const [, setBuilt] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => (previous === text ? `${text} ` : text));
  }, []);
  const forgetTurned = (match: (key: string) => boolean) => {
    setTurnedPreviews((map) => {
      const { kept, dropped } = partitionTurned(map, match);
      dropped.forEach((url) => URL.revokeObjectURL(url));
      return kept;
    });
  };
  return {
    results, setResults, turnedPreviews, setTurnedPreviews, rejectedFiles, setRejectedFiles,
    announcement, setAnnouncement, announce, forgetTurned, bumpBuilt: () => setBuilt((n) => n + 1),
  };
}
