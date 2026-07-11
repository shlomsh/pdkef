import pdfToolStyles from './PdfTool.module.css';
import dialogStyles from './SignatureDialog.module.css';

export default function PdfShareButton({ visible, onShare, label = 'Share PDF' }) {
  if (!visible) return null;

  return (
    <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary} ${pdfToolStyles['pdf-share-button']}`} onClick={onShare}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
