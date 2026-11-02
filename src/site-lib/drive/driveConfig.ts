// MERGE-25: the Drive app's public constants. The client id is public by design (it names the app, it
// is not a secret); `drive.file` limits access to the one file Drive hands over via "Open with".
export const DRIVE_CLIENT_ID = '527283937873-6j3jhv7m30g9imppfit7pl1bmmll2rug.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GSI_SRC = 'https://accounts.google.com/gsi/client';
