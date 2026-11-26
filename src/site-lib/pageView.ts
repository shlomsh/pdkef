/**
 * MEM-45: one `page_viewed` per load of a page that sends no tool view, to the analytics address only.
 * It carries the visit and since buckets; the capture adds the page's path.
 */
import { sendToSink } from '#lib/telemetry/analyticsSink.ts';
import { readAndStampVisits } from '#lib/telemetry/visitRecency.ts';

/** Never throws: both callees catch everything themselves (readAndStampVisits answers undefined without storage, sendToSink answers false). */
export function reportPageView(): void {
  sendToSink({ name: 'page_viewed', properties: { ...readAndStampVisits() } });
}
