/**
 * MEM-45: one `page_viewed` per load of a page that sends no tool view, to the analytics address only.
 * It carries the visit and since buckets; the capture adds the page's path.
 */
import { sendToSink } from '#lib/telemetry/analyticsSink.ts';
import { readAndStampVisits } from '#lib/telemetry/visitRecency.ts';

export function reportPageView(): void {
  try {
    sendToSink({ name: 'page_viewed', properties: { ...readAndStampVisits() } });
  } catch {
    // expected: telemetry never throws and never blocks a page
  }
}
