import { PHOTO_ACCEPTED_TYPES } from '#lib/hooks/usePhotoTileList.ts';

export const PDF_TYPE = 'application/pdf';
/** What Scan's pick and drop take: photos, and a PDF whose sheets become pages. The camera inputs stay photos. */
export const SCAN_ACCEPTED_TYPES = [...PHOTO_ACCEPTED_TYPES, PDF_TYPE];
export const SCAN_ACCEPT = SCAN_ACCEPTED_TYPES.join(',');
