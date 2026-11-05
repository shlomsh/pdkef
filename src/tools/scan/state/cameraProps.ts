// What the viewfinder gets from the island (SCAN-08): taking pages for the scan (many) or one replacement for
// a page (one), built from the island's own actions. Plain functions, like scanActions.ts.
import type { ViewfinderProps } from '../lib/camera/types.ts';
import { resultKey } from '../lib/scanPages.ts';
import type { ScanDispatch } from '../hooks/scanHost.ts';
import type { CameraMode } from './scanState.ts';
import type { PageResult, ScanPage } from './scanWork.ts';

interface CameraPropsInput {
  camera: CameraMode | null;
  pages: ScanPage[];
  results: Record<number, PageResult>;
  dispatch: ScanDispatch;
  addCameraFiles: (files: File[], from?: { fromCamera: boolean }) => void;
  retakePage: (id: number, file: File) => void;
  /** The centre view: the viewer (result, corners) over a many-mode camera pauses it. */
  view: 'table' | 'result' | 'corners' | 'split';
}

/** The page as it will download once its result is current (corners and look), its photo until then. */
function lastPageSrc(page: ScanPage, results: Record<number, PageResult>): string | null {
  const result = results[page.id];
  return result?.key === resultKey(page) ? result.url : page.preview;
}

/** The viewfinder's props while the camera is open, null otherwise. */
export function cameraProps({ camera, pages, results, dispatch, addCameraFiles, retakePage, view }: CameraPropsInput): ViewfinderProps | null {
  if (!camera) return null;
  const last = pages[pages.length - 1];
  const close = () => dispatch({ type: 'cameraClosed' });
  const retakeWith = (pageId: number, file: File) => { retakePage(pageId, file); close(); };
  return {
    mode: camera.mode,
    count: pages.length,
    scanFiles: pages.filter((page) => camera.mode === 'many' || page.id !== camera.pageId).map((page) => page.file),
    lastSrc: last ? lastPageSrc(last, results) : null,
    onTaken: (file) => (camera.mode === 'one' ? retakeWith(camera.pageId, file) : addCameraFiles([file], { fromCamera: true })),
    onClose: close,
    paused: camera.mode === 'many' && view !== 'table',
    // The last page opens in the viewer, over the running camera.
    onReview: () => { if (last) dispatch({ type: 'pageOpened', id: last.id }); },
    onFallbackFiles: (files) => {
      if (camera.mode === 'one') retakeWith(camera.pageId, files[0]);
      else { addCameraFiles(files); close(); }
    },
  };
}
