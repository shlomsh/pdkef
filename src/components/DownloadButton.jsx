import { useEffect, useRef } from 'preact/hooks';
import pdfToolStyles from './PdfTool.module.css';

/**
 * The single-output "done" download link, auto-focused when it mounts. Every
 * adopting tool only ever renders this once its output exists, so mounting
 * IS the "just finished" moment - a separate status-watching useEffect
 * elsewhere (every tool had its own, all identical) is redundant with that.
 *
 * Only for the single-output shape. Split and PDF to Image branch between
 * this and a "Download all N" button for multi-file output; that's a
 * genuinely different case; they keep their own ref/focus handling for it
 * rather than adopting this component for just one of their two branches.
 */
export default function DownloadButton({ href, download, label = 'Download PDF' }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <a ref={ref} class={pdfToolStyles['download-button']} href={href} download={download}>
      <svg class={pdfToolStyles['download-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
        <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      {label}
    </a>
  );
}
