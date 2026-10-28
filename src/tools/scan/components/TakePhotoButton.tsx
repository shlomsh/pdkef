import { useRef } from 'preact/hooks';
import { Camera } from 'lucide-preact';
import { PHOTO_ACCEPT as ACCEPT } from '#lib/hooks/usePhotoTileList.ts';
import { takeInputFiles, useAdoptPrePickedFiles } from '#shell/prePickedFiles.ts';
import dropzoneStyles from '#shell/Dropzone.module.css';
import { englishScanMessages as t } from '../messages.ts';
import styles from '../PdfScanTool.module.css';

/** "Take a photo": the camera straight away on a phone, one page per shot. Coarse pointers only (CSS).
 * `primary` is the empty state's, the equal of Choose files: the same label-around-input as the shell's
 * picker, so iOS opens the camera natively. The pages column's is a quiet tile, the phone bar's a bar button. */
export default function TakePhotoButton({ onFiles, primary = false, buttonClass = styles['take-photo-button'] }: { onFiles: (files: File[]) => void; primary?: boolean; buttonClass?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The empty state's camera button is server-rendered, so a photo can be taken before this loads.
  useAdoptPrePickedFiles(inputRef, onFiles);
  const onChange = (event: Event) => {
    const files = takeInputFiles(event.currentTarget as HTMLInputElement);
    if (files.length > 0) onFiles(files);
  };
  if (primary) {
    return (
      <span class={styles['take-photo']}>
        {/* No icon: it pairs with Choose files, which has none, as two equal buttons. */}
        <label class={dropzoneStyles['file-picker-button']}>
          {t.takePhoto}
          <input ref={inputRef} type="file" accept={ACCEPT} capture="environment" class={dropzoneStyles['file-input']} onChange={onChange} />
        </label>
      </span>
    );
  }
  return (
    <span class={styles['take-photo']}>
      <button type="button" class={buttonClass} onClick={() => inputRef.current?.click()}>
        <Camera size={18} aria-hidden="true" />
        {t.takePhoto}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} capture="environment" class="sr-only" tabIndex={-1} aria-hidden="true" onChange={onChange} />
    </span>
  );
}
