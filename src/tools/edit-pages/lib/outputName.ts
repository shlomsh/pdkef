import { outputName } from '../../../lib/output/outputName.ts';

/** The default heading (and file name without ".pdf") of an edited copy: `<name>_modified`. */
export const modifiedTitle = (sourceName: string) => outputName(sourceName, { suffix: '_modified', ext: null });
