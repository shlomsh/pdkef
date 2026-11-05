// MERGE-25: the Drive app's public constants. The client id is public by design (it names the app, it
// is not a secret); `drive.file` limits access to the one file Drive hands over via "Open with".
export const DRIVE_CLIENT_ID = '527283937873-6j3jhv7m30g9imppfit7pl1bmmll2rug.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GSI_SRC = 'https://accounts.google.com/gsi/client';

// DRIVE-01: the Picker's developer key and app id are public by design (the key is restricted by
// referrer in Google Cloud); the Picker library comes from the same Google script host as its frame.
export const DRIVE_PICKER_KEY = 'AIzaSyArlQGL_zijyJ1Zga9v2kTt_aZNVA3TKOU';
export const DRIVE_APP_ID = '527283937873';
export const PICKER_SRC = 'https://apis.google.com/js/api.js';
