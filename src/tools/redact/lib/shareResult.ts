import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { englishRedactMessages as t } from '../messages.ts';

/** What the share sheet answered, said to the person. */
export function announceShareResult(result: { status: string; error?: unknown }, setAnnouncement: (text: string) => void) {
  if (result.status === 'shared') {
    setAnnouncement(t.shared);
    recordAction('share');
  } else if (result.status === 'canceled') {
    setAnnouncement(t.shareCanceled);
  } else if (result.status === 'error') {
    console.error(result.error);
    setAnnouncement(t.shareError);
  }
}
