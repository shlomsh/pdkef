import type { Dispatch, StateUpdater } from 'preact/hooks';
import type { reduceScan } from '../state/scanState.ts';
import type { ScanPage } from '../state/scanWork.ts';

/** What the island's hooks and actions share: the lifecycle dispatch and the pages setter. */
export type ScanDispatch = (event: Parameters<typeof reduceScan>[1]) => void;
export type SetPages = Dispatch<StateUpdater<ScanPage[]>>;
