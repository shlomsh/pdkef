import { withAffixes } from '../../../lib/outputName.ts';

/** The name a signed copy is saved under: `signed_<the source's own name>`. */
export const signedFileName = (sourceName: string) => withAffixes(sourceName, { prefix: 'signed_', ext: null });
