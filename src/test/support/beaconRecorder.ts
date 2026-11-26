export interface RecordedBeacon {
  url: string;
  blob: Blob;
}

export interface BeaconRecorder {
  calls: RecordedBeacon[];
  urls(): string[];
  bodies(): Promise<unknown[]>;
  /** Resolves when the next beacon is sent. */
  next(): Promise<void>;
  restore(): void;
}

const NONE = Symbol('absent');

export function installBeaconRecorder({ returns = true }: { returns?: boolean } = {}): BeaconRecorder {
  const calls: RecordedBeacon[] = [];
  let sent = Promise.withResolvers<void>();
  const previous = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon') ?? NONE;
  // forced: jsdom has no sendBeacon.
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    writable: true,
    value: (url: string | URL, data?: BodyInit | null): boolean => {
      calls.push({ url: String(url), blob: data as Blob });
      sent.resolve();
      sent = Promise.withResolvers<void>();
      return returns;
    },
  });
  return {
    calls,
    urls: () => calls.map((call) => call.url),
    bodies: () => Promise.all(calls.map(async (call) => JSON.parse(await call.blob.text()) as unknown)),
    next: () => sent.promise,
    restore() {
      if (previous === NONE) Reflect.deleteProperty(navigator, 'sendBeacon');
      else Object.defineProperty(navigator, 'sendBeacon', previous);
    },
  };
}
