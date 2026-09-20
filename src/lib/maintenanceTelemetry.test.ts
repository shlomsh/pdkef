import { describe, expect, it, vi } from 'vitest';
import {
  signFormDetectionNotStarted,
  signFormDetectionUnavailable,
  classifyExportError,
  reportMaintenanceEvent,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsPath,
  signExportFailed,
  signExportSucceeded,
  signFormDetectionCompleted,
  signFormDetectionFailed,
} from './maintenanceTelemetry.ts';

const sensitiveValues = {
  filename: 'private-medical-record.pdf',
  typedText: 'my passport number is 123456789',
  signature: 'data:image/png;base64,secret-signature',
  documentId: 'document-abc-123',
  userId: 'user-abc-123',
  rawMessage: 'could not export private-medical-record.pdf',
};

describe('anonymous maintenance telemetry', () => {
  it('has a closed, aggregate-only export success payload', () => {
    const event = signExportSucceeded(1_001);

    expect(event).toEqual({
      name: 'sign_export',
      properties: { outcome: 'success', duration_bucket: 'under_5s' },
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.properties)).toBe(true);
    expect('error_code' in event.properties).toBe(false);
  });

  it('maps errors to stable codes without retaining sensitive exception data', () => {
    const error = Object.assign(new Error(sensitiveValues.rawMessage), sensitiveValues, {
      name: 'UnrepresentableTextError',
    });
    const serialized = JSON.stringify(signExportFailed(35_000, error));

    expect(classifyExportError(error)).toBe('unsupported_text');
    expect(serialized).toContain('unsupported_text');
    expect(signExportFailed(1, error).properties).toMatchObject({ error_code: 'unsupported_text' });
    for (const value of Object.values(sensitiveValues)) expect(serialized).not.toContain(value);
    expect(serialized).not.toContain('stack');
  });

  it('uses a generic code for unknown error names, including a name containing a filename', () => {
    const error = new Error(sensitiveValues.rawMessage);
    error.name = `PdfFailure:${sensitiveValues.filename}`;

    const serialized = JSON.stringify(signExportFailed(0, error));
    expect(serialized).toContain('processing_failed');
    expect(serialized).not.toContain(sensitiveValues.filename);
    expect(serialized).not.toContain(sensitiveValues.rawMessage);
  });

  // FORM-11. The signal that was missing: detection failing and detection
  // finding nothing were one indistinguishable silence, and a total failure
  // once shipped unnoticed. A bucket answers "does this come back empty in the
  // wild" without carrying a number specific enough to characterise anyone's
  // document.
  it('reports a detection result as a bucket and nothing else', () => {
    expect(signFormDetectionCompleted(0)).toEqual({
      name: 'sign_form_detection',
      properties: { outcome: 'success', field_count_bucket: 'none' },
    });
    expect(signFormDetectionCompleted(5).properties).toMatchObject({ field_count_bucket: 'one_to_five' });
    expect(signFormDetectionCompleted(7).properties).toMatchObject({ field_count_bucket: 'six_to_twenty' });
    expect(signFormDetectionCompleted(97).properties).toMatchObject({ field_count_bucket: 'over_twenty' });
    expect(signFormDetectionCompleted(Number.NaN).properties).toMatchObject({ field_count_bucket: 'none' });

    const event = signFormDetectionCompleted(7);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.properties)).toBe(true);
    expect(Object.keys(event.properties)).toEqual(['outcome', 'field_count_bucket']);
  });

  it('reports a detection failure as one code off the same closed list, never the error', () => {
    const error = Object.assign(new Error(sensitiveValues.rawMessage), sensitiveValues, {
      name: 'InvalidPDFException',
    });
    const serialized = JSON.stringify(signFormDetectionFailed(error));

    expect(serialized).toContain('invalid_document');
    for (const value of Object.values(sensitiveValues)) expect(serialized).not.toContain(value);
    expect(serialized).not.toContain('stack');
    expect(JSON.parse(serialized).properties).toEqual({ outcome: 'failure', error_code: 'invalid_document' });
    // A bug in our own code, which is what the incident behind this was.
    expect(signFormDetectionFailed(new TypeError('x is not a function')).properties)
      .toMatchObject({ error_code: 'processing_failed' });
    // No count on a failure: there is nothing to count, and a duration would
    // be a performance question this event is not asking.
    expect('field_count_bucket' in signFormDetectionFailed(error).properties).toBe(false);
    expect('duration_bucket' in signFormDetectionFailed(error).properties).toBe(false);
  });

  // Separate from every other failure on purpose: this one is a browser still
  // being served a shell from before a deploy, which turns a working detector
  // into a permanent "no fields in this PDF" and is the person's to clear, not
  // ours to fix in the detector.
  it('gives a detector that never loaded its own code, distinct from one that threw', () => {
    expect(signFormDetectionUnavailable()).toEqual({
      name: 'sign_form_detection',
      properties: { outcome: 'failure', error_code: 'modules_unavailable' },
    });
    expect(Object.isFrozen(signFormDetectionUnavailable().properties)).toBe(true);
    expect(signFormDetectionFailed(new TypeError('boom')).properties)
      .not.toEqual(signFormDetectionUnavailable().properties);
  });

  // The outcome with no exception behind it: the run never happened because
  // its inputs were not all there. Nothing throws, so a rate here is the only
  // way it is visible at all.
  it('gives a run that never started its own code too', () => {
    expect(signFormDetectionNotStarted()).toEqual({
      name: 'sign_form_detection',
      properties: { outcome: 'failure', error_code: 'not_started' },
    });
    const codes = [
      signFormDetectionNotStarted(),
      signFormDetectionUnavailable(),
      signFormDetectionFailed(new TypeError('boom')),
    ].map((event) => (event.properties as { error_code: string }).error_code);
    expect(new Set(codes).size).toBe(3);
  });

  it('does not invoke the transport while offline', () => {
    const transport = vi.fn();
    const originalOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    try {
      expect(reportMaintenanceEvent(signExportSucceeded(10), transport)).toBe(false);
      expect(transport).not.toHaveBeenCalled();
    } finally {
      if (originalOnline) Object.defineProperty(navigator, 'onLine', originalOnline);
    }
  });

  it('never lets a failed transport affect the calling flow', () => {
    expect(reportMaintenanceEvent(signExportSucceeded(10), () => { throw new Error('offline'); })).toBe(false);
  });

  it('reports every approved event without creating a visitor or document identifier', () => {
    const transport = vi.fn();
    const originalOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    try {
      expect(reportMaintenanceEvent(signExportSucceeded(10), transport)).toBe(true);
      expect(reportMaintenanceEvent(signExportSucceeded(10), transport)).toBe(true);
      expect(transport).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(transport.mock.calls)).not.toContain('document');
    } finally {
      if (originalOnline) Object.defineProperty(navigator, 'onLine', originalOnline);
    }
  });

  it('removes query strings and fragments while preserving the absolute URL Vercel requires', () => {
    expect(sanitizeAnalyticsPath('https://pdkef.com/sign/?file=private.pdf#signature')).toBe('/sign/');
    expect(sanitizeAnalyticsPath('javascript:private-medical-record.pdf')).toBe('/');
    expect(sanitizeAnalyticsEvent({ type: 'pageview', url: 'https://pdkef.com/sign/?document=abc#signature' })).toEqual({
      type: 'pageview',
      url: 'https://pdkef.com/sign/',
    });
    expect(sanitizeAnalyticsEvent({ type: 'pageview', url: 'javascript:private-medical-record.pdf' })).toEqual({
      type: 'pageview',
      url: 'https://pdkef.com/',
    });
  });
});
