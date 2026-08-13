import { useEffect, useState } from 'preact/hooks';
import { listDeletableObjects } from './deleteObjects.js';

/**
 * Finds the images and text runs the Delete tool can offer to remove, for the
 * currently loaded file.
 *
 * Runs once per `file` identity, reusing the bytes already held in
 * `fileBytesRef` rather than re-reading the File a second time (the same
 * bytes `redactPdf`'s own pdf-lib pass would read). Any failure - a file this
 * lexer cannot parse at all, not just one odd page - yields an empty list
 * rather than throwing: Delete mode then simply has nothing to highlight,
 * which is the same "no highlight, no delete" fallback `listDeletableObjects`
 * already applies per page.
 *
 * @param {File|null} file identity that triggers a re-scan
 * @param {ArrayBuffer|Uint8Array|null} fileBytes the loaded file's bytes
 * @returns {Array} objects as reported by `listDeletableObjects`
 */
export default function useDeletableObjects(file, fileBytes) {
  const [objects, setObjects] = useState([]);

  useEffect(() => {
    let cancelled = false;

    if (!file || !fileBytes) {
      setObjects([]);
      return undefined;
    }

    listDeletableObjects(fileBytes)
      .then((found) => {
        if (!cancelled) setObjects(found);
      })
      .catch((err) => {
        console.error('Could not read deletable objects from this PDF', err);
        if (!cancelled) setObjects([]);
      });

    return () => {
      cancelled = true;
    };
  }, [file, fileBytes]);

  return objects;
}
