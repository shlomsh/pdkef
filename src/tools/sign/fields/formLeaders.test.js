import { describe, expect, it } from 'vitest';
import { detectLeaderCandidates, leaderKind } from './formLeaders.js';

// A run's dot advance falls back to 0.3 of its height when the page has no pure-dot run of its own,
// so height 4 gives 1.2 per dot and the other characters share what is left of the width.
const run = (str, { left = 10, top = 20, width, height = 4 }) => ({ str, left, top, width, height });
const dots = (n) => '.'.repeat(n);

describe('detectLeaderCandidates', () => {
  it('finds a label and its dots as one text field, starting where the dots do', () => {
    // 'Name' is 4 characters of 2 each, then 10 dots of 1.2: 20 wide.
    const [field, ...rest] = detectLeaderCandidates(0, [run(`Name${dots(10)}`, { width: 20 })]);
    expect(rest).toEqual([]);
    expect(field).toMatchObject({ kind: 'text', label: 'Name', pageIndex: 0, source: 'form-leaders' });
    expect(field.left).toBeCloseTo(18, 5);
    expect(field.width).toBeCloseTo(12, 5);
    expect(field.top).toBe(20);
    expect(field.height).toBe(4);
  });

  it('reads the kind off the label', () => {
    expect(leaderKind('ลงชื่อ')).toBe('signature');
    expect(leaderKind('Signature')).toBe('signature');
    expect(leaderKind('ชำระเงินวันที่')).toBe('date');
    expect(leaderKind('เดือน')).toBe('date');
    expect(leaderKind('Date of birth')).toBe('date');
    expect(leaderKind('ชื่อ')).toBe('text');
    expect(leaderKind('')).toBe('text');
  });

  it('finds every leader in a run that carries several labels', () => {
    const fields = detectLeaderCandidates(0, [run(`Zip${dots(8)}Phone${dots(8)}`, { width: 40 })]);
    expect(fields.map((field) => field.label)).toEqual(['Zip', 'Phone']);
    expect(fields[0].left).toBeLessThan(fields[1].left);
  });

  it('takes a label from the run to the left when the leader starts its own run', () => {
    const [field] = detectLeaderCandidates(0, [
      run('Signature', { left: 5, width: 16 }),
      run(dots(12), { left: 22, width: 14.4 }),
    ]);
    expect(field).toMatchObject({ kind: 'signature', label: 'Signature' });
  });

  it('ignores an ellipsis and a leader too short to write in', () => {
    expect(detectLeaderCandidates(0, [run('Wait...', { width: 12 })])).toEqual([]);
    // Five dots of a 1-high font are 1.5 wide: too short to write in.
    expect(detectLeaderCandidates(0, [run(`Id${dots(5)}`, { width: 3, height: 1 })])).toEqual([]);
  });

  it('reads a leader that runs into a page number as a table of contents, not a field', () => {
    expect(detectLeaderCandidates(0, [run(`Introduction${dots(20)} 12`, { width: 60 })])).toEqual([]);
    expect(detectLeaderCandidates(0, [run(`บทนำ${dots(20)} ๑๒`, { width: 60 })])).toEqual([]);
    // The number may be its own run, as a right-aligned page number usually is.
    expect(detectLeaderCandidates(0, [
      run(`Introduction${dots(20)}`, { width: 50 }),
      run('12', { left: 62, width: 4 }),
    ])).toEqual([]);
  });

  it('keeps a leader that a unit or word follows', () => {
    const fields = detectLeaderCandidates(0, [run(`จำนวน${dots(20)}แผ่น`, { width: 50 })]);
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('จำนวน');
  });

  it('joins a dots-only line under a field, aligned with its label, into one taller field', () => {
    const [field, ...rest] = detectLeaderCandidates(0, [
      run(`Address${dots(30)}`, { left: 10, top: 20, width: 50 }),
      run(dots(40), { left: 10, top: 25, width: 48 }),
    ]);
    expect(rest).toEqual([]);
    expect(field.left).toBeCloseTo(10, 5);
    expect(field.top).toBe(20);
    expect(field.top + field.height).toBeCloseTo(29, 5);
  });

  it('does not join a dots-only line that sits far below', () => {
    const fields = detectLeaderCandidates(0, [
      run(`Address${dots(30)}`, { left: 10, top: 20, width: 50 }),
      run(dots(40), { left: 10, top: 60, width: 48 }),
    ]);
    expect(fields).toHaveLength(2);
  });

  it('joins a leader carried into the next run on the same line', () => {
    const [field, ...rest] = detectLeaderCandidates(0, [
      run(`Sign${dots(10)}`, { left: 10, width: 20 }),
      run(dots(10), { left: 30, width: 12 }),
    ]);
    expect(rest).toEqual([]);
    expect(field.left + field.width).toBeCloseTo(42, 5);
  });

  it('keeps a joined field whose last run is too short to count on its own', () => {
    // The first run's leader is 1.5 wide on its own, under the minimum; the run it carries into
    // makes the field 10.5 wide.
    const [field, ...rest] = detectLeaderCandidates(0, [
      run(`(${dots(5)}`, { left: 10, width: 3, height: 1 }),
      run(dots(30), { left: 13, width: 9, height: 1 }),
    ]);
    expect(rest).toEqual([]);
    expect(field.left + field.width).toBeCloseTo(22, 5);
    expect(field.width).toBeGreaterThan(3);
  });

  it('drops a field another detector already published', () => {
    const runs = [run(`Name${dots(10)}`, { width: 20 })];
    const taken = [{ left: 15, top: 19, width: 20, height: 6 }];
    expect(detectLeaderCandidates(0, runs, taken)).toEqual([]);
  });

  it('calibrates the dot advance from the page\'s own dots-only runs', () => {
    // A pure-dot run says each dot is 2 wide (24 over 12), so 'Id' + 10 dots in a 24-wide run puts
    // the leader 20 wide, not the 12 the 0.3-of-height fallback would give.
    const fields = detectLeaderCandidates(0, [
      run(dots(12), { left: 50, top: 60, width: 24 }),
      run(`Id${dots(10)}`, { left: 10, width: 24 }),
    ]);
    const field = fields.find((found) => found.label === 'Id');
    expect(field.width).toBeCloseTo(20, 5);
  });
});
