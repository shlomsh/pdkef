/**
 * A real File whose bytes can be held back: every read through arrayBuffer() waits while the file is
 * held. Construct it held to hold a read that happens at once (an encryption probe, an analysis); to
 * hold a read that happens later (a running build), load the file, wait until it is ready, then hold().
 */
export class HeldFile extends File {
  private gate = Promise.withResolvers<void>();
  private seen = Promise.withResolvers<void>();
  private isHeld: boolean;

  constructor(bytes: Uint8Array<ArrayBuffer>, name: string, { held = true }: { held?: boolean } = {}) {
    super([bytes], name, { type: 'application/pdf' });
    this.isHeld = held;
  }

  /** Resolves once a read is waiting on the hold; hold() renews it. */
  get started(): Promise<void> { return this.seen.promise; }

  hold(): void {
    if (this.isHeld) return;
    this.isHeld = true;
    this.gate = Promise.withResolvers<void>();
    this.seen = Promise.withResolvers<void>();
  }

  release(): void {
    this.isHeld = false;
    this.gate.resolve();
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.isHeld) {
      this.seen.resolve();
      await this.gate.promise;
    }
    return super.arrayBuffer();
  }
}
