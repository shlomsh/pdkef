/** A .jpg whose bytes are no image: reading it really fails, in Chromium and in Node alike. */
export const brokenPhoto = (name: string) => new File([new Uint8Array(500).fill(7)], name, { type: 'image/jpeg' });

/** A HEIC photo: not a type Scan takes, so a pick names it as skipped. */
export const heicPhoto = (name: string) => new File(['x'], name, { type: 'image/heic' });
