# Anonymous maintenance telemetry

PDkef processes PDF files, typed text, signatures, filenames, and saved drafts only in the browser. The hosted production site also uses Vercel Web Analytics for a **10% random sample** of completed Sign exports. The sample is best-effort: offline browsers make no telemetry call, delivery failures are ignored, and no event is queued in browser storage.

The sole custom event is `sign_export`. Its allowlisted fields are the outcome (`success` or `failure`), one coarse duration bucket (`under_1s`, `under_5s`, `under_30s`, or `30s_or_more`), and, only for failures, one stable error code (`unsupported_text`, `cancelled`, `invalid_document`, or `processing_failed`). The client never sends a PDF, bytes, filename, document or user ID, text, signature image, URL query/fragment, exception message, stack, or custom error fields.

Vercel Web Analytics is the reviewed transport. Its analytics documentation describes anonymous aggregate collection without cookies; the dashboard reporting window is plan-dependent (one month on Hobby, twelve months on Pro, and twenty-four months on Web Analytics Plus/Enterprise as of 2026-09-04). PDkef does not configure Analytics Drains, so these events have no additional destination. Reassess the provider, retention, sampling rate, event allowlist, and this disclosure before adding an event or changing a field.
