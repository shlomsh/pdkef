import { describe, expect, it, vi } from 'vitest';
import {
  classifyExportError,
  reportMaintenanceEvent,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsPath,
  signExportFailed,
  signExportSucceeded,
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

  it('removes query strings, fragments, and origins from analytics paths', () => {
    expect(sanitizeAnalyticsPath('https://pdkef.com/sign/?file=private.pdf#signature')).toBe('/sign/');
    expect(sanitizeAnalyticsPath('javascript:private-medical-record.pdf')).toBe('/');
    expect(sanitizeAnalyticsEvent({ type: 'pageview', url: '/sign/?document=abc' })).toEqual({
      type: 'pageview',
      url: '/sign/',
    });
  });
});
