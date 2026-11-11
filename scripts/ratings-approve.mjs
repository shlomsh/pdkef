// Shlomi approves which comments become public notes (SEO-57): npm run ratings:approve
//   npm run ratings:approve                          list candidates and approved notes
//   npm run ratings:approve -- <n> "Nakuru, Kenya"   approve candidate n, with a place written by hand
//   npm run ratings:approve -- --remove a<number>    take an approved note down
import { pathToFileURL } from 'node:url';
import { TOOL_IDS } from '../src/lib/app/toolIds.ts';
import { envFromFile, parseEntries } from './ratings-read.mjs';

/** Mirrors NOTES_KEY in src/site-lib/pinnedNote.ts (a script cannot import TS; a test keeps them equal). */
export const NOTES_KEY = 'rating:notes';
const MAX_PLACE_LENGTH = 60;
/** Mirrors MAX_COMMENT_LENGTH in src/lib/telemetry/ratingSchema.ts, kept equal by the same test. */
export const MAX_COMMENT_LENGTH = 500;

/** Comments a person agreed to show and that are not yet notes, oldest first as the store keeps them, numbered from 1. */
export function candidates(entries, notes) {
  const taken = new Set(notes.map((n) => n.comment));
  return entries
    .filter((e) => e.share === true && typeof e.comment === 'string' && e.comment !== '')
    .map((e, i) => ({ ...e, n: i + 1 }))
    .filter((e) => !taken.has(e.comment));
}

/** Approved notes with their position in the raw list, so a number never shifts when another string is unreadable. */
export function approvedRows(noteStrings) {
  const rows = [];
  noteStrings.forEach((raw, i) => {
    const [note] = parseEntries([raw]);
    if (note) rows.push({ id: `a${i + 1}`, raw, note });
  });
  return rows;
}

/** The note exactly as it is stored and served. Refuses what parseNote would drop, so an approval never vanishes quietly. */
export function noteFrom(entry, place) {
  const p = String(place ?? '').trim();
  if (p === '') throw new Error('A place is needed, like "Nakuru, Kenya".');
  if ([...p].length > MAX_PLACE_LENGTH) throw new Error(`The place is over ${MAX_PLACE_LENGTH} characters.`);
  if (!TOOL_IDS.includes(entry.tool)) throw new Error(`Unknown tool "${entry.tool}".`);
  if (![1, 2, 3, 4, 5].includes(entry.stars)) throw new Error(`Stars must be 1 to 5, not ${entry.stars}.`);
  const words = typeof entry.comment === 'string' ? entry.comment : '';
  if (words.trim() === '' || [...words].length > MAX_COMMENT_LENGTH) throw new Error('The comment is empty or too long.');
  const country = /^[A-Z]{2}$/.test(entry.country ?? '') ? { country: entry.country } : {};
  const day = /^\d{4}-\d{2}-\d{2}$/.test(entry.day ?? '') ? { day: entry.day } : {};
  return { tool: entry.tool, stars: entry.stars, comment: words, place: p, ...country, ...day };
}

const USAGE = 'Usage:\n  npm run ratings:approve\n  npm run ratings:approve -- <n> "Nakuru, Kenya"\n  npm run ratings:approve -- --remove a<number>';
const where = (e) => (e.country ? `${e.country}${e.region ? `-${e.region}` : ''}` : 'unknown');

async function main() {
  const args = process.argv.slice(2);
  const remove = args[0] === '--remove' && /^a[1-9]\d*$/.test(args[1] ?? '') && args.length === 2;
  const approve = /^[1-9]\d*$/.test(args[0] ?? '') && args.length === 2;
  if (args.length > 0 && !remove && !approve) {
    console.error(USAGE);
    process.exit(1);
  }
  const env = { ...envFromFile(), ...process.env };
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error('Missing KV_REST_API_URL/KV_REST_API_TOKEN: run `vercel env pull .env.local` first.');
    process.exit(1);
  }
  const pipeline = async (commands) => {
    const res = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) {
      console.error(`Store answered ${res.status}`);
      process.exit(1);
    }
    return res.json();
  };
  const [entriesReply, notesReply] = await pipeline([['LRANGE', 'rating:entries', 0, -1], ['LRANGE', NOTES_KEY, 0, -1]]);
  const noteStrings = notesReply?.result ?? [];
  const notes = parseEntries(noteStrings);

  if (remove) {
    const target = approvedRows(noteStrings).find((r) => r.id === args[1])?.raw;
    if (target === undefined) {
      console.error(`No approved note ${args[1]}.`);
      process.exit(1);
    }
    await pipeline([['LREM', NOTES_KEY, 1, target]]);
    console.log(`Removed ${args[1]}. It leaves the site on the next deploy.`);
    return;
  }

  const list = candidates(parseEntries(entriesReply?.result), notes);
  if (approve) {
    const entry = list.find((c) => c.n === Number(args[0]));
    if (!entry) {
      console.error(`No candidate ${args[0]}.`);
      process.exit(1);
    }
    let note;
    try {
      note = noteFrom(entry, args[1]);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    await pipeline([['RPUSH', NOTES_KEY, JSON.stringify(note)]]);
    console.log(`Approved ${args[0]}. It shows on the next deploy.`);
    return;
  }

  console.log('Candidates');
  for (const c of list) console.log([c.n, c.day, c.tool, `${c.stars}★`, where(c), c.comment].join('  '));
  if (list.length === 0) console.log('(none waiting)');
  console.log('\nApproved');
  const rows = approvedRows(noteStrings);
  for (const r of rows) console.log([r.id, r.note.place, r.note.comment].join('  '));
  if (rows.length === 0) console.log('(none yet)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
