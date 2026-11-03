import { useRef } from 'preact/hooks';
import { PHOTO_ACCEPT as ACCEPT } from '#lib/hooks/usePhotoTileList.ts';
import { takeInputFiles, useAdoptPrePickedFiles } from '#shell/prePickedFiles.ts';
import dropzoneStyles from '#shell/Dropzone.module.css';
import { canUseCamera } from '../camera/canUseCamera.ts';
import { loadViewfinder } from '../camera/loadCamera.ts';
import { englishScanMessages as t } from '../messages.ts';
import styles from '../PdfScanTool.module.css';

/** "Start scanning": the empty state's lead action on a phone. Where the live camera works it opens the
 * viewfinder; elsewhere (and before hydration) the same label-around-input opens the native camera. */
export default function StartScanButton({ onFiles, onStart }: { onFiles: (files: File[]) => void; onStart: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Server-rendered, so a photo can be taken before this loads.
  useAdoptPrePickedFiles(inputRef, onFiles);
  const onChange = (event: Event) => {
    const files = takeInputFiles(event.currentTarget as HTMLInputElement);
    if (files.length > 0) onFiles(files);
  };
  const onClick = (event: Event) => {
    if (!canUseCamera()) return;
    event.preventDefault();
    onStart();
  };
  // Warm the chunk while the finger is down; a failed load surfaces when the viewfinder is needed.
  const warm = () => { if (canUseCamera()) loadViewfinder().catch(() => {}); };
  return (
    <span class={styles['take-photo']}>
      <label class={dropzoneStyles['file-picker-button']} onClick={onClick} onPointerDown={warm}>
        {t.startScanning}
        <input ref={inputRef} type="file" accept={ACCEPT} capture="environment" class={dropzoneStyles['file-input']} onChange={onChange} />
      </label>
    </span>
  );
}
