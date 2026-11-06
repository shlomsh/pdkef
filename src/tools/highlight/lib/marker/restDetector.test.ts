import { describe, expect, it } from 'vitest';
import { REST, initialRest, nextTickAt, restReducer, type RestEvent, type RestState } from './restDetector.ts';

const run = (events: RestEvent[], s: RestState = initialRest) => events.reduce(restReducer, s);
const mv = (x: number, y: number, t: number, overId: string | null = 'a'): RestEvent => ({ type: 'move', x, y, t, overId });

describe('restDetector', () => {
  it('constants', () => expect(REST).toEqual({ awayPx: 12, stillPx: 3, restMs: 300 }));
  it('a move over a highlight starts a candidate', () => {
    expect(run([mv(10, 10, 5)]).candidate).toEqual({ id: 'a', x: 10, y: 10, since: 5 });
  });
  it('small moves keep the candidate; a larger move restarts it', () => {
    expect(run([mv(10, 10, 5), mv(12, 11, 50)]).candidate?.since).toBe(5);
    expect(run([mv(10, 10, 5), mv(20, 10, 50)]).candidate).toEqual({ id: 'a', x: 20, y: 10, since: 50 });
  });
  it('a different id restarts the candidate', () => {
    expect(run([mv(10, 10, 5), mv(10, 10, 9, 'b')]).candidate).toEqual({ id: 'b', x: 10, y: 10, since: 9 });
  });
  it('overId null clears the candidate', () => {
    expect(run([mv(10, 10, 5), mv(10, 10, 9, null)]).candidate).toBeNull();
  });
  it('tick rests after 300ms, once', () => {
    const s = run([mv(10, 10, 100)]);
    expect(restReducer(s, { type: 'tick', t: 399 }).rested).toBeNull();
    const o = restReducer(s, { type: 'tick', t: 400 });
    expect(o.rested).toBe('a');
    expect(restReducer(o, { type: 'tick', t: 500 })).toBe(o);
  });
  it('nextTickAt', () => {
    expect(nextTickAt(initialRest)).toBeNull();
    const s = run([mv(1, 1, 100)]);
    expect(nextTickAt(s)).toBe(400);
    expect(nextTickAt(restReducer(s, { type: 'tick', t: 400 }))).toBeNull();
  });
  it('strokeEnd blocks moves until 12px away', () => {
    let s = run([{ type: 'strokeEnd', x: 0, y: 0 }]);
    expect(s.blockedFrom).toEqual({ x: 0, y: 0 });
    s = run([mv(5, 5, 1), mv(12, 0, 2)], s);
    expect(s.blockedFrom).not.toBeNull();
    expect(s.candidate).toBeNull();
    s = run([mv(13, 0, 3)], s);
    expect(s.blockedFrom).toBeNull();
  });
  it('strokeEnd takes a rest away', () => {
    const rested = restReducer(run([mv(1, 1, 100)]), { type: 'tick', t: 400 });
    expect(restReducer(rested, { type: 'strokeEnd', x: 1, y: 1 }).rested).toBeNull();
  });
  it('strokeEnd clears the candidate', () => {
    expect(run([mv(1, 1, 1), { type: 'strokeEnd', x: 1, y: 1 }]).candidate).toBeNull();
  });
  it('leave clears candidate and rested; closed clears rested', () => {
    const o = run([mv(1, 1, 0), { type: 'tick', t: 300 }]);
    expect(o.rested).toBe('a');
    expect(restReducer(o, { type: 'closed' })).toMatchObject({ rested: null, candidate: null });
    expect(restReducer(o, { type: 'leave' })).toMatchObject({ rested: null, candidate: null });
  });
  it('small moves inside the rested mark keep it; leaving it clears it', () => {
    const r = run([mv(1, 1, 0), { type: 'tick', t: 300 }]);
    expect(run([mv(30, 1, 400)], r).rested).toBe('a');
    expect(run([mv(30, 1, 400, 'b')], r)).toMatchObject({ rested: null, candidate: { id: 'b' } });
    expect(run([mv(30, 1, 400, null)], r).rested).toBeNull();
  });
  it('a closed toolbar does not reopen under a resting pointer', () => {
    const open = run([mv(10, 10, 0), { type: 'tick', t: 300 }]);
    const closed = restReducer(open, { type: 'closed' });
    expect(restReducer(closed, { type: 'tick', t: 2300 }).rested).toBeNull();
    expect(nextTickAt(closed)).toBeNull();
    const again = run([mv(20, 10, 2800)], closed);
    expect(restReducer(again, { type: 'tick', t: 3100 }).rested).toBe('a');
  });
});
