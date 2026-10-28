import { useEffect } from 'preact/hooks';
import { beaconMaintenanceTransport, reportMaintenanceEvent } from '../../../lib/telemetry/maintenanceTelemetry.ts';
import { formDetectionEvent } from '../lib/formDetectionEvent.ts';
import type { FormFieldRegions } from './useFormFieldRegions.ts';

// FORM-11: one anonymous maintenance event per document, when that walk
// finishes. Reported from the island rather than from inside useFormFieldRegions
// because the island already owns the boundary and its production-only
// transport (see runExport), and a detector that keeps working is better
// evidenced by an aggregate than by waiting for the next bug report - a
// total detection failure once shipped and nothing noticed
// (useFormFieldRegions.wiring.test.js).
//
// Every outcome but `pending` fires once, because `formRegions` is state and
// only changes when the walk starts over for a different file.
export function useFormDetectionTelemetry(formRegions: FormFieldRegions): void {
  useEffect(() => {
    const event = formDetectionEvent(formRegions);
    if (!event) return;
    reportMaintenanceEvent(event, beaconMaintenanceTransport);
  }, [formRegions]);
}
