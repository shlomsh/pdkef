/**
 * Reads a PDF date string (`D:YYYYMMDDHHmmSSOHH'mm'` and its truncations) into
 * the wall time the file recorded and its offset from UTC. Also accepts a plain
 * ISO-like string, which pdf-lib may hand back. Pure; no Date involved, so the
 * wall clock is never shifted by the reader's own zone.
 *
 * @param {unknown} text
 * @returns {{ iso: string, offsetMinutes: number | null } | null}
 */
export function parsePdfDate(text) {
  if (typeof text !== 'string') return null;
  const s = text.trim();
  let m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(?:(\d{2})(?:'?(\d{2})'?)?)?'?)?$/.exec(s);
  let parts;
  let sign;
  let oh;
  let om;
  if (m) {
    parts = m.slice(1, 7);
    [sign, oh, om] = m.slice(7);
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:([Zz+-])(?:(\d{2}):?(\d{2})?)?)?$/.exec(s);
    if (!m) return null;
    parts = m.slice(1, 7);
    [sign, oh, om] = m.slice(7);
  }
  const [year, month = '01', day = '01', hour = '00', minute = '00', second = '00'] = parts.map((p) => p ?? undefined);
  const mo = Number(month);
  const d = Number(day);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;

  let offsetMinutes = null;
  if (sign === 'Z' || sign === 'z') offsetMinutes = 0;
  else if (sign) {
    offsetMinutes = Number(oh ?? 0) * 60 + Number(om ?? 0);
    if (sign === '-') offsetMinutes = -offsetMinutes;
  }
  return { iso: `${year}-${month}-${day}T${hour}:${minute}:${second}`, offsetMinutes };
}
