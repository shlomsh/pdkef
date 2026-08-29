import styles from './ExportReadinessNotice.module.css';

type ExportReadinessNoticeProps = {
  fieldCount: number;
  onReview: () => void;
};

/**
 * Compact, action-local explanation for an intentionally disabled export.
 * The workspace owns navigation; this component only presents that state.
 */
export default function ExportReadinessNotice({ fieldCount, onReview }: ExportReadinessNoticeProps) {
  const fieldLabel = `${fieldCount} text field${fieldCount === 1 ? '' : 's'}`;

  return (
    <div id="sign-export-readiness" className={styles.notice} role="status" data-sign-export-readiness>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
        <path d="M12 7.5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
      <span><strong>{fieldLabel} need{fieldCount === 1 ? 's' : ''} attention</strong> before download or sharing.</span>
      <button type="button" onClick={onReview}>Review fields</button>
    </div>
  );
}
