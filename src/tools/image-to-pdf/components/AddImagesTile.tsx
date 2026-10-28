import { useToolShell } from '#shell/ToolShell.tsx';
import styles from '../PdfImageToPdfTool.module.css';

// Its own component so it can reach the shell context (BasePdfTool provides it to its children).
export default function AddImagesTile({ label }: { label: string }) {
  const { requestReplace } = useToolShell();
  return (
    <li class={styles['add-tile']}>
      <button type="button" class={styles['add-button']} onClick={requestReplace}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        {label}
      </button>
    </li>
  );
}
