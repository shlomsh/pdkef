import pdfToolStyles from './PdfTool.module.css';

/**
 * The alert box a tool shows after a failed operation: same icon and wrapper
 * everywhere, only the lead-in phrase and the explanation differ per tool
 * (and per failure - Security switches text on WrongPasswordError).
 */
export default function ErrorMessage({ title = "That didn't work.", fullWidth, children }) {
  const className = fullWidth
    ? `${pdfToolStyles['error-message']} ${pdfToolStyles['error-message--full-width']}`
    : pdfToolStyles['error-message'];
  return (
    <div class={className} role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
        <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>
      <span>
        <strong>{title}</strong> {children}
      </span>
    </div>
  );
}
