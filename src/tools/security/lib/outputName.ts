import { outputName } from '../../../lib/output/outputName.ts';

// One name for the Download button, the share sheet and the hand-off, so they cannot drift.
export const outputFileName = (name: string, mode: string) => outputName(name, { suffix: `_${mode}ed` });
