import type { ComponentChildren } from 'preact';
import DoneStrip from '../../../shell/DoneStrip.tsx';
import { DoneHandoffs, DoneResult } from './RedactDone.tsx';
import type { FinishFacts } from '../lib/finishState.ts';

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
    <DoneStrip label="Your download" closeLabel="Close" onClose={onClose} data-redact-done-strip>
      <DoneResult facts={facts} live={false} />
      <DoneHandoffs fileSize={facts.fileSize} busy={handoffBusy} failed={handoffFailed} onHandoff={onHandoff} />
      {children}
    </DoneStrip>
  );
}
