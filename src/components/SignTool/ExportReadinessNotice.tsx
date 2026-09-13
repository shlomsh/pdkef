import { englishSignMessages, formatMessage, type SignMessages } from '../../i18n/toolMessages';
import styles from './ExportReadinessNotice.module.css';

type ExportReadinessNoticeProps = {
  fieldCount: number;
  onReview: () => void;
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop. */
  messages?: Partial<SignMessages>;
};

/**
 * Compact, action-local explanation for an intentionally disabled export.
 * The workspace owns navigation; this component only presents that state.
 */
export default function ExportReadinessNotice({ fieldCount, onReview, messages }: ExportReadinessNoticeProps) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  const fieldLabel = formatMessage(fieldCount === 1 ? t.exportReadinessBoldOne : t.exportReadinessBoldOther, { count: fieldCount });

  return (
    <div id="sign-export-readiness" className={styles.notice} role="status" data-sign-export-readiness>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
        <path d="M12 7.5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
      <span><strong>{fieldLabel}</strong> {t.exportReadinessSuffix}</span>
      <button type="button" onClick={onReview}>{t.reviewFieldsLabel}</button>
    </div>
  );
}
