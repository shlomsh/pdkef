// What the main thread and the page worker say to each other (SCAN-21). Blobs cross by reference, so
// no pixels are copied between the two.
import type { ScanFilter } from '../filters.ts';
import type { Quad } from '../quad.ts';
import type { InspectedPhoto, ProcessedWithReport } from './steps.ts';

export type PageJob =
  | { kind: 'probe' }
  | { kind: 'inspect'; photo: Blob }
  | { kind: 'guess'; image: Blob }
  | { kind: 'process'; photo: Blob; quad: Quad; filter: ScanFilter };

/** What each job answers: the probe whether this worker can do the work as the main thread would. A
 * guess runs where the inspection does, so Auto-detect finds the corners a new photo was given. */
export type PageJobResult<J extends PageJob> = J extends { kind: 'probe' } ? boolean
  : J extends { kind: 'inspect' } ? InspectedPhoto
  : J extends { kind: 'guess' } ? Quad | null
  : ProcessedWithReport;

export interface PageRequest { id: number; job: PageJob }
export type PageReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: unknown };
