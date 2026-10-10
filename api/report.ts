// Vercel Function: receives the anonymous error reports of src/lib/errorReport.ts
// and counts them in Upstash Redis (DEBT-17), keeping the latest example of
// each (DEBT-27), and also counts Sign's maintenance events and the reports a
// tool chose not to send (drop records, DEBT-44; counts only, no sample),
// per-tool usage (counts only, no engine, no sample), and every body it
// refuses (oversize, bad JSON, a shape no parser accepts), by reason and
// engine under its own small daily cap. The second request-time component after middleware.ts; Astro
// itself stays output 'static' with no adapter, so this is a plain function
// under api/. It never sees a PDF byte: a report is positions in our own code,
// identifiers, flags and a bucket, validated by parseErrorReport.
//
// Shape: Vercel's documented Web-standard form for non-Next projects, one
// exported function per HTTP method (`export function POST(request: Request)`).
//
// Always 204, whatever happens, so the endpoint can never block or break a
// tool. Stored: counts per day, plus the latest validated example of each,
// with an engine bucket - no IP, no full user agent, no time finer than the
// day. Nothing from the request is logged.
import { MAX_REPORT_BYTES, parseDropRecord, parseErrorReport } from '../src/lib/errorReportSchema.js';
import { parseMaintenanceEvent } from '../src/lib/maintenanceEventSchema.js';
import { parseUsageEvent } from '../src/lib/usageEventSchema.js';
import {
  DAILY_CAP,
  REJECT_DAILY_CAP,
  USAGE_DAILY_CAP,
  capCommands,
  countCommands,
  dropCommands,
  dayKey,
  engineBucket,
  errorTotalKey,
  eventCommands,
  readEnv,
  rejectCapCommands,
  rejectCommands,
  rejectReason,
  rejectTotalKey,
  usageCapCommands,
  usageCommands,
  usageTotalKey,
  withDayExpiry,
  type Command,
} from '../src/site-lib/errorReportStore.js';

// No @types/node in this repo; the function runtime provides process.env.
declare const process: { env: Record<string, string | undefined> };

const NO_CONTENT = () => new Response(null, { status: 204 });

async function pipeline(
  store: { url: string; token: string },
  commands: Command[],
): Promise<{ result?: unknown }[]> {
  const res = await fetch(`${store.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${store.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error('store');
  return (await res.json()) as { result?: unknown }[];
}

// The day the cap was last reached, per warm instance: past it, a flood of
// forged reports costs no store calls at all.
let cappedDay = '';
let cappedUsageDay = '';
let cappedRejectDay = '';

// Counts a refused body by reason and engine, under its own cap. Errors here are the caller's to swallow.
async function countReject(
  store: { url: string; token: string },
  request: Request,
  declared: number,
  body: string | undefined,
): Promise<void> {
  const day = dayKey(new Date());
  if (day === cappedRejectDay) return;
  const [total] = await pipeline(store, rejectCapCommands(day));
  if (typeof total?.result !== 'number') return;
  if (total.result > REJECT_DAILY_CAP) {
    cappedRejectDay = day;
    return;
  }
  const engine = engineBucket(request.headers.get('user-agent') ?? '');
  await pipeline(store, withDayExpiry(rejectTotalKey(day), total.result, rejectCommands(rejectReason(declared, body), engine, day)));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const store = readEnv(process.env);
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_REPORT_BYTES) {
      if (store) await countReject(store, request, declared, undefined);
      return NO_CONTENT();
    }
    const body = await request.text();
    // An oversize or unparseable body parses as nothing and is counted as a reject below.
    let json: unknown;
    if (body.length <= MAX_REPORT_BYTES) {
      try {
        json = JSON.parse(body);
      } catch {
        // expected: bad JSON is a reject, counted below
      }
    }
    const report = parseErrorReport(json);
    const event = report ? null : parseMaintenanceEvent(json);
    const drop = report || event ? null : parseDropRecord(json);
    const usage = report || event || drop ? null : parseUsageEvent(json);
    if (!store) return NO_CONTENT();
    if (!report && !event && !drop && !usage) {
      await countReject(store, request, declared, body);
      return NO_CONTENT();
    }

    const day = dayKey(new Date());
    if (usage) {
      if (day === cappedUsageDay) return NO_CONTENT();
      const [total] = await pipeline(store, usageCapCommands(day));
      if (typeof total?.result === 'number' && total.result > USAGE_DAILY_CAP) cappedUsageDay = day;
      else if (typeof total?.result === 'number') {
        await pipeline(store, withDayExpiry(usageTotalKey(day), total.result, usageCommands(usage, day)));
      }
      return NO_CONTENT();
    }
    if (day === cappedDay) return NO_CONTENT();
    const [total] = await pipeline(store, capCommands(day));
    if (typeof total?.result === 'number' && total.result > DAILY_CAP) cappedDay = day;
    else if (typeof total?.result === 'number') {
      const engine = engineBucket(request.headers.get('user-agent') ?? '');
      const counting = report
        ? countCommands(report, engine, day)
        : drop
          ? dropCommands(drop, engine, day)
          : eventCommands(event!, engine, day);
      await pipeline(store, withDayExpiry(errorTotalKey(day), total.result, counting));
    }
  } catch {
    console.error('error-report: dropped');
  }
  return NO_CONTENT();
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
