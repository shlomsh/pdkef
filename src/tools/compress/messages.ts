import type { DocumentationLocaleId } from '../../i18n/documentationLocales';

export interface CompressMessages {
  /** Text direction; a size inside a sentence is bidi-isolated when 'rtl'. */
  dir: 'ltr' | 'rtl';
  skippedOne: string;
  skippedMany: string;
  levelHighDesc: string;
  levelMediumDesc: string;
  levelLowDesc: string;
  targetDesc: string;
  targetSizeLabel: string;
  levelPickerLabel: string;
  levelHighShort: string;
  levelMediumShort: string;
  levelLowShort: string;
  targetShort: string;
  percentSmaller: string;
  stripShareNote: string;
  stripShareLowNote: string;
  compressing: string;
  dropHint: string;
  compressionFailedTitle: string;
  compressionFailedBody: string;
  tryAgain: string;
  originalSize: string;
  spaceSaved: string;
  savedPercent: string;
  closestAchievable: string;
  rasterizeNotice: string;
  downloadLabel: string;
  shareLabel: string;
  loaded: string;
  starting: string;
  complete: string;
  failed: string;
  sharedSuccessfully: string;
  sharingCanceled: string;
  shareError: string;
  /* One island now accepts a PDF, JPEG or PNG (the board-epic-cleanup merge
   * of the standalone Compress Image tool into this one) and dispatches by
   * file type at runtime, so its message catalogue carries both flavours.
   * Every key below this line is the image half - added where a PDF and an
   * image result need genuinely different wording (a title, a failure
   * reason, a unit of work); a key above this line already reads correctly
   * for either kind (sizes, "compressing…", the shared shell strings) and is
   * not duplicated. See PdfCompressTool.tsx's `kind` dispatch. */
  imageCompressionFailedBody: string;
  originalDimensions: string;
  outputDimensions: string;
  imageClosestAchievable: string;
  formatNotice: string;
  passthroughNotice: string;
  /** A PDF that re-rendering would only make bigger: handed back untouched. */
  alreadySmallTitle: string;
  /** The image path could not open the PDF without its password. */
  lockedTitle: string;
  unsupportedTitle: string;
  underTargetTitle: string;
  imageUnderTargetTitle: string;
  alreadySmallNotice: string;
  alreadySmallTargetNotice: string;
  noImagesTitle: string;
  lessThanOnePercent: string;
  asImagesSize: string;
  keptOriginal: string;
  alreadySmallComplete: string;
  flattenLabel: string;
  flattenHint: string;
  /** The same switch on a PDF with no text: only the softening applies. */
  flattenHintNoText: string;
  slightGainTitle: string;
  slightGainCompactNotice: string;
  slightGainExtremeHint: string;
  slightGainKeptNotice: string;
  imagesTargetMissedNotice: string;
  imagesNoImagesNotice: string;
  imagesNoGainNotice: string;
  imagesUnsupportedNotice: string;
  imagesEncryptedNotice: string;
  imageDownloadLabel: string;
  imageShareLabel: string;
  imageLoaded: string;
  imageStarting: string;
  imageComplete: string;
  missedTarget: string;
  imageFailed: string;
  imageSharedSuccessfully: string;
  imageSharingCanceled: string;
  /* Button anchor (SEO-25, 2026-09-12): DownloadButton's second line and the
   * compare toggle's two states. Shared by the PDF and image halves alike -
   * both compute the same shape of detail line and use the same toggle. */
  downloadDetailClosest: string;
  compareRendering: string;
  compareRenderFailed: string;
  compareFullscreenLabel: string;
  compareCloseLabel: string;
  compareBeforeLabel: string;
  compareAfterLabel: string;
  compareCaptionImage: string;
  compareCaptionPdf: string;
  compareCaptionPdfSingle: string;
  /** ENC-08: the protected-file state (src/shell/NeedsUnlock.tsx), shown for a PDF that needs a password. */
  protectedNeedsPasswordTitle: string;
  protectedNeedsPasswordBody: string;
  protectedUnlockIt: string;
  protectedHandoffFailed: string;
}

export const englishCompressMessages: CompressMessages = {
  dir: 'ltr',
  skippedOne: 'Skipped "{name}" - not a PDF, JPG or PNG.',
  skippedMany: 'Skipped {count} files - not PDF, JPG or PNG files.',
  levelHighDesc: 'The smallest file. Photos and scans are scaled down the most.',
  levelMediumDesc: 'A good balance of size and clarity for most documents.',
  levelLowDesc: 'A lighter touch. Images stay close to the original.',
  targetDesc: 'Compress down to a specific file size, e.g. for a 100KB upload limit.',
  targetSizeLabel: 'Target size',
  levelPickerLabel: 'How small',
  levelHighShort: 'Smallest',
  levelMediumShort: 'Balanced',
  levelLowShort: 'Sharpest',
  targetShort: 'Exact size',
  percentSmaller: '{percent}% smaller',
  stripShareNote: 'Images are {share} of this PDF, the part that gets smaller.',
  stripShareLowNote: 'Most of this PDF is text. Images are {share} of it.',
  compressing: 'Compressing…',
  dropHint: 'Drop a PDF or image here',
  compressionFailedTitle: 'Compression failed.',
  tryAgain: 'Try again',
  compressionFailedBody: 'The file may be password-protected or corrupted. Please try another PDF.',
  originalSize: 'Original Size',
  spaceSaved: 'Space Saved',
  savedPercent: 'Saved {percent}%',
  closestAchievable: "Closest achievable size: {size} couldn't be reached without making the document unreadable, so this is the smallest readable result.",
  rasterizeNotice: 'Notice: Compression rasterizes PDF pages into images to reduce file size. Embedded links and text selection/copying will be disabled on the compressed document.',
  downloadLabel: 'Download Compressed PDF',
  shareLabel: 'Share Compressed PDF',
  loaded: 'File "{name}" loaded.',
  starting: 'Starting PDF compression...',
  complete: 'PDF compression complete. Your file is ready.',
  failed: 'PDF compression failed.',
  sharedSuccessfully: 'Compressed PDF shared successfully.',
  sharingCanceled: 'Sharing canceled. Your compressed PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  imageCompressionFailedBody: 'The file may be corrupted or an unsupported image. Please try another JPG or PNG.',
  originalDimensions: 'Original Dimensions',
  outputDimensions: 'Output Dimensions',
  imageClosestAchievable: "Closest achievable size: {size} couldn't be reached on this photo without making it unusable, so this is the smallest result found.",
  formatNotice: 'Notice: once compressed, the output is a JPEG. A transparent PNG background is filled in white, and re-encoding drops EXIF metadata, including location. A screenshot or scan of text can show visible JPEG artefacts, especially at a small target.',
  passthroughNotice: 'Already under the target, so the file is untouched: same file, same format, nothing re-encoded.',
  alreadySmallTitle: 'Already as small as it gets',
  lockedTitle: 'This PDF is locked',
  unsupportedTitle: 'Left as it was',
  underTargetTitle: 'Already under your target',
  imageUnderTargetTitle: 'Already under your target',
  alreadySmallNotice: "Turned into images, this PDF came to {raster}, more than the {original} it is now, so there was nothing to gain. I've kept your original as it is, text and links included.",
  alreadySmallTargetNotice: "Turned into images, this PDF came to {raster}, more than the {original} it is now, so {target} can't be reached this way. I've kept your original as it is, text and links included.",
  noImagesTitle: 'Nothing here to shrink.',
  lessThanOnePercent: 'less than 1%',
  asImagesSize: 'As images',
  keptOriginal: 'None, original kept',
  alreadySmallComplete: 'This PDF is already as small as it gets, so it is unchanged.',
  flattenLabel: 'Turn pages into pictures',
  flattenHint: 'The smallest size for scans. Text stops being selectable, links stop working, and small text gets softer.',
  flattenHintNoText: 'The smallest size for scans. Small detail gets softer.',
  slightGainTitle: 'Only a little smaller',
  slightGainCompactNotice: 'The images in this PDF were already compact, so making them smaller saved {saving}.',
  slightGainExtremeHint: '"Smallest" can go further, and photos look soft when zoomed in.',
  slightGainKeptNotice: "Most of the image data in this PDF is stored in a way I can't recompress, so it stayed as it was and this saved {saving}. Turning the pages into pictures, with the switch above, can go smaller.",
  imagesTargetMissedNotice: 'Shrinking the images got this PDF to {size}, above your {target} target. Turning the pages into pictures, with the switch above, can go smaller.',
  imagesNoImagesNotice: 'There are no images in this PDF, so there was nothing to make smaller. Your original is unchanged.',
  imagesNoGainNotice: 'The images in this PDF are already compact, so making them smaller saved nothing. Your original is unchanged.',
  imagesUnsupportedNotice: "The images in this PDF are stored in a way I can't recompress, so nothing was changed. Turning the pages into pictures still works, with the switch above.",
  imagesEncryptedNotice: "This PDF is locked, so its images can't be recompressed here. Your original is unchanged. If you have its password, unlock it first, then compress it.",
  imageDownloadLabel: 'Download Compressed Image',
  imageShareLabel: 'Share Compressed Image',
  imageLoaded: 'File "{name}" loaded.',
  imageStarting: 'Starting image compression...',
  imageComplete: 'Image compression complete. Your file is ready.',
  missedTarget: 'Target missed. Showing the smallest result found instead.',
  imageFailed: 'Image compression failed.',
  imageSharedSuccessfully: 'Compressed image shared successfully.',
  imageSharingCanceled: 'Sharing canceled. Your compressed image is still ready.',
  downloadDetailClosest: 'closest achievable: {size}',
  compareRendering: 'Rendering page 1 for comparison…',
  compareRenderFailed: "Couldn't render a preview for this file.",
  compareFullscreenLabel: 'Full screen',
  compareCloseLabel: 'Close',
  compareBeforeLabel: 'Original',
  compareAfterLabel: 'Compressed',
  compareCaptionImage: 'Drag to compare the original and the compressed image.',
  compareCaptionPdf: 'Drag to compare page 1 with the original.',
  compareCaptionPdfSingle: 'Drag to compare the original and the compressed page.',
  protectedNeedsPasswordTitle: 'This PDF has a password',
  protectedNeedsPasswordBody: 'Unlock opens it on your device, then you can compress it.',
  protectedUnlockIt: 'Unlock it',
  protectedHandoffFailed: "Couldn't open Unlock with this file. Open Unlock and choose it there.",
};

// LOC-03: not yet reviewed by a native speaker in-house (see LOC-03.md's
// acceptance list, "the island message catalogues for Compress and Merge
// reviewed in the same pass") - pairs with he/compress.yaml's own draft
// status. Terminology follows the same SERP-derived vocabulary as that file
// ("כיווץ" as the lead term, "PDF" and file-size units left in Latin script,
// matching every incumbent on the Hebrew SERPs).
export const hebrewCompressMessages: CompressMessages = {
  dir: 'rtl',
  skippedOne: 'דילגנו על "{name}" - זה לא קובץ PDF, JPG או PNG.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא קבצי PDF, JPG או PNG.',
  levelHighDesc: 'הקובץ הקטן ביותר. תמונות וסריקות מוקטנות הכי הרבה.',
  levelMediumDesc: 'איזון טוב בין גודל לחדות ברוב המסמכים.',
  levelLowDesc: 'נגיעה עדינה. התמונות נשארות קרובות למקור.',
  targetDesc: 'כווצו לגודל קובץ מסוים, למשל למגבלת העלאה של 100KB.',
  targetSizeLabel: 'גודל בהתאמה אישית',
  levelPickerLabel: 'כמה לכווץ',
  levelHighShort: 'הכי קטן',
  levelMediumShort: 'מאוזן',
  levelLowShort: 'הכי חד',
  targetShort: 'גודל מדויק',
  percentSmaller: 'קטן ב-{percent}%',
  stripShareNote: 'התמונות הן {share} מה-PDF הזה, החלק שקטן.',
  stripShareLowNote: 'רוב ה-PDF הזה הוא טקסט. התמונות הן {share} ממנו.',
  compressing: 'מכווצים…',
  dropHint: 'גררו לכאן PDF או תמונה',
  compressionFailedTitle: 'הכיווץ נכשל.',
  tryAgain: 'לנסות שוב',
  compressionFailedBody: 'ייתכן שהקובץ מוגן בסיסמה או פגום. נסו קובץ PDF אחר.',
  originalSize: 'גודל מקורי',
  spaceSaved: 'נחסך',
  savedPercent: 'נחסכו {percent}%',
  closestAchievable: 'הגודל הקרוב ביותר שהושג: לא הצלחנו להגיע ל-{size} בלי להפוך את המסמך לבלתי קריא, אז זו התוצאה הקריאה הכי קטנה.',
  rasterizeNotice: 'שימו לב: הכיווץ הופך את עמודי ה-PDF לתמונות כדי להקטין את גודל הקובץ. קישורים מוטבעים וחיפוש/העתקת טקסט יהיו מושבתים במסמך המכווץ.',
  downloadLabel: 'הורדת PDF מכווץ',
  shareLabel: 'שיתוף PDF מכווץ',
  loaded: 'הקובץ "{name}" נטען.',
  starting: 'מתחילים בכיווץ ה-PDF...',
  complete: 'כיווץ ה-PDF הושלם. הקובץ שלכם מוכן.',
  failed: 'כיווץ ה-PDF נכשל.',
  sharedSuccessfully: 'ה-PDF המכווץ שותף.',
  sharingCanceled: 'השיתוף בוטל. ה-PDF המכווץ עדיין מוכן.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  imageCompressionFailedBody: 'ייתכן שהקובץ פגום או שזה סוג תמונה לא נתמך. נסו קובץ JPG או PNG אחר.',
  originalDimensions: 'מידות מקוריות',
  outputDimensions: 'מידות לאחר כיווץ',
  imageClosestAchievable: 'הגודל הקרוב ביותר שהושג: לא הצלחנו להגיע ל-{size} בתמונה הזו בלי להפוך אותה לבלתי שמישה, אז זו התוצאה הקטנה ביותר שנמצאה.',
  formatNotice: 'שימו לב: לאחר הכיווץ הפלט הוא JPEG. רקע שקוף בקובץ PNG יתמלא בלבן, וקידוד מחדש מוחק נתוני EXIF, כולל מיקום. צילום מסך או סריקה של טקסט עלולים להראות עיוותי JPEG גלויים, בעיקר בגודל יעד קטן.',
  passthroughNotice: 'הקובץ כבר קטן מהיעד, אז השארנו אותו כמו שהוא: אותו קובץ, אותו פורמט, בלי קידוד מחדש.',
  alreadySmallTitle: 'הקובץ כבר קטן ככל האפשר',
  lockedTitle: 'ה-PDF הזה נעול',
  unsupportedTitle: 'הקובץ נשאר כמו שהוא',
  underTargetTitle: 'כבר מתחת ליעד שלכם',
  imageUnderTargetTitle: 'כבר מתחת ליעד שלכם',
  alreadySmallNotice: 'כשהפכנו את העמודים לתמונות, ה-PDF יצא {raster}, יותר מה-{original} שלו עכשיו, אז לא היה מה להרוויח. השארנו את הקובץ המקורי כמו שהוא, כולל טקסט וקישורים.',
  alreadySmallTargetNotice: 'כשהפכנו את העמודים לתמונות, ה-PDF יצא {raster}, יותר מה-{original} שלו עכשיו, אז אי אפשר להגיע ל-{target} בדרך הזו. השארנו את הקובץ המקורי כמו שהוא, כולל טקסט וקישורים.',
  noImagesTitle: 'אין כאן מה לכווץ.',
  lessThanOnePercent: 'פחות מ-1%',
  asImagesSize: 'כתמונות',
  keptOriginal: 'אין, המקור נשמר',
  alreadySmallComplete: 'ה-PDF הזה כבר קטן ככל האפשר, אז הוא נשאר ללא שינוי.',
  flattenLabel: 'להפוך עמודים לתמונות',
  flattenHint: 'הגודל הקטן ביותר לסריקות. אי אפשר יהיה לסמן טקסט, קישורים יפסיקו לעבוד, וטקסט קטן ייראה פחות חד.',
  flattenHintNoText: 'הגודל הקטן ביותר לסריקות. פרטים קטנים ייראו פחות חדים.',
  slightGainTitle: 'קטן רק במעט',
  slightGainCompactNotice: 'התמונות ב-PDF הזה כבר היו קומפקטיות, אז הקטנה שלהן חסכה {saving}.',
  slightGainExtremeHint: '"הכי קטן" יכול להקטין עוד, ותמונות נראות מטושטשות בהגדלה.',
  slightGainKeptNotice: 'רוב נתוני התמונה ב-PDF הזה שמורים בצורה שאנחנו לא יכולים לדחוס מחדש, אז הם נשארו כמו שהיו וזה חסך {saving}. הפיכת העמודים לתמונות, עם המתג למעלה, יכולה להקטין עוד.',
  imagesTargetMissedNotice: 'הקטנת התמונות הביאה את ה-PDF ל-{size}, מעל היעד של {target}. הפיכת העמודים לתמונות, עם המתג למעלה, יכולה להקטין עוד.',
  imagesNoImagesNotice: 'אין תמונות ב-PDF הזה, אז לא היה מה להקטין. הקובץ המקורי לא השתנה.',
  imagesNoGainNotice: 'התמונות ב-PDF הזה כבר קומפקטיות, אז הקטנה שלהן לא חסכה כלום. הקובץ המקורי לא השתנה.',
  imagesUnsupportedNotice: 'התמונות ב-PDF הזה שמורות בצורה שאנחנו לא יכולים לדחוס מחדש, אז שום דבר לא השתנה. אפשר עדיין להפוך את העמודים לתמונות, עם המתג למעלה.',
  imagesEncryptedNotice: 'ה-PDF הזה נעול, ולכן אי אפשר לדחוס כאן את התמונות שבו. הקובץ המקורי לא השתנה. אם יש לכם את הסיסמה, בטלו קודם את הנעילה ואז כווצו אותו.',
  imageDownloadLabel: 'הורדת תמונה מכווצת',
  imageShareLabel: 'שיתוף תמונה מכווצת',
  imageLoaded: 'הקובץ "{name}" נטען.',
  imageStarting: 'מתחילים בכיווץ התמונה...',
  imageComplete: 'כיווץ התמונה הושלם. הקובץ שלכם מוכן.',
  missedTarget: 'לא הגענו ליעד. מוצגת התוצאה הקטנה ביותר שנמצאה.',
  imageFailed: 'כיווץ התמונה נכשל.',
  imageSharedSuccessfully: 'התמונה המכווצת שותפה.',
  imageSharingCanceled: 'השיתוף בוטל. התמונה המכווצת עדיין מוכנה.',
  downloadDetailClosest: 'הגודל הקרוב ביותר: {size}',
  compareRendering: 'מעבדים את עמוד 1 להשוואה…',
  compareRenderFailed: 'לא הצלחנו להציג תצוגה מקדימה לקובץ הזה.',
  compareFullscreenLabel: 'מסך מלא',
  compareCloseLabel: 'סגירה',
  compareBeforeLabel: 'מקור',
  compareAfterLabel: 'מכווץ',
  compareCaptionImage: 'גררו כדי להשוות בין התמונה המקורית לתמונה המכווצת.',
  compareCaptionPdf: 'גררו כדי להשוות את עמוד 1 למקור.',
  compareCaptionPdfSingle: 'גררו כדי להשוות בין העמוד המקורי לעמוד המכווץ.',
  protectedNeedsPasswordTitle: 'לקובץ ה-PDF הזה יש סיסמה',
  protectedNeedsPasswordBody: 'הסרת הנעילה פותחת אותו במכשיר שלכם, ואז אפשר לכווץ אותו.',
  protectedUnlockIt: 'הסרת נעילה',
  protectedHandoffFailed: 'לא הצלחנו לפתוח את הקובץ בכלי הסרת הנעילה. פתחו את הכלי ובחרו אותו שם.',
};

const compressMessages: Partial<Record<DocumentationLocaleId, CompressMessages>> = {
  en: englishCompressMessages,
  he: hebrewCompressMessages,
};

export function getCompressMessages(locale: DocumentationLocaleId): CompressMessages {
  return compressMessages[locale] ?? englishCompressMessages;
}
