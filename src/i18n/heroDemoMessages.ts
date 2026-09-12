/**
 * LOC-16 item 1: message catalogue for HeroDemo.astro, the home page's
 * scroll-driven Sign/Redact story. Mirrors toolMessages.ts's shape (a typed
 * English-default object per locale, in one file the reviewer pass touches)
 * rather than forking HeroDemo.astro per locale - docs/home-page-
 * localization-plan.md section 5.5: strings get extracted to a typed object,
 * default to English, get validated by a build-time check (this file's own
 * test, mirroring toolMessages.test.ts), and never fork the .astro file
 * itself. HeroDemo.astro is plain static Astro markup with zero client JS of
 * its own (ScrollDriver is the only island on the page), so this catalogue
 * ships no JavaScript to the browser either - it is read at build time only.
 *
 * Every user-visible or assistive string HeroDemo.astro renders lives here,
 * grouped by which of the demo's two stories it belongs to (`sign...` /
 * `blur...`), except: the "9:41" status-bar clock and the "PDF" tag glyph
 * inside the phone mockup, both left as literals in HeroDemo.astro because
 * they read as universal chrome, not story content (the same call the
 * section's own aria-label narrative and the design doc draw for that mock
 * phone). `signCaption`/`blurCaption`/`scrollHint` keep the nested shape they
 * already had as inline ternaries in HeroDemo.astro's frontmatter (moved
 * here unchanged, values untouched) rather than being flattened like every
 * other key.
 *
 * `getHeroDemoMessages` returns English for any locale but 'he', with the
 * Hebrew object spread under `{ ...english, ...hebrew }` first, so a key
 * missing from a future partial Hebrew edit can never render empty.
 */

export interface HeroDemoCaption {
  before: string;
  marker: string;
  after: string;
  line2: string;
}

export interface HeroDemoScrollHint {
  line1: string;
  line2: string;
}

export interface HeroDemoMessages {
  /** The section's own aria-label. */
  ariaLabel: string;
  /** sr-only narration for the sign story's track. */
  signSrOnly: string;
  /** sr-only narration for the blur story's track. */
  blurSrOnly: string;
  signCaption: HeroDemoCaption;
  blurCaption: HeroDemoCaption;
  scrollHint: HeroDemoScrollHint;

  // --- Sign story (field trip permission slip) ---------------------------
  signChatHead: string;
  signChatMessage: string;
  /** Reused for the chat file bubble, the form panel head, and the share
   * sheet's file row - all three name the same file. */
  signFileName: string;
  signFileSize: string;
  /** The chat bubble's "Sent" status once the signed file goes out. */
  signSentLabel: string;
  signFormHeading: string;
  signTripSentence: string;
  signFieldStudentLabel: string;
  signFieldStudentValue: string;
  signFieldParentLabel: string;
  signFieldParentValue: string;
  signFieldEmergencyLabel: string;
  signFieldEmergencyValue: string;
  signFieldAllergiesLabel: string;
  signFieldAllergiesValue: string;
  signCheckAttendLabel: string;
  signCheckPhotoLabel: string;
  signConfirmLine: string;
  signSigLabel: string;
  signDateLabel: string;
  signDateValue: string;
  signToolChipText: string;
  signToolChipSymbols: string;
  signToolChipSign: string;
  signToolChipShare: string;
  /** The share sheet's file row, once signed. */
  signFileSizeSigned: string;
  signShareMessages: string;
  signShareMail: string;
  signShareMore: string;

  // --- Blur story (utility bill) ------------------------------------------
  blurMailHead: string;
  blurEmailFromUnread: string;
  blurEmailTimeUnread: string;
  blurEmailSubjectUnread: string;
  blurEmailPreviewUnread: string;
  /** Two-letter avatar monograms, matching `blurEmailFromUnread` /
   * `blurEmailFromMuted` in each locale. */
  blurAvatarFrontDesk: string;
  blurAvatarTeam: string;
  blurEmailFromMuted: string;
  blurEmailTimeMuted: string;
  blurEmailSubjectMuted: string;
  /** Reused for the bill panel head and the reply's attachment chip. */
  blurBillFileName: string;
  blurToolChipBlur: string;
  blurToolChipBlackout: string;
  blurToolChipWhiteout: string;
  blurToolChipDelete: string;
  blurBillAccountHolderLabel: string;
  blurBillAccountHolderValue: string;
  blurBillServiceAddressLabel: string;
  blurBillServiceAddressValue: string;
  blurBillPeriodLabel: string;
  blurBillPeriodValue: string;
  blurBillCustomerIdLabel: string;
  /** Blurred in the mockup - kept as the same digits in every locale so the
   * blur effect still reads as hiding real-looking digits. */
  blurBillCustomerIdValue: string;
  blurBillAccountNoLabel: string;
  /** Blacked out in the mockup - same reasoning as `blurBillCustomerIdValue`. */
  blurBillAccountNoValue: string;
  blurBillRatePlanLabel: string;
  blurBillRatePlanValue: string;
  blurBillMeterSerialLabel: string;
  /** Whited out in the mockup - kept as the same code in every locale. */
  blurBillMeterSerialValue: string;
  blurBillMeterPriorLabel: string;
  blurBillMeterPriorValue: string;
  blurBillMeterCurrentLabel: string;
  blurBillMeterCurrentValue: string;
  blurBillUsageLabel: string;
  blurBillUsageValue: string;
  /** "Late Fee Note" row: label span, then the deleted row's own text span. */
  blurBillLateFeeLabel: string;
  blurBillLateFeeValue: string;
  blurBillAmountDueLabel: string;
  blurBillAmountDueValue: string;
  blurBillDueDateLabel: string;
  blurBillDueDateValue: string;
  blurReplyHead: string;
  blurReplyText: string;
  blurAttachTag: string;
  blurSendButton: string;
  /** The reply's "Sent" confirmation, once the cleaned file goes out. */
  blurSentLabel: string;
}

export const englishHeroDemoMessages: HeroDemoMessages = {
  ariaLabel: 'How PDkef works, shown as two short stories',
  signSrOnly:
    "A field trip permission slip arrives as a file in a chat message. Tapping it opens the form right there in the chat. The form's printed heading, its sentence naming the trip's destination, date and times, and the checkbox labels are all there from the start, with blank spaces left for the student's name, the parent's name, an emergency contact number, and any allergies or medical notes. As the page scrolls, those four blanks fill in, both permission checkboxes get checked, and a signature draws itself on the line. A share sheet then slides up carrying the signed file, and back in the chat, the signed form goes out and reads as sent.",
  blurSrOnly:
    "An email asks for a copy of a utility bill. Opening it shows several lines of billing details. As the page scrolls, the customer ID blurs until it can't be read, the account number is blacked out, one line is erased to blank paper, and an unrelated row is deleted, leaving blank space. The cleaned-up document is then attached to a reply and sent.",
  signCaption: { before: 'Fill, ', marker: 'sign', after: ',', line2: 'send it back.' },
  blurCaption: { before: 'Keep the ', marker: 'private', after: '', line2: 'bits private.' },
  scrollHint: { line1: 'Scroll to', line2: 'explore' },

  signChatHead: "Maya's class parents",
  signChatMessage: 'Hi all, the field trip permission slip is attached 🙏',
  signFileName: 'field-trip-permission-slip.pdf',
  signFileSize: '248 KB',
  signSentLabel: 'Sent',
  signFormHeading: 'Field Trip Permission Slip',
  signTripSentence: 'Room 12 is going to the Science Museum on Friday, May 14, from 8:00 AM to 3:30 PM.',
  signFieldStudentLabel: "Student's Name",
  signFieldStudentValue: 'Maya Chen',
  signFieldParentLabel: 'Parent/Guardian',
  signFieldParentValue: 'Elena Chen',
  signFieldEmergencyLabel: 'Emergency Contact',
  signFieldEmergencyValue: '(555) 214-0193',
  signFieldAllergiesLabel: 'Allergies / Medical',
  signFieldAllergiesValue: 'Peanut allergy',
  signCheckAttendLabel: 'My child has permission to attend',
  signCheckPhotoLabel: 'Photos may be taken during the trip',
  signConfirmLine: 'Sign below to give permission.',
  signSigLabel: 'Parent or Guardian',
  signDateLabel: 'Date',
  signDateValue: '05/14',
  signToolChipText: 'Text',
  signToolChipSymbols: 'Symbols',
  signToolChipSign: 'Sign',
  signToolChipShare: 'Share',
  signFileSizeSigned: 'Signed - 248 KB',
  signShareMessages: 'Messages',
  signShareMail: 'Mail',
  signShareMore: 'More',

  blurMailHead: 'Inbox',
  blurEmailFromUnread: 'Front Desk',
  blurEmailTimeUnread: '9:41',
  blurEmailSubjectUnread: 'Quick favor, need that bill on file',
  blurEmailPreviewUnread: 'Hi, could you send a copy of your utility bill for our records?',
  blurAvatarFrontDesk: 'FD',
  blurAvatarTeam: 'TM',
  blurEmailFromMuted: 'Team',
  blurEmailTimeMuted: 'Tue',
  blurEmailSubjectMuted: 'Lunch on Friday?',
  blurBillFileName: 'utility-bill.pdf',
  blurToolChipBlur: 'Blur',
  blurToolChipBlackout: 'Blackout',
  blurToolChipWhiteout: 'Whiteout',
  blurToolChipDelete: 'Delete',
  blurBillAccountHolderLabel: 'Account Holder',
  blurBillAccountHolderValue: 'J. Alvarez',
  blurBillServiceAddressLabel: 'Service Address',
  blurBillServiceAddressValue: '14 Maple Court',
  blurBillPeriodLabel: 'Billing Period',
  blurBillPeriodValue: 'Jul 1 to Aug 1',
  blurBillCustomerIdLabel: 'Customer ID',
  blurBillCustomerIdValue: '302-45-6789',
  blurBillAccountNoLabel: 'Account No',
  blurBillAccountNoValue: '0001 1488 25',
  blurBillRatePlanLabel: 'Rate Plan',
  blurBillRatePlanValue: 'Residential Standard',
  blurBillMeterSerialLabel: 'Meter Serial',
  blurBillMeterSerialValue: 'MTR-88291',
  blurBillMeterPriorLabel: 'Meter Reading, Prior',
  blurBillMeterPriorValue: '04821',
  blurBillMeterCurrentLabel: 'Meter Reading, Current',
  blurBillMeterCurrentValue: '05114',
  blurBillUsageLabel: 'Usage',
  blurBillUsageValue: '293 kWh',
  blurBillLateFeeLabel: 'Late Fee Note',
  blurBillLateFeeValue: 'Includes $12 reminder fee',
  blurBillAmountDueLabel: 'Amount Due',
  blurBillAmountDueValue: '$104.20',
  blurBillDueDateLabel: 'Due Date',
  blurBillDueDateValue: 'Sep 28',
  blurReplyHead: 'Reply',
  blurReplyText: 'Here you go.',
  blurAttachTag: 'cleaned',
  blurSendButton: 'Send',
  blurSentLabel: 'Sent',
};

// LOC-16: an AI draft, not yet reviewed by a native speaker - the same
// caveat hebrewSignMessages (toolMessages.ts) and hebrewFileDropzoneMessages
// carry. Pending Shlomi's read-through. Story one is an Israeli school
// setting (a parents' class group, a field-trip permission slip, an
// Israeli-style class name and date); story two keeps the same Front
// Desk / utility-bill shape with Israeli names, address and billing terms.
// A handful of values are deliberately left as the same digits/code in both
// locales - see the interface's own comments on `blurBillCustomerIdValue`,
// `blurBillAccountNoValue` and `blurBillMeterSerialValue` - since those are
// the blurred/blacked-out/whited-out values the two effects are meant to
// hide, not sentences meant to be read.
export const hebrewHeroDemoMessages: HeroDemoMessages = {
  ariaLabel: 'איך PDkef עובד, בשני סיפורים קצרים',
  signSrOnly:
    'טופס אישור הורים לטיול שכבתי מגיע כקובץ בהודעת צ׳אט. הקשה עליו פותחת את הטופס בתוך הצ׳אט עצמו. הכותרת המודפסת של הטופס, המשפט שמפרט את יעד הטיול, התאריך והשעות, ותוויות תיבות הסימון, מופיעים מההתחלה, עם מקומות ריקים לשם התלמידה, שם ההורה, מספר טלפון לשעת חירום והערות על אלרגיות או מידע רפואי. תוך כדי גלילה, ארבעת השדות הריקים מתמלאים, שתי תיבות האישור מסומנות, וחתימה מצטיירת על הקו. אז עולה חלונית שיתוף שנושאת את הקובץ החתום, ובחזרה בצ׳אט, הטופס החתום נשלח ומסומן כנשלח.',
  blurSrOnly:
    'הודעת דוא"ל מבקשת עותק של חשבון חשמל. פתיחתה מציגה כמה שורות של פרטי חיוב. תוך כדי גלילה, מספר הלקוח מיטשטש עד שאי אפשר לקרוא אותו, מספר החשבון מושחר, שורה אחת נמחקת לנייר ריק, ושורה לא קשורה נמחקת ומשאירה רווח ריק. המסמך הנקי מצורף אז לתשובה ונשלח.',
  signCaption: { before: 'מילוי, ', marker: 'חתימה', after: ',', line2: 'ושליחה בחזרה.' },
  blurCaption: { before: 'מה ש', marker: 'פרטי', after: ',', line2: 'נשאר פרטי.' },
  scrollHint: { line1: 'גללו כדי', line2: 'לגלות' },

  signChatHead: 'הורי הכיתה של מאיה',
  signChatMessage: 'היי לכולם, מצורף אישור ההורים לטיול 🙏',
  signFileName: 'אישור-הורים-לטיול.pdf',
  signFileSize: '248 ק״ב',
  signSentLabel: 'נשלח',
  signFormHeading: 'אישור הורים לטיול',
  signTripSentence: 'כיתה ד׳2 יוצאת למוזיאון המדע ביום חמישי, 14 במאי, מ-8:00 עד 15:30.',
  signFieldStudentLabel: 'שם התלמיד/ה',
  signFieldStudentValue: 'מאיה כהן',
  signFieldParentLabel: 'הורה/אפוטרופוס',
  signFieldParentValue: 'אלה כהן',
  signFieldEmergencyLabel: 'טלפון לשעת חירום',
  signFieldEmergencyValue: '052-000-0193',
  signFieldAllergiesLabel: 'אלרגיות / מידע רפואי',
  signFieldAllergiesValue: 'אלרגיה לבוטנים',
  signCheckAttendLabel: 'אני מאשר/ת לילדי להשתתף בטיול',
  signCheckPhotoLabel: 'ניתן לצלם במהלך הטיול',
  signConfirmLine: 'חתמו למטה לאישור.',
  signSigLabel: 'הורה או אפוטרופוס',
  signDateLabel: 'תאריך',
  signDateValue: '14/05',
  signToolChipText: 'טקסט',
  signToolChipSymbols: 'סימנים',
  signToolChipSign: 'חתימה',
  signToolChipShare: 'שיתוף',
  signFileSizeSigned: 'חתום - 248 ק״ב',
  signShareMessages: 'הודעות',
  signShareMail: 'דואר',
  signShareMore: 'עוד',

  blurMailHead: 'דואר נכנס',
  blurEmailFromUnread: 'קבלה',
  blurEmailTimeUnread: '9:41',
  blurEmailSubjectUnread: 'בקשה קטנה, צריך את חשבון החשמל בתיק',
  blurEmailPreviewUnread: 'היי, תוכלו לשלוח עותק של חשבון החשמל שלכם לתיק שלנו?',
  blurAvatarFrontDesk: 'ק',
  blurAvatarTeam: 'צ',
  blurEmailFromMuted: 'הצוות',
  blurEmailTimeMuted: 'יום ג׳',
  blurEmailSubjectMuted: 'ארוחת צהריים ביום חמישי?',
  blurBillFileName: 'חשבון-חשמל.pdf',
  blurToolChipBlur: 'טשטוש',
  blurToolChipBlackout: 'השחרה',
  blurToolChipWhiteout: 'טיפקס',
  blurToolChipDelete: 'מחיקה',
  blurBillAccountHolderLabel: 'בעל החשבון',
  blurBillAccountHolderValue: 'י. אלבז',
  blurBillServiceAddressLabel: 'כתובת הצריכה',
  blurBillServiceAddressValue: 'רחוב האלון 14',
  blurBillPeriodLabel: 'תקופת החיוב',
  blurBillPeriodValue: '1 ביולי עד 1 באוגוסט',
  blurBillCustomerIdLabel: 'מספר לקוח',
  blurBillCustomerIdValue: '302-45-6789',
  blurBillAccountNoLabel: 'מספר חוזה',
  blurBillAccountNoValue: '0001 1488 25',
  blurBillRatePlanLabel: 'מסלול תעריף',
  blurBillRatePlanValue: 'ביתי רגיל',
  blurBillMeterSerialLabel: 'מספר מונה',
  blurBillMeterSerialValue: 'MTR-88291',
  blurBillMeterPriorLabel: 'קריאה קודמת',
  blurBillMeterPriorValue: '04821',
  blurBillMeterCurrentLabel: 'קריאה נוכחית',
  blurBillMeterCurrentValue: '05114',
  blurBillUsageLabel: 'צריכה',
  blurBillUsageValue: '293 קוט"ש',
  blurBillLateFeeLabel: 'הערת פיגור',
  blurBillLateFeeValue: 'כולל דמי תזכורת 12 ₪',
  blurBillAmountDueLabel: 'סכום לתשלום',
  blurBillAmountDueValue: '104.20 ₪',
  blurBillDueDateLabel: 'מועד תשלום',
  blurBillDueDateValue: '28 בספטמבר',
  blurReplyHead: 'תשובה',
  blurReplyText: 'בבקשה.',
  blurAttachTag: 'נוקה',
  blurSendButton: 'שליחה',
  blurSentLabel: 'נשלח',
};

/**
 * Universal values this catalogue deliberately keeps identical in every
 * locale: the blurred/blacked-out/whited-out bill values (see the interface
 * comments) and one shared clock reading. The file size is not one of them:
 * "248 KB" in an RTL run renders as "KB 248", so Hebrew writes the unit the
 * way an iOS Hebrew share sheet does, "248 ק״ב".
 * Exported so heroDemoMessages.test.ts can allowlist exactly these keys
 * instead of guessing.
 */
export const HERO_DEMO_UNIVERSAL_KEYS: ReadonlyArray<keyof HeroDemoMessages> = [
  'blurEmailTimeUnread',
  'blurBillCustomerIdValue',
  'blurBillAccountNoValue',
  'blurBillMeterSerialValue',
  'blurBillMeterPriorValue',
  'blurBillMeterCurrentValue',
];

/** Resolves at build time; anything but 'he' gets the English catalogue, and
 * a locale that IS 'he' still gets every English value as a fallback under
 * it, so a key missing from a future partial edit can never render empty. */
export function getHeroDemoMessages(locale: string): HeroDemoMessages {
  if (locale === 'he') {
    return { ...englishHeroDemoMessages, ...hebrewHeroDemoMessages };
  }
  return englishHeroDemoMessages;
}
