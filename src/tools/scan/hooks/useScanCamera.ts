import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import type { MutableRef } from 'preact/hooks';
import { loadViewfinder } from '../camera/loadCamera.ts';
import type { ViewfinderProps } from '../camera/types.ts';
import { resultKey } from '../lib/scanPages.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import type { ScanDispatch } from './scanHost.ts';

type CameraMode = null | { mode: 'many' } | { mode: 'one'; pageId: number };

interface ScanCameraInput {
  pages: ScanPage[];
  results: Record<number, PageResult>;
  unmountedRef: MutableRef<boolean>;
  dispatch: ScanDispatch;
  addFiles: (files: File[]) => void;
  retakePage: (id: number, file: File) => void;
  removePage: (id: number) => void;
}

/** The live camera (SCAN-08): taking pages for the scan (many) or one replacement for a page (one), and
 * the props the viewfinder gets. Its code loads the first time the camera opens. */
export function useScanCamera({ pages, results, unmountedRef, dispatch, addFiles, retakePage, removePage }: ScanCameraInput) {
  const [camera, setCamera] = useState<CameraMode>(null);
  const [Viewfinder, setViewfinder] = useState<ComponentType<ViewfinderProps> | null>(null);
  useEffect(() => {
    if (camera) loadViewfinder().then((m) => { if (!unmountedRef.current) setViewfinder(() => m.default); }, () => setCamera(null));
  }, [camera !== null]);

  const last = pages[pages.length - 1];
  const close = () => setCamera(null);
  const retakeWith = (pageId: number, file: File) => { retakePage(pageId, file); close(); };
  const viewfinderProps: ViewfinderProps | null = camera && Viewfinder ? {
    mode: camera.mode,
    count: pages.length,
    lastSrc: last ? (results[resultKey(last)]?.url ?? last.preview ?? null) : null,
    onTaken: (file) => (camera.mode === 'one' ? retakeWith(camera.pageId, file) : addFiles([file])),
    onClose: close,
    onRetakeLast: () => last && removePage(last.id),
    // Close and open the last page's corners, as a tap on its tile and then Corners would.
    onFixCorners: () => {
      close();
      if (!last) return;
      dispatch({ type: 'pageOpened', id: last.id });
      dispatch({ type: 'cornersOpened', focus: true });
    },
    onFallbackFiles: (files) => {
      if (camera.mode === 'one') retakeWith(camera.pageId, files[0]);
      else { addFiles(files); close(); }
    },
  } : null;
  return { Viewfinder, viewfinderProps, openMany: () => setCamera({ mode: 'many' }), openOne: (pageId: number) => setCamera({ mode: 'one', pageId }) };
}
