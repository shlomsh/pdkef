import pdfToolStyles from './PdfTool.module.css';
import dialogStyles from './Dialog.module.css';

/* `className` (Direction A, Merge): a caller that puts Share in a row of equal
   buttons passes its own class instead of the dialog-secondary look; every
   other tool passes nothing and renders exactly as before. */
export default function PdfShareButton({ visible, onShare, label = 'Share PDF', className }: { visible: boolean; onShare: () => void; label?: string; className?: string }) {
  if (!visible) return null;

  return (
    <button type="button" class={className ?? `${dialogStyles.button} ${dialogStyles.secondary} ${pdfToolStyles['pdf-share-button']}`} onClick={onShare}>
      {/* Merge's hand-off row (2026-09-13): Share, Compress it and Sign it
          all carry a 16px icon before the label - matched here rather than
          this button's own former 18px, so the three read as one row. */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
        <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      </svg>
      {label}
    </button>
  );
}
