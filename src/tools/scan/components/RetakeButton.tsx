import { useRef } from 'preact/hooks';
import { RefreshCw } from 'lucide-preact';
import { PHOTO_ACCEPT } from '#lib/hooks/usePhotoTileList.ts';
import { takeInputFiles } from '#shell/prePickedFiles.ts';
import { englishScanMessages as t } from '../messages.ts';
import styles from './ScanPageView.module.css';

/** Retake: replaces this page's photo with one more. Shown on every pointer, unlike Take a photo:
 * a phone opens the camera, a desktop picks a replacement photo. Emits the one file chosen. */
export default function RetakeButton({ onRetake }: { onRetake: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChange = (event: Event) => {
    const [file] = takeInputFiles(event.currentTarget as HTMLInputElement);
    if (file) onRetake(file);
  };
  return (
    <span class={styles.cell}>
      <button type="button" class={styles.item} onClick={() => inputRef.current?.click()}>
        <RefreshCw size={20} aria-hidden="true" />
        <span>{t.retake}</span>
      </button>
      <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} capture="environment" class="sr-only" tabIndex={-1} aria-hidden="true" onChange={onChange} />
    </span>
  );
}
