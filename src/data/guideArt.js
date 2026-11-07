// The small drawings on a tool page's guide shelf (RelatedGuides.astro), one per
// guide that can lead or be picked there. Decorative: the card's title says what
// the guide is, so every picture is aria-hidden. Colours are :root tokens, so a
// palette change reaches them, and the strokes share one hand: ink outlines,
// muted text lines, clay pencil marks.

const ink = 'var(--color-primary-text)';
const soft = 'var(--color-muted)';
const pencil = 'var(--color-clay)';
const surface = 'var(--color-surface)';
const tint = 'var(--color-primary-tint)';
const faint = 'var(--color-border-strong)';

const svg = (viewBox, body) =>
  `<svg viewBox="${viewBox}" width="100%" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const page = (x, y, w, h, rx = 5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${surface}" stroke="${ink}" stroke-width="1.6"/>`;
const lines = (x, ys, widths, color = soft, width = 2) =>
  ys.map((y, k) => `<path d="M${x} ${y}h${widths[k % widths.length]}" stroke="${color}" stroke-width="${width}"/>`).join('');
const signature = (x, y) =>
  `<path d="M${x} ${y}c6-14 10-16 12-8s4 10 9-2 7-4 9 2 6 2 10-6 6 0 9 4" stroke="${ink}" stroke-width="1.8"/>`;

// Why 100 KB won't fit: pages along a size line, sharp before the 100 KB mark and fading after it.
const compressTo100kb = () => {
  const blur = [3, 4, 5, 6]
    .map((n) => `<filter id="guide-blur-${n}" filterUnits="userSpaceOnUse" x="-4" y="0" width="50" height="56"><feGaussianBlur stdDeviation="${((n - 2) * 0.55).toFixed(2)}"/></filter>`)
    .join('');
  const pages = Array.from({ length: 7 }, (_, n) => {
    const over = n >= 5;
    const text = [12, 20, 28, 36]
      .map((y, k) => `<path d="M8 ${y}h${k === 3 ? 16 : 26}" stroke="${soft}" stroke-width="2"${n >= 3 ? ` filter="url(#guide-blur-${n})"` : ''}/>`)
      .join('');
    return `<g transform="translate(${14 + n * 58} 30)" opacity="${over ? 0.32 : (1 - n * 0.09).toFixed(2)}"><rect width="42" height="56" rx="4" fill="${surface}" stroke="${ink}" stroke-width="1.4"${over ? ' stroke-dasharray="4 3"' : ''}/>${text}</g>`;
  }).join('');
  const ticks = Array.from({ length: 8 }, (_, k) => `<path d="M${10 + k * 58} 100v8" stroke="${soft}" stroke-width="1.4"/>`).join('');
  return svg('0 12 420 118', `<defs>${blur}</defs>${pages}<path d="M8 104c70-2 150 1 220-1s120 1 186 0" stroke="${soft}" stroke-width="1.6"/>${ticks}<path d="M300 18c1 30-1 62 0 92" stroke="${pencil}" stroke-width="2" stroke-dasharray="5 4"/><text x="306" y="124" font-size="13" font-weight="700" fill="var(--color-text)">100 KB</text>`);
};

// Photo and signature size limits: a portal photo measured in pencil, and a signature on a strip.
const photoAndSignatureSize = () => svg('0 0 220 140', `${page(34, 18, 70, 88, 6)}
  <circle cx="69" cy="52" r="15" stroke="${ink}" stroke-width="1.6"/>
  <path d="M44 104c3-17 14-26 25-26s22 9 25 26" stroke="${ink}" stroke-width="1.6"/>
  <path d="M34 120c22 1 48-1 70 0M38 116l-4 4 4 4M100 116l4 4-4 4" stroke="${pencil}" stroke-width="1.6"/>
  <path d="M20 18c1 30-1 58 0 88M16 22l4-4 4 4M16 102l4 4 4-4" stroke="${pencil}" stroke-width="1.6"/>
  ${page(122, 62, 84, 44)}${signature(130, 92)}
  <path d="M130 98h68" stroke="${soft}" stroke-width="1.2" stroke-dasharray="3 3"/>`);

// Installing it as an app: a phone home screen with the app among the others, and no signal.
const installApp = () => {
  const tiles = [0, 1, 2].flatMap((r) => [0, 1].map((c) => {
    const x = 88 + c * 24;
    const y = 32 + r * 26;
    const me = r === 1 && c === 1;
    return `<rect x="${x}" y="${y}" width="18" height="18" rx="5" fill="${me ? tint : 'none'}" stroke="${me ? ink : faint}" stroke-width="${me ? 1.6 : 1.2}"/>${me ? `<path d="M${x + 9} ${y + 4}v8m-3.5-3.5L${x + 9} ${y + 12}l3.5-3.5" stroke="${ink}" stroke-width="1.5"/>` : ''}`;
  })).join('');
  return svg('0 0 220 140', `${page(76, 10, 68, 122, 12)}<path d="M102 18h16" stroke="${soft}" stroke-width="2"/>${tiles}
  <g transform="translate(160 26)" stroke="${pencil}" stroke-width="1.7"><path d="M2 12c10-9 26-9 36 0M9 19c6-5 16-5 22 0M4 2l32 30"/><circle cx="20" cy="26" r="1.6" fill="${pencil}"/></g>
  <path d="M40 74c8-6 20-8 30-4M64 64l7 6-8 4" stroke="${soft}" stroke-width="1.4" stroke-dasharray="3 4"/>
  ${page(14, 78, 26, 34, 3)}${lines(20, [88, 95, 102], [14, 14, 8], soft, 1.6)}`);
};

// Signing without an account: a sign-up card struck through in pencil, and the signed page beside it.
const signWithoutAccount = () => svg('0 0 220 140', `<rect x="18" y="24" width="84" height="94" rx="8" fill="${surface}" stroke="${faint}" stroke-width="1.3"/>
  <path d="M30 40h36" stroke="${soft}" stroke-width="2"/>
  <rect x="30" y="52" width="60" height="12" rx="3" stroke="${faint}" stroke-width="1.2"/><rect x="30" y="72" width="60" height="12" rx="3" stroke="${faint}" stroke-width="1.2"/>
  <rect x="30" y="94" width="34" height="12" rx="6" fill="${faint}" opacity=".45"/>
  <path d="M24 112c18-24 50-58 72-80" stroke="${pencil}" stroke-width="2.2"/>
  ${page(120, 14, 82, 112)}${lines(132, [32, 42, 52, 62], [58, 58, 58, 36])}
  ${signature(136, 98)}<path d="M132 106h58" stroke="${soft}" stroke-width="1.2" stroke-dasharray="3 3"/>`);

// Signing in your own language: the signed page with three scripts around it.
const signInYourLanguage = () => {
  const chip = (x, y, text, lang) => `<rect x="${x}" y="${y}" width="40" height="26" rx="13" fill="${tint}" stroke="${ink}" stroke-width="1.2"/><text x="${x + 20}" y="${y + 18}" lang="${lang}" text-anchor="middle" font-size="14" font-weight="650" fill="${ink}">${text}</text>`;
  return svg('0 0 220 140', `${page(62, 12, 96, 116)}${lines(76, [30, 40, 50, 60], [68, 68, 68, 44])}
  ${signature(80, 100)}<path d="M76 108h68" stroke="${soft}" stroke-width="1.2" stroke-dasharray="3 3"/>
  ${chip(14, 26, 'Aa', 'en')}${chip(166, 54, 'אב', 'he')}${chip(18, 82, 'عر', 'ar')}`);
};

// Filling a form offline: ticked boxes on a form, and an airplane.
const offlineFormFiller = () => {
  const row = (y, ticked) => `<rect x="52" y="${y - 7}" width="14" height="14" rx="3" stroke="${ink}" stroke-width="1.4"/>${ticked ? `<path d="M55 ${y}l3 3 6-7" stroke="${ink}" stroke-width="1.8"/>` : ''}<path d="M74 ${y}h52" stroke="${soft}" stroke-width="2"/>`;
  return svg('0 0 220 140', `${page(40, 14, 100, 114)}${row(34, true)}${row(58, true)}${row(82, false)}
  <rect x="52" y="98" width="76" height="16" rx="3" stroke="${faint}" stroke-width="1.2"/><path d="M57 109c4-5 7-5 9-1s5 3 8-1 6-2 8 1" stroke="${ink}" stroke-width="1.5"/>
  <g transform="translate(158 26) scale(2)" stroke="${pencil}" stroke-width=".9"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></g>
  <path d="M150 104c10 0 22-6 30-20" stroke="${pencil}" stroke-width="1.4" stroke-dasharray="2 5"/>`);
};

// Blur, blackout or delete: one page, three lines, three treatments.
const blurBlackoutDelete = () => svg('0 0 220 140', `<defs><filter id="guide-blur-row" filterUnits="userSpaceOnUse" x="30" y="20" width="130" height="32"><feGaussianBlur stdDeviation="2.4"/></filter></defs>
  ${page(28, 14, 164, 112, 6)}
  <path d="M46 36h30M82 36h40M128 36h18" stroke="${soft}" stroke-width="7" opacity=".7" filter="url(#guide-blur-row)"/><path d="M154 36h22" stroke="${soft}" stroke-width="2"/>
  ${lines(46, [52, 80, 108], [130, 120, 130])}
  <rect x="46" y="59" width="104" height="13" rx="2" fill="var(--color-text)"/><path d="M158 66h18" stroke="${soft}" stroke-width="2"/>
  <rect x="46" y="87" width="92" height="13" rx="2" stroke="${pencil}" stroke-width="1.6" stroke-dasharray="4 3"/><path d="M146 94h30" stroke="${soft}" stroke-width="2"/>`);

// Deleting text for good: a word lifted out of its line and dropped in the bin, leaving a gap.
const permanentlyDeleteText = () => svg('0 0 220 140', `${page(22, 20, 112, 106)}
  ${lines(36, [40, 72, 88, 104], [84, 84, 60, 74])}
  <path d="M36 56h20M100 56h20" stroke="${soft}" stroke-width="2"/><rect x="61" y="50" width="34" height="12" rx="2" stroke="${soft}" stroke-width="1.2" stroke-dasharray="3 3"/>
  <path d="M80 46c8-22 40-30 70-20" stroke="${pencil}" stroke-width="1.6" stroke-dasharray="4 4"/>
  <g transform="rotate(-10 176 34)"><rect x="158" y="27" width="36" height="13" rx="3" fill="${tint}" stroke="${ink}" stroke-width="1.4"/><path d="M164 33.5h24" stroke="${ink}" stroke-width="2"/></g>
  <path d="M156 66h48M170 66v-5h20v5" stroke="${ink}" stroke-width="1.6"/><path d="M160 66l4 50h32l4-50" fill="${surface}" stroke="${ink}" stroke-width="1.6"/>
  <path d="M172 78v28M180 78v28M188 78v28" stroke="${faint}" stroke-width="1.3"/>`);

// Removing a scan app's watermark: a scanned page with its footer strip being erased.
const removeScanWatermark = () => svg('0 0 220 140', `${page(36, 8, 112, 124, 4)}
  ${lines(50, [26, 36, 46, 56, 66], [84, 84, 84, 84, 56])}
  <rect x="50" y="76" width="40" height="24" rx="2" fill="${tint}"/>${lines(98, [82, 90, 98], [36, 36, 24])}
  <rect x="46" y="112" width="92" height="13" rx="3" stroke="${pencil}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="M52 118.5h30" stroke="${soft}" stroke-width="4" opacity=".35"/>
  <g transform="rotate(-35 150 102)"><rect x="132" y="93" width="40" height="18" rx="4" fill="${surface}" stroke="${ink}" stroke-width="1.6"/><path d="M146 93v18" stroke="${ink}" stroke-width="1.6"/><rect x="133" y="94" width="13" height="16" rx="3" fill="${tint}"/></g>
  <circle cx="122" cy="128" r="1.5" fill="${pencil}"/><circle cx="130" cy="131" r="1.2" fill="${pencil}"/><circle cx="114" cy="131" r="1.1" fill="${pencil}"/>`);

// Reading a paper: two columns, one line under the highlighter, a note in the margin.
const academicPaperReader = () => {
  const ys = [42, 51, 60, 69, 78, 87, 96, 105, 114];
  return svg('0 0 220 140', `${page(26, 10, 132, 122, 4)}<path d="M40 26h72" stroke="${ink}" stroke-width="2.6"/>
  <rect x="38" y="64" width="54" height="10" rx="2" fill="var(--color-highlighter)" opacity=".85"/>
  ${lines(40, ys, [48, 48, 44, 48, 48, 30, 48, 48, 40], soft, 1.8)}${lines(98, ys, [46, 46, 46, 36, 46, 46, 46, 28, 46], soft, 1.8)}
  <path d="M94 69c26 2 46-4 70-12" stroke="${pencil}" stroke-width="1.4" stroke-dasharray="3 4"/>
  <rect x="166" y="36" width="42" height="40" rx="3" fill="var(--color-citron)" stroke="var(--color-citron-ink)" stroke-width="1.2" transform="rotate(4 187 56)"/>
  ${lines(173, [50, 58, 66], [26, 26, 16], 'var(--color-citron-ink)', 1.6)}`);
};

// Opening a file from cloud storage: a document carried from a cloud to the laptop.
const openFromCloud = () => svg('0 0 220 140', `<path d="M36 86h60a19 19 0 0 0 0-38 26 26 0 0 0-49-6 19 19 0 0 0-11 44z" fill="${surface}" stroke="${ink}" stroke-width="1.6"/>
  <rect x="58" y="54" width="20" height="25" rx="2" fill="${tint}" stroke="${ink}" stroke-width="1.3"/>${lines(62, [62, 68], [12, 8], ink, 1.3)}
  <path d="M100 66c12-10 22-10 30-4M124 56l7 6-8 3" stroke="${pencil}" stroke-width="1.6" stroke-dasharray="4 4"/>
  <rect x="134" y="54" width="66" height="46" rx="4" fill="${surface}" stroke="${ink}" stroke-width="1.6"/><path d="M124 108h86l-6 8h-74z" fill="${surface}" stroke="${ink}" stroke-width="1.6"/>
  <rect x="157" y="62" width="20" height="27" rx="2" fill="${tint}" stroke="${ink}" stroke-width="1.3"/>${lines(161, [70, 76], [12, 8], ink, 1.3)}`);

// Scanning a document: a tilted sheet under a camera frame, its corners found.
const scanDocument = () => {
  const corners = [[63.2, 26.7], [146.7, 17.9], [157.2, 117.3], [73.7, 126.1]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${tint}" stroke="${ink}" stroke-width="1.3"/>`).join('');
  return svg('0 0 220 140', `<g transform="rotate(-6 110 70)">${page(68, 22, 84, 100, 3)}${lines(80, [40, 50, 60, 70, 80], [60, 60, 60, 60, 40])}</g>
  <path d="M42 26V6h20M158 6h20v20M178 114v20h-20M62 134H42v-20" stroke="${pencil}" stroke-width="2.2"/>${corners}`);
};

// An open-source editor: code you can read, under a magnifying glass.
const openSourceEditor = () => svg('0 0 220 140', `<rect x="20" y="16" width="150" height="104" rx="8" fill="${surface}" stroke="${ink}" stroke-width="1.6"/>
  <path d="M20 34h150" stroke="${faint}" stroke-width="1.2"/>
  <circle cx="32" cy="25" r="2.5" fill="${faint}"/><circle cx="42" cy="25" r="2.5" fill="${faint}"/><circle cx="52" cy="25" r="2.5" fill="${faint}"/>
  <path d="M36 50h18M48 62h14M48 74h12M36 98h10" stroke="${ink}" stroke-width="3"/>
  <path d="M60 50h40M66 62h34M64 74h44M48 86h52M50 98h48" stroke="${soft}" stroke-width="3"/>
  <circle cx="150" cy="84" r="25" fill="var(--color-primary-soft)" stroke="${pencil}" stroke-width="2.2"/><path d="M138 84h24" stroke="${ink}" stroke-width="4.5"/>
  <path d="M168 102l20 20" stroke="${pencil}" stroke-width="4"/>`);

const ART = {
  'pdf-wont-compress-to-100kb': compressTo100kb,
  'photo-and-signature-size-for-forms': photoAndSignatureSize,
  'install-pdf-app': installApp,
  'sign-pdf-no-signup': signWithoutAccount,
  'sign-pdf-in-your-language': signInYourLanguage,
  'offline-pdf-form-filler': offlineFormFiller,
  'blur-vs-blackout-vs-delete-pdf': blurBlackoutDelete,
  'permanently-delete-text-from-pdf': permanentlyDeleteText,
  'remove-camscanner-watermark-from-pdf': removeScanWatermark,
  'academic-paper-reader': academicPaperReader,
  'how-to-open-a-pdf-from-google-drive': openFromCloud,
  'how-to-scan-a-document-to-pdf': scanDocument,
  'open-source-pdf-editor': openSourceEditor,
};

/** The guide's drawing as inline SVG markup, or undefined when it has none. */
export function guideArt(pageId) {
  return ART[pageId]?.();
}
