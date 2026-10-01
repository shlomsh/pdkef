// Pure pieces of the error-report endpoint (api/report.ts, DEBT-17): what is
// counted, under which keys, and how much of a user agent survives. Nothing
// here does I/O.
import type { ErrorReport } from '../lib/errorReportSchema.js';

/** Reports counted per UTC day; past it the day is full and nothing more is stored. */
export const DAILY_CAP = 5000;
const TTL_SECONDS = 90 * 24 * 60 * 60;

export type Command = readonly (string | number)[];

/**
 * The engine, as coarsely as is useful for "does it only happen on iOS 26":
 * family and major version, never the full user agent.
 */
export function engineBucket(userAgent: string): string {
  const major = (re: RegExp) => re.exec(userAgent)?.[1];
  // Every iOS browser is WebKit, so any iPhone/iPad UA is bucketed as iOS.
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    const v = major(/OS (\d{1,3})[_.]/);
    return v ? `ios-${v}` : 'ios';
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

/** First step: count the report against the day's cap. The INCR result is the count. */
export function capCommands(day: string): Command[] {
  return [
    ['INCR', `errors:total:${day}`],
    ['EXPIRE', `errors:total:${day}`, TTL_SECONDS],
  ];
}

/** The count field and the sample field are one string: the fingerprint, `stack[0]` last of the report's own parts. */
export function fingerprintField(report: ErrorReport, engine: string): string {
  return `${report.area}|${report.name}|${report.stack[0]}|${engine}`;
}

/** Second step, only when the day is under its cap. The latest sample per fingerprint wins. */
export function countCommands(report: ErrorReport, engine: string, day: string): Command[] {
  const field = fingerprintField(report, engine);
  const { stack, step, tool, installed, sw, age } = report;
  const sample = JSON.stringify({ stack, step, tool, installed, sw, age, engine });
  return [
    ['HINCRBY', `errors:${day}`, field, 1],
    ['EXPIRE', `errors:${day}`, TTL_SECONDS],
    ['HSET', `errors:sample:${day}`, field, sample],
    ['EXPIRE', `errors:sample:${day}`, TTL_SECONDS],
  ];
}

/** Both steps, in order, as one list (the shape the contract names). */
export function reportCommands(report: ErrorReport, engine: string, day: string): Command[] {
  return [...capCommands(day), ...countCommands(report, engine, day)];
}

export function readEnv(
  env: Readonly<Record<string, string | undefined>>,
): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}
