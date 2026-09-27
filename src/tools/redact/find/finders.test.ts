import { describe, expect, it } from 'vitest';
import { foldForSearch, PRESET_FINDERS, termFinder } from './finders.ts';
import type { TextRange } from './types.ts';

/** The range of `needle`'s first occurrence in `text`, for asserting exact matches. */
function at(text: string, needle: string): TextRange {
  const start = text.indexOf(needle);
  if (start === -1) throw new Error(`fixture bug: ${JSON.stringify(needle)} not found in ${JSON.stringify(text)}`);
  return { start, end: start + needle.length };
}

describe('foldForSearch', () => {
  it('case-folds Latin text', () => {
    expect(foldForSearch('Jane DOE').folded).toBe('jane doe');
  });

  it('drops Hebrew niqqud but keeps the letters', () => {
    const { folded } = foldForSearch('שָׁלוֹם');
    expect(folded).toBe('שלום');
  });

  it('keeps maqaf and sof pasuq, which are punctuation, not points', () => {
    const { folded } = foldForSearch('א־ב׃');
    expect(folded).toBe('א־ב׃');
  });

  it('drops Arabic harakat', () => {
    const { folded } = foldForSearch('مَرْحَبًا');
    expect(folded).toBe(foldForSearch('مرحبا').folded);
  });

  it('drops zero-width marks and soft hyphens', () => {
    const { folded } = foldForSearch('a​b­c﻿d');
    expect(folded).toBe('abcd');
  });

  it('collapses any whitespace run, including a line break, to one space', () => {
    expect(foldForSearch('a\n\n  \tb').folded).toBe('a b');
    expect(foldForSearch('a  b').folded).toBe('a b');
  });

  it('unifies dash variants to a plain hyphen', () => {
    expect(foldForSearch('03–12345').folded).toBe('03-12345');
    expect(foldForSearch('a−b').folded).toBe('a-b');
  });

  it('straightens curly quotes', () => {
    expect(foldForSearch('“Hi” ‘there’').folded).toBe('"hi" \'there\'');
  });

  it('toRaw maps every folded index back to where that character started, and its last entry is text.length', () => {
    const text = 'a​B c';
    const { folded, toRaw } = foldForSearch(text);
    expect(folded).toBe('ab c');
    expect(toRaw).toHaveLength(folded.length + 1);
    expect(toRaw[0]).toBe(0); // 'a'
    expect(toRaw[1]).toBe(2); // 'B' (raw index 1 is the dropped zero-width char)
    expect(toRaw[2]).toBe(3); // ' '
    expect(toRaw[3]).toBe(4); // 'c'
    expect(toRaw[4]).toBe(text.length);
  });
});

describe('termFinder', () => {
  it('matches case-insensitively in Latin text', () => {
    const text = 'Please call JANE DOE about it.';
    expect(termFinder('jane doe')(text)).toEqual([at(text, 'JANE DOE')]);
  });

  it('matches a term without niqqud against text that has it', () => {
    const text = 'קראתי בַּסֵּפֶר אתמול';
    const matches = termFinder('בספר')(text);
    expect(matches).toEqual([at(text, 'בַּסֵּפֶר')]);
  });

  it('matches across a line break where the term has a plain space', () => {
    const text = 'Signed by Jane\nDoe on Monday';
    const matches = termFinder('Jane Doe')(text);
    expect(matches).toEqual([{ start: text.indexOf('Jane'), end: text.indexOf('Doe') + 'Doe'.length }]);
  });

  it('finds one non-overlapping match, not two, for an overlapping candidate', () => {
    expect(termFinder('aaa')('aaaa')).toEqual([{ start: 0, end: 3 }]);
  });

  it('matches a dash variant in the text against a plain hyphen in the term', () => {
    const text = 'ref no. 03–12345 here';
    expect(termFinder('03-12345')(text)).toEqual([at(text, '03–12345')]);
  });

  it('extends the match end over trailing marks that belong to the last matched letter', () => {
    const text = 'הבא שָׁלוֹם עכשיו';
    const matches = termFinder('שלום')(text);
    expect(matches).toEqual([at(text, 'שָׁלוֹם')]);
  });

  it('finds nothing for an empty or whitespace-only term', () => {
    expect(termFinder('')('anything here')).toEqual([]);
    expect(termFinder('   ')('anything here')).toEqual([]);
  });

  it('finds multiple non-overlapping occurrences left to right', () => {
    const text = 'cat sat cat mat cat';
    const matches = termFinder('cat')(text);
    expect(matches).toHaveLength(3);
    expect(matches.map((r) => text.slice(r.start, r.end))).toEqual(['cat', 'cat', 'cat']);
  });
});

describe('PRESET_FINDERS.email', () => {
  const finder = PRESET_FINDERS.email;

  const positives = [
    ['contact: jane.doe@example.com please', 'jane.doe@example.com'],
    ['write to bob+redact@sub.example.co.uk now', 'bob+redact@sub.example.co.uk'],
    ['שלח מייל ל office@company.org היום', 'office@company.org'],
    ['a.b_c%1@my-domain.io', 'a.b_c%1@my-domain.io'],
    ['<user123@test-mail.net>', 'user123@test-mail.net'],
    ['פנייה בדוא"ל: hello@world.travel בבקשה', 'hello@world.travel'],
    ["it's o'brien@place.com right there", "o'brien@place.com"],
    ['single contact here: first@one.com please', 'first@one.com'],
    ['no.dots.here@a.b.c.d.io', 'no.dots.here@a.b.c.d.io'],
    ['(admin@localhost.dev)', 'admin@localhost.dev'],
    ['ת.ז ופרטים: reply-here@my.museum ok', 'reply-here@my.museum'],
    ['UPPER@EXAMPLE.COM works too', 'UPPER@EXAMPLE.COM'],
  ] as const;

  const negatives = [
    'no email address in this sentence at all',
    'almost@ but not quite',
    '@missing-local-part.com',
    'user@',
    'טקסט רגיל בלי כתובת מייל',
    'price is $5 @ store, not an email',
    'user@domain (no dot after domain)',
    'call 03-1234567 instead of emailing',
  ];

  it.each(positives)('finds the email in %j', (text, expected) => {
    expect(finder(text)).toEqual([at(text, expected)]);
  });

  it.each(negatives)('finds nothing in %j', (text) => {
    expect(finder(text)).toEqual([]);
  });
});

describe('PRESET_FINDERS.phone', () => {
  const finder = PRESET_FINDERS.phone;

  const positives = [
    ['טלפון: 03-1234567 בבקשה', '03-1234567'],
    ['call me at +1 (415) 555-2671 today', '+1 (415) 555-2671'],
    ['נייד 050-1234567 זמין', '050-1234567'],
    ['office line 02.123.4567 ext', '02.123.4567'],
    ['international +44 20 7946 0958 line', '+44 20 7946 0958'],
    ['mobile: 0501234567 direct', '0501234567'],
    ['fax +972-3-1234567 works', '+972-3-1234567'],
    ['תתקשרו ל 03 123 4567 בבוקר', '03 123 4567'],
    ['reach us (03) 123-4567 anytime', '(03) 123-4567'],
    ['us number 415-555-2671 ok', '415-555-2671'],
    ['פקס: 077-9998877 קבוע', '077-9998877'],
    ['dial +1-800-555-0199 free', '+1-800-555-0199'],
  ] as const;

  const negatives = [
    'meeting is on 2024-09-27 at noon',
    'born on 27/09/2024 exactly',
    'no phone number mentioned here',
    'טקסט ללא מספר טלפון בכלל',
    'order number 12',
    'code A1-B2 is not a phone',
    'invoice date 2024.09.27 listed',
    'just the digits 12345 alone',
  ];

  it.each(positives)('finds the phone in %j', (text, expected) => {
    expect(finder(text)).toEqual([at(text, expected)]);
  });

  it.each(negatives)('finds nothing in %j', (text) => {
    expect(finder(text)).toEqual([]);
  });
});

describe('PRESET_FINDERS.idNumber', () => {
  const finder = PRESET_FINDERS.idNumber;

  const positives = [
    ['ת.ז. 123456782 מצורף', '123456782'],
    ['ssn 123-45-6789 on file', '123-45-6789'],
    ['card 4111 1111 1111 1111 charged', '4111 1111 1111 1111'],
    ['תעודת זהות: 987654321 שלי', '987654321'],
    ['account 12345678 opened', '12345678'],
    ['id number 1234567890123456789 max', '1234567890123456789'],
    ['grouped 1234-5678-9012 code', '1234-5678-9012'],
    ['מספר זהות 111222333 רשום', '111222333'],
    ['reference 22334455 stored', '22334455'],
    ['card number 5500 0000 0000 0004 here', '5500 0000 0000 0004'],
    ['תז לקוח 456789123 נשלח', '456789123'],
    ['batch 987 654 321 done', '987 654 321'],
  ] as const;

  const negatives = [
    'ref number 1234567 only seven digits',
    'too long abc12345678901234567890def to count',
    'order AB123456789 has letters attached',
    'טקסט בלי שום מספר זהות כלל',
    'small code 12 34 not enough digits',
    'year 2024 alone is short',
    'phone-like 03-1234567 has only nine digits total',
    'version v1.2.3 build 45 not an id',
  ];

  it.each(positives)('finds the id in %j', (text, expected) => {
    expect(finder(text)).toEqual([at(text, expected)]);
  });

  it.each(negatives)('finds nothing in %j', (text) => {
    expect(finder(text)).toEqual([]);
  });
});
