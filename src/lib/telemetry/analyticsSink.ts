/**
 * MEM-45: an optional second destination for usage and maintenance events, an analytics host named
 * by build-time variables. With either unset nothing is sent. Error reports, drop records and
 * ratings never come here. The capture carries the event, a random id that lives only in this page
 * load's memory, and the page's origin and path: no query, fragment, referrer or user agent.
 */

import { canSend } from './errorReport.ts';

interface SinkEvent {
  name: string;
  properties: Record<string, unknown>;
}

interface SinkContext {
  key: string;
  id: string;
  now: Date;
  origin: string;
  pathname: string;
}

/**
 * The host (an https origin) and key from the build-time variables, or null when either is missing. Pure.
 * @testSeam
 */
export function readSinkConfig(
  env: Record<string, unknown> | undefined = import.meta.env,
): { host: string; key: string } | null {
  const host = env?.PUBLIC_ANALYTICS_HOST;
  const key = env?.PUBLIC_ANALYTICS_KEY;
  if (typeof host !== 'string' || typeof key !== 'string' || !host || !key) return null;
  try {
    const url = new URL(host);
    return url.protocol === 'https:' ? { host: url.origin, key } : null;
  } catch {
    // expected: a malformed host means no sink
    return null;
  }
}

/**
 * The capture body for one event. Pure.
 * @testSeam
 */
export function toCapture(event: SinkEvent, ctx: SinkContext): object {
  return {
    api_key: ctx.key,
    event: event.name,
    distinct_id: ctx.id,
    timestamp: ctx.now.toISOString(),
    properties: {
      ...event.properties,
      $process_person_profile: false,
      $current_url: ctx.origin + ctx.pathname,
      $pathname: ctx.pathname,
    },
  };
}

// One id per page load, in memory only: never written to any storage.
let pageLoadId: string | null | undefined;

function makeId(): string | null {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return null;
}

/** @testSeam */
export function resetSinkForTests(): void {
  pageLoadId = undefined;
}

/** Hands one event to the analytics host by beacon. False when unconfigured or not sendable; never throws. */
export function sendToSink(event: SinkEvent): boolean {
  try {
    const config = readSinkConfig();
    if (!config || !canSend()) return false;
    pageLoadId ??= makeId();
    if (!pageLoadId) return false;
    const capture = toCapture(event, {
      key: config.key,
      id: pageLoadId,
      now: new Date(),
      origin: location.origin,
      pathname: location.pathname,
    });
    return navigator.sendBeacon(`${config.host}/i/v0/e/`, new Blob([JSON.stringify(capture)], { type: 'text/plain' }));
  } catch {
    // expected: telemetry never throws and never blocks a tool
    return false;
  }
}
