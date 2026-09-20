import { describe, expect, it } from 'vitest';
import { describeFormDetectionFailure } from './formDetectionDetail.ts';

/**
 * This is a privacy boundary before it is a formatter: whatever it returns is
 * shown to a person and pasted into a public GitHub issue (SignFeedbackButton).
 * The two halves of its contract are therefore tested as two separate promises
 * - that an engine error keeps enough detail to diagnose a device we cannot
 * reproduce, and that nothing a PDF library built out of a document can get
 * through at all.
 */
describe('describeFormDetectionFailure', () => {
  // The case this exists for: pdf.js is where every modern-API call in the
  // bundle lives, and an older WebKit missing one throws a TypeError whose
  // message names it. That name is the diagnosis.
  it('keeps the message of an engine error, which is the only thing that names a missing API', () => {
    const error = new TypeError("undefined is not an object (evaluating 'page.getOrInsertComputed')");
    expect(describeFormDetectionFailure(error))
      .toBe("TypeError: undefined is not an object (evaluating 'page.getOrInsertComputed')");
    expect(describeFormDetectionFailure(new ReferenceError('Promise.withResolvers is not defined')))
      .toBe('ReferenceError: Promise.withResolvers is not defined');
  });

  // A PDF library builds its messages out of the objects it choked on, so one
  // can quote a field's label, a line of the page, or the filename. The name
  // of the error is an identifier out of our own program text and is the most
  // that may survive.
  it('reduces anything a PDF library threw to its name, message and all', () => {
    const labelled = new Error('Expected instance of PDFDict, got (Full name: Jane Doe) from private-form.pdf');
    labelled.name = 'UnexpectedObjectTypeError';
    expect(describeFormDetectionFailure(labelled)).toBe('UnexpectedObjectTypeError');

    // pdf-lib subclasses Error without setting `name`, so the constructor is
    // the only thing left that says which failure it was.
    class MissingPDFHeaderError extends Error {}
    expect(describeFormDetectionFailure(new MissingPDFHeaderError('at byte 0 of secret-medical.pdf')))
      .toBe('MissingPDFHeaderError');
  });

  it('never lets document content through, whatever the error is called', () => {
    const content = 'Jane Doe, 12 Orchard Lane, passport 123456789';
    const cases: unknown[] = [
      Object.assign(new Error(content), { name: 'InvalidPDFException' }),
      Object.assign(new Error(content), { name: 'Error' }),
      new Error(content),
      content,
      { message: content },
      null,
    ];
    for (const error of cases) {
      const detail = describeFormDetectionFailure(error);
      expect(detail).not.toContain('Jane');
      expect(detail).not.toContain('passport');
      expect(detail).not.toContain('Orchard');
    }
  });

  it('answers with a plain string for anything that is not an Error at all', () => {
    expect(describeFormDetectionFailure(undefined)).toBe('Error');
    expect(describeFormDetectionFailure('boom')).toBe('Error');
  });

  it('refuses an error name that is not a plain identifier', () => {
    const error = new TypeError('x is not a function');
    Object.defineProperty(error, 'name', { value: 'PdfFailure: private-medical-record.pdf' });
    // Not an identifier, so it is not a name - and with the name gone the
    // message goes with it, since only the six engine names carry one.
    expect(describeFormDetectionFailure(error)).toBe('Error');
  });

  // Engine messages do not carry a stack, but an engine message is the one
  // path a message travels at all, so the two shapes content would arrive in
  // if one ever did - a path and a PDF name object - go by token.
  it('keeps the line a line, and drops any token shaped like a path or a name object', () => {
    const detail = describeFormDetectionFailure(new TypeError('first line\n  at Object.x (/home/someone/private.pdf:1:1)'));
    expect(detail.includes('\n')).toBe(false);
    expect(detail).toBe('TypeError: first line at Object.x ...');

    expect(describeFormDetectionFailure(new TypeError('cannot read /Full_Name of undefined')))
      .toBe('TypeError: cannot read ... of undefined');

    // ...without touching the one message this was all built to keep.
    expect(describeFormDetectionFailure(new TypeError("undefined is not an object (evaluating 'p.findLast')")))
      .toBe("TypeError: undefined is not an object (evaluating 'p.findLast')");
  });

  it('caps the message, so a long one cannot smuggle a document through', () => {
    const detail = describeFormDetectionFailure(new TypeError('x'.repeat(5_000)));
    expect(detail.length).toBe('TypeError: '.length + 200);
  });

  // Added after an adversarial pass on the landed sanitiser found three real
  // leaks: an engine message quotes the identifier it choked on, and
  // `obj[valueReadFromThePdf]` puts a field label in that exact position. All
  // three of these reached the prefilled public issue body before the quoted-run
  // rule was added, which is why they are pinned individually.
  it('keeps a quoted run only when it looks like code, not like somebody form', () => {
    expect(describeFormDetectionFailure(
      new TypeError("undefined is not an object (evaluating 'page.getOrInsertComputed')"),
    )).toBe("TypeError: undefined is not an object (evaluating 'page.getOrInsertComputed')");
  });

  it('redacts a field label an engine message quoted as a property name', () => {
    const line = describeFormDetectionFailure(
      new TypeError("Cannot read properties of undefined (reading 'Student Social Security Number')"),
    );
    expect(line).not.toContain('Social Security');
    expect(line).toBe("TypeError: Cannot read properties of undefined (reading '...')");
  });

  it('redacts a quoted line of page text, spaces and all', () => {
    const line = describeFormDetectionFailure(new TypeError("invalid argument 'Patient diagnosis: diabetes'"));
    expect(line).not.toContain('diabetes');
    expect(line).not.toContain('Patient');
  });

  it('drops a filename that survived its path being stripped', () => {
    const line = describeFormDetectionFailure(new TypeError('Failed to fetch module /home/me/tax return 2024.pdf'));
    expect(line).not.toContain('.pdf');
    expect(line).not.toContain('2024');
  });

  // The live iPhone report arrived as `TypeError: undefined is not a function
  // (near '...')` - the snippet redacted by the rule above, which was the one
  // token worth having. WebKit's `near` snippet is source text, so it stays.
  it("keeps WebKit's source snippet, which is the token a device report exists for", () => {
    expect(describeFormDetectionFailure(
      new TypeError("undefined is not a function (near 'e.getOrInsertComputed(t)')"),
    )).toBe("TypeError: undefined is not a function (near 'e.getOrInsertComputed(t)')");
  });

  it('still redacts a quoted run the moment it contains a space', () => {
    const line = describeFormDetectionFailure(new TypeError("undefined is not a function (near 'Full Name field')"));
    expect(line).not.toContain('Full Name');
  });

  // WebKit's `near '...'` snippet is raw source text, spaces and braces and all,
  // so the quoted-run guard will always redact it and the message alone cannot
  // say which call failed. The frame can, and it is a position in our own built
  // output rather than anything the thrower was holding.
  it('reports the top stack frame, which is what actually names the failing call', () => {
    const error = new TypeError("undefined is not a function (near '...')");
    error.stack = '@https://pdkef.com/_astro/formCells.DVroxVTl.js:4:11827\n@https://pdkef.com/_astro/PdfSignTool.js:1:2';
    expect(describeFormDetectionFailure(error)).toContain('[formCells.DVroxVTl.js:4:11827]');
  });

  it('takes nothing from a stack frame that is not a built asset', () => {
    const error = new TypeError('boom');
    error.stack = 'at /home/someone/private tax return.pdf:1:1';
    const line = describeFormDetectionFailure(error);
    expect(line).not.toContain('tax');
    expect(line).not.toContain('.pdf');
    expect(line).toBe('TypeError: boom');
  });
});
