import type { DriveFileError, DriveTokenResult } from './types.ts';

export type DriveFailure = Extract<DriveTokenResult, { ok: false }>['error'] | DriveFileError;

const SIGN_IN = 'Google sign-in did not finish. You can try again.';
const REACH = 'Could not reach Google. Check the connection and try again, or download the file from Drive and drop it here.';

const MESSAGES: Record<DriveFailure, string> = {
  denied: SIGN_IN,
  blocked: SIGN_IN,
  script: REACH,
  network: REACH,
  unauthorized: "Google did not give PDkef access to this file. Try again from Drive's Open with menu.",
  'not-found': 'That file was not found in Drive.',
  'not-pdf': 'That file is not a PDF.',
};

export const driveMessage = (failure: DriveFailure): string => MESSAGES[failure];

/** Retrying helps when the cause was passing; a missing or non-PDF file will not change. */
export const canRetry = (failure: DriveFailure): boolean => failure !== 'not-found' && failure !== 'not-pdf';
