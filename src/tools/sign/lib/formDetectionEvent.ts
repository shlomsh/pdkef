import type { MaintenanceEvent } from '../../../lib/maintenanceTelemetry.ts';
import {
  signFormDetectionCompleted,
  signFormDetectionFailed,
  signFormDetectionNotStarted,
  signFormDetectionUnavailable,
} from '../../../lib/maintenanceTelemetry.ts';
import type { FormFieldRegions } from '../hooks/useFormFieldRegions.ts';

/**
 * FORM-11: the one anonymous maintenance event for a finished detection walk,
 * or null while it is still `pending` (not an outcome, so it reports nothing).
 *
 * What travels: a bucketed count and the first page's kind (text, vector,
 * image or none, off a closed list), or an error code off a closed list. No
 * labels, no filename, no page count, no bytes - maintenanceTelemetry.ts is
 * the only thing that may describe an event and it cannot express them.
 */
export function formDetectionEvent(regions: FormFieldRegions): MaintenanceEvent | null {
  // Four outcomes, four signals. A run that never started, a detector
  // that never loaded (a stale cached shell after a deploy) and a
  // detector that ran and threw are the same blank editor, and want
  // three different fixes.
  switch (regions.detection) {
    case 'pending':
      return null;
    case 'not-started':
      return signFormDetectionNotStarted();
    case 'unavailable':
      return signFormDetectionUnavailable();
    case 'failed':
      return signFormDetectionFailed(regions.detectionError);
    default:
      return signFormDetectionCompleted(
        regions.combs.length + regions.cells.length + regions.checkboxes.length,
        regions.pageKind,
      );
  }
}
