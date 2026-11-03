import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { loadViewfinder } from '../lib/camera/loadCamera.ts';
import type { ViewfinderProps } from '../lib/camera/types.ts';

/** The viewfinder, loaded the first time the camera opens (SCAN-08): the page's first load carries none of it.
 * If its code cannot load, the camera closes and the table stays. */
export default function ScanCamera(props: ViewfinderProps) {
  const [Viewfinder, setViewfinder] = useState<ComponentType<ViewfinderProps> | null>(null);
  useEffect(() => {
    let alive = true;
    loadViewfinder().then((m) => { if (alive) setViewfinder(() => m.default); }, (err) => {
      reportError('pdf_tool_run', err, 'scan_camera_load');
      if (alive) props.onClose();
    });
    return () => { alive = false; };
  }, []);
  return Viewfinder ? <Viewfinder {...props} /> : null;
}
