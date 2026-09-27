// The sky in the home page's plane window (TheO.astro): day, golden (around
// sunrise and sunset) or night, from the visitor's own clock. Sunrise and
// sunset come from a rough northern mid-latitude model in local clock time,
// which is close enough to set a mood and is never shown as a fact.
export type Sky = 'day' | 'golden' | 'night';

const DAY_MS = 86_400_000;
const JUNE_SOLSTICE = 172;

export function skyAt(date: Date): Sky {
  const dayOfYear = (date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / DAY_MS;
  // 1 at the June solstice, -1 at the December one.
  const season = Math.cos((2 * Math.PI * (dayOfYear - JUNE_SOLSTICE)) / 365);
  const sunrise = 6.3 - season;
  const sunset = 18.4 + 1.9 * season;
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < sunrise - 0.5 || hour >= sunset + 0.5) return 'night';
  if (hour < sunrise + 0.75 || hour >= sunset - 0.75) return 'golden';
  return 'day';
}
