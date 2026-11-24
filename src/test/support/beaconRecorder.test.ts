// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installBeaconRecorder, type BeaconRecorder } from './beaconRecorder.ts';

let recorder: BeaconRecorder | undefined;
afterEach(() => recorder?.restore());

describe('installBeaconRecorder', () => {
  it('records each beacon in call order with its url and a body that reads back as JSON', async () => {
    recorder = installBeaconRecorder();
    expect(navigator.sendBeacon('/a', new Blob([JSON.stringify({ n: 1 })], { type: 'application/json' }))).toBe(true);
    navigator.sendBeacon('https://e.example.test/b', new Blob([JSON.stringify({ n: 2 })], { type: 'text/plain' }));
    expect(recorder.urls()).toEqual(['/a', 'https://e.example.test/b']);
    expect(recorder.calls.map((call) => call.blob.type)).toEqual(['application/json', 'text/plain']);
    expect(await recorder.bodies()).toEqual([{ n: 1 }, { n: 2 }]);
  });
  it('answers false when told to, still recording the call', () => {
    recorder = installBeaconRecorder({ returns: false });
    expect(navigator.sendBeacon('/a', new Blob(['{}']))).toBe(false);
    expect(recorder.urls()).toEqual(['/a']);
  });
  it('removes itself on restore', () => {
    installBeaconRecorder().restore();
    expect('sendBeacon' in navigator).toBe(false);
  });
});
