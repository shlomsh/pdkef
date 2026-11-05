import { parseDriveState } from './driveState.ts';
import type { DriveIntent } from './types.ts';

/** Where /drive/ parks a picked file for the home page, which takes it as if it had been dropped there. */
export const DRIVE_HOME_HANDOFF = 'drive-home';

const TOOL = /^[a-z0-9-]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Only a same-origin path survives: one leading slash, no `//`, no backslash, no scheme, no control characters.
 * @testSeam
 */
export function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (raw.includes('\\') || CONTROL.test(raw)) return '/';
  return raw;
}

/** The link a tool's "Open from Drive" button points at. */
export function driveOpenHref(options: { returnTo: string; tool?: string }): string {
  const tool = options.tool ? `&tool=${encodeURIComponent(options.tool)}` : '';
  return `/drive/?pick=1&return=${encodeURIComponent(options.returnTo)}${tool}`;
}

/** What a visit to /drive/ is for. Pure: never throws, never touches the DOM. */
export function parseDriveIntent(search: string): DriveIntent {
  const params = new URLSearchParams(search);
  const save = params.get('save');
  if (save !== null && TOOL.test(save)) return { kind: 'save', id: save };
  if (params.get('pick') === '1') {
    const tool = params.get('tool');
    return { kind: 'pick', tool: tool !== null && TOOL.test(tool) ? tool : null, returnTo: safeReturnPath(params.get('return')) };
  }
  const state = parseDriveState(search);
  if (!state.ok) return { kind: 'none' };
  return state.resourceKey === undefined
    ? { kind: 'open-with', fileId: state.fileId }
    : { kind: 'open-with', fileId: state.fileId, resourceKey: state.resourceKey };
}
