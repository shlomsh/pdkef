import type { ComponentChildren } from 'preact';
import { X } from 'lucide-preact';
import { DoneHandoffs, DoneResult } from './RedactDone.tsx';
import styles from './RedactDoneStrip.module.css';
import type { FinishFacts } from './finishState.ts';

export interface RedactDoneStripProps {
  facts: FinishFacts;
  handoffBusy: boolean;
  handoffFailed: boolean;
  onHandoff(tool: 'compress' | 'sign'): void;
  onClose(): void;
  /** The rating row slot, rendered under the hand-offs. */
  children?: ComponentChildren;
}

/** The done state pinned under the toolbar: result, next tools, then feedback. */
export default function RedactDoneStrip({ facts, handoffBusy, handoffFailed, onHandoff, onClose, children }: RedactDoneStripProps) {
  return (
    <section class={styles.strip} aria-label="Your download" data-redact-done-strip>
      <button type="button" class={styles.close} aria-label="Close" onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
      <DoneResult facts={facts} live={false} />
      <DoneHandoffs fileSize={facts.fileSize} busy={handoffBusy} failed={handoffFailed} onHandoff={onHandoff} />
      {children}
    </section>
  );
}
