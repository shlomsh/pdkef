// Pure pieces of the error-report endpoint (api/report.ts, DEBT-17): what is
// counted (error reports and Sign's maintenance events), under which keys, and
// how much of a user agent survives. Nothing here does I/O.
import { MAX_REPORT_BYTES, dropRecordField, type DropRecord, type ErrorReport } from '#lib/telemetry/errorReportSchema.ts';
import { maintenanceEventField, type MaintenanceEvent } from '#lib/telemetry/maintenanceEventSchema.ts';
import { usageEventField, usagePageField, type UsageEvent } from '#lib/telemetry/usageEventSchema.ts';

/**
 * Reports, drop records and Sign events counted per UTC day; past it the day is full. Budget: the
 * cap step is one INCR, and the day's first count adds one EXPIRE on the total. A report then costs
 * 5 commands, a Sign event or drop record 3, a usage event 3 (4 when it is a page's first of its kind: its pg field, DEBT-58, which also does what the once and nav fields of DEBT-48/57 did), a reject 3, and anything past a cap 1.
 * Drops share the 1000 cap, so the worst case of the error path is still 1000 x 5. Counted traffic
 * tops out near 1000 x 5 + 2400 x 4 + 200 x 3 = 15.2K commands a day (about 456K a month), inside
 * Upstash Free's 500K with room for reads. Raise any cap only with that sum in view. Past the cap each request still costs 1 command until an instance caches the cap; the
 * firewall's per-IP limit of 10 per minute is what bounds that, so a flood from many IPs can still
 * spend the month.
 */
export const DAILY_CAP = 1000;
/** Usage events counted per UTC day, apart from the cap above. */
export const USAGE_DAILY_CAP = 2400;
/** Rejected bodies counted per UTC day, apart from the caps above. */
export const REJECT_DAILY_CAP = 200;
const TTL_SECONDS = 90 * 24 * 60 * 60;

export type Command = readonly (string | number)[];

/** iPhone browsers other than Safari, by the token each puts in its user agent (DEBT-57). */
const IOS_APPS: [string, RegExp][] = [
  ['chrome', /\bCriOS\//],
  ['google', /\bGSA\//],
  ['firefox', /\bFxiOS\//],
  ['edge', /\bEdgiOS\//],
];

/**
 * The engine, as coarsely as is useful for "does it only happen on iOS 26":
 * family and major version, never the full user agent. An iPhone browser
 * other than Safari reads `ios-<browser>-<os>`, `app` for an in-app browser.
 */
export function engineBucket(userAgent: string): string {
  const major = (re: RegExp) => re.exec(userAgent)?.[1];
  // Every iOS browser is WebKit, so any iPhone/iPad UA is bucketed as iOS. From iOS 26 the OS token is frozen
  // at 18_x (measured: iOS 26.2 Safari says "iPhone OS 18_7"), so Version/ names the real major and a bare 18 means 18+.
  // A browser other than Safari is named first (DEBT-57): a Google-app or Chrome visitor's failure once read as
  // "iOS 18" when it was neither Safari nor necessarily iOS 18. Anything else without Version/ is an in-app browser.
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    const app = IOS_APPS.find(([, token]) => token.test(userAgent))?.[0];
    const safari = major(/Version\/(\d{1,3})/);
    if (safari && !app) return `ios-${safari}`;
    const v = major(/OS (\d{1,3})[_.]/);
    const os = !v ? '' : Number(v) >= 18 ? '-18+' : `-${v}`;
    return `ios-${app ?? 'app'}${os}`;
  }
  const firefox = major(/Firefox\/(\d{1,4})/);
  if (firefox) return `firefox-${firefox}`;
  const chromium = major(/(?:Chrome|Chromium|CriOS)\/(\d{1,4})/);
  if (chromium) return `chromium-${chromium}`;
  const safari = /Safari\//.test(userAgent) ? major(/Version\/(\d{1,4})/) : undefined;
  if (safari) return `safari-${safari}`;
  return 'other';
}

export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export const errorTotalKey = (day: string) => `errors:total:${day}`;
export const rejectTotalKey = (day: string) => `rejects:total:${day}`;
export const usageTotalKey = (day: string) => `usage:total:${day}`;

/** First step: count the report against the day's cap. The INCR result is the count. */
export function capCommands(day: string): Command[] {
  return [['INCR', errorTotalKey(day)]];
}

/** The day's first count (INCR returned 1) also sets the total's expiry, once; later counts add nothing. */
export function withDayExpiry(totalKey: string, total: number, commands: Command[]): Command[] {
  return total === 1 ? [['EXPIRE', totalKey, TTL_SECONDS], ...commands] : commands;
}

/**
 * The count field and the sample field are one string: the fingerprint, `stack[0]` last of the report's own parts.
 * @testSeam
 */
export function fingerprintField(report: ErrorReport, engine: string): string {
  return `${report.area}|${report.name}|${report.stack[0]}|${report.step}|${engine}`;
}

/** Second step, only when the day is under its cap. The latest sample per fingerprint wins. */
export function countCommands(report: ErrorReport, engine: string, day: string): Command[] {
  const field = fingerprintField(report, engine);
  const { stack, step, tool, installed, sw, age, actions, build, translated } = report;
  const sample = JSON.stringify({
    stack, step, tool, installed, sw, age, actions, ...(build ? { build } : {}), ...(translated ? { translated } : {}), engine,
  });
  return [
    ['HINCRBY', `errors:${day}`, field, 1],
    ['EXPIRE', `errors:${day}`, TTL_SECONDS],
    ['HSET', `errors:sample:${day}`, field, sample],
    ['EXPIRE', `errors:sample:${day}`, TTL_SECONDS],
  ];
}

/** Second step for a maintenance event: a count per day and field, no sample. */
export function eventCommands(event: MaintenanceEvent, engine: string, day: string): Command[] {
  return [
    ['HINCRBY', `events:${day}`, maintenanceEventField(event, engine), 1],
    ['EXPIRE', `events:${day}`, TTL_SECONDS],
  ];
}

/** First step for a usage event: its own day total, apart from errors. */
export function usageCapCommands(day: string): Command[] {
  return [['INCR', usageTotalKey(day)]];
}

/** Second step for a usage event: a count per day and tool event, no sample; a first event adds its page-load (pg) count. */
export function usageCommands(event: UsageEvent, day: string): Command[] {
  const page = usagePageField(event);
  return [
    ['HINCRBY', `usage:${day}`, usageEventField(event), 1],
    ...(page ? [['HINCRBY', `usage:${day}`, page, 1] as const] : []),
    ['EXPIRE', `usage:${day}`, TTL_SECONDS],
  ];
}

/** Second step for a drop record: a count per day and field, no sample. */
export function dropCommands(record: DropRecord, engine: string, day: string): Command[] {
  return [
    ['HINCRBY', `drops:${day}`, dropRecordField(record, engine), 1],
    ['EXPIRE', `drops:${day}`, TTL_SECONDS],
  ];
}

type RejectReason = 'oversize' | 'bad_json' | 'bad_report' | 'bad_drop' | 'bad_event' | 'bad_other';

/**
 * Why a body that no parser accepted was refused. Pass the declared content-length and, unless that
 * alone is over the limit, the body text. Valid JSON is told apart by the key that names its intent.
 */
export function rejectReason(declared: number, body: string | undefined): RejectReason {
  if (declared > MAX_REPORT_BYTES || (body ?? '').length > MAX_REPORT_BYTES) return 'oversize';
  let json: unknown;
  try {
    json = JSON.parse(body ?? '');
  } catch { // expected: unparseable JSON is the bad_json reject
    return 'bad_json';
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return 'bad_other';
  if ('stack' in json) return 'bad_report';
  if ('kind' in json) return 'bad_drop';
  if ('properties' in json) return 'bad_event';
  return 'bad_other';
}

/** First step for a rejected body: its own day total and cap. */
export function rejectCapCommands(day: string): Command[] {
  return [['INCR', rejectTotalKey(day)]];
}

/** Second step for a rejected body: a count per day, reason and engine. */
export function rejectCommands(reason: RejectReason, engine: string, day: string): Command[] {
  return [
    ['HINCRBY', `rejects:${day}`, `${reason}|${engine}`, 1],
    ['EXPIRE', `rejects:${day}`, TTL_SECONDS],
  ];
}

export function readEnv(
  env: Readonly<Record<string, string | undefined>>,
): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}
