/**
 * A real File whose bytes can be held back: every read through arrayBuffer() waits while the file is
 * held. Construct it held to hold a read that happens at once (an encryption probe, an analysis); to
 * hold a read that happens later (a running build), load the file, wait until it is ready, then hold(). To hold a
 * later read that follows reads started at once (a probe and an analysis at pick, then the build), pass `passReads`:
 * that many reads go through, and the one after them is held.
 */
export class HeldFile extends File {
  private gate = Promise.withResolvers<void>();
  private seen = Promise.withResolvers<void>();
  private isHeld: boolean;
  private passLeft: number;

  constructor(bytes: Uint8Array<ArrayBuffer>, name: string, { held = true, passReads = 0 }: { held?: boolean; passReads?: number } = {}) {
    super([bytes], name, { type: 'application/pdf' });
    this.passLeft = passReads;
    this.isHeld = held && passReads === 0;
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
    if (this.passLeft > 0) {
      this.passLeft -= 1;
      if (this.passLeft === 0) this.hold();
      return super.arrayBuffer();
    }
    if (this.isHeld) {
      this.seen.resolve();
      await this.gate.promise;
    }
    return super.arrayBuffer();
  }
}
