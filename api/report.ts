// Vercel Function: receives the anonymous error reports of src/lib/errorReport.ts
// and counts them in Upstash Redis (DEBT-17), keeping the latest example of
// each (DEBT-27), and also counts Sign's maintenance events (counts only, no
// sample), and per-tool usage (counts only, no engine, no sample). The second request-time component after middleware.ts; Astro
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
import { MAX_REPORT_BYTES, parseErrorReport } from '../src/lib/errorReportSchema.js';
import { parseMaintenanceEvent } from '../src/lib/maintenanceEventSchema.js';
import { parseUsageEvent } from '../src/lib/usageEventSchema.js';
import {
  DAILY_CAP,
  USAGE_DAILY_CAP,
  capCommands,
  countCommands,
  dayKey,
  engineBucket,
  eventCommands,
  readEnv,
  usageCapCommands,
  usageCommands,
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

export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_REPORT_BYTES) return NO_CONTENT();
    const body = await request.text();
    if (body.length > MAX_REPORT_BYTES) return NO_CONTENT();
    const json: unknown = JSON.parse(body);
    const report = parseErrorReport(json);
    const event = report ? null : parseMaintenanceEvent(json);
    const usage = report || event ? null : parseUsageEvent(json);
    const store = readEnv(process.env);
    if ((!report && !event && !usage) || !store) return NO_CONTENT();

    const day = dayKey(new Date());
    if (usage) {
      if (day === cappedUsageDay) return NO_CONTENT();
      const [total] = await pipeline(store, usageCapCommands(day));
      if (typeof total?.result === 'number' && total.result > USAGE_DAILY_CAP) cappedUsageDay = day;
      else if (typeof total?.result === 'number') await pipeline(store, usageCommands(usage, day));
      return NO_CONTENT();
    }
    if (day === cappedDay) return NO_CONTENT();
    const [total] = await pipeline(store, capCommands(day));
    if (typeof total?.result === 'number' && total.result > DAILY_CAP) cappedDay = day;
    else if (typeof total?.result === 'number') {
      const engine = engineBucket(request.headers.get('user-agent') ?? '');
      await pipeline(store, report ? countCommands(report, engine, day) : eventCommands(event!, engine, day));
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
