import pdfToolStyles from './PdfTool.module.css';

export const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

/**
 * The animated progress ring + percentage text that goes inside a tool's
 * primary action button while it's running. Redeclared identically (same
 * SVG, same circumference math) in six tools before this; `label` is the
 * one thing that actually varies ("Merging…", "Splitting…", ...).
 */
export default function ProgressRing({ progress, label }: { progress: number; label: string }) {
  const offset = PROGRESS_RING_CIRCUMFERENCE - progress * PROGRESS_RING_CIRCUMFERENCE;

  return (
    <span class={pdfToolStyles['tool-primary-action-progress']}>
      <svg class={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
        <circle class={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" />
        <circle
          class={pdfToolStyles['progress-ring-fill']}
          cx="20"
          cy="20"
          r="18"
          stroke-dasharray={PROGRESS_RING_CIRCUMFERENCE}
          stroke-dashoffset={offset}
        />
      </svg>
      {label} {Math.round(progress * 100)}%
    </span>
  );
}
