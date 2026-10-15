import { describe, expect, it } from 'vitest';
import { createReplayer, isHover, type AnimationLike } from './replay';

// jsdom has no Web Animations, so these are fakes that log what the helper asks of them.
function fake(log: string[], name: string) {
  let finish!: () => void;
  const a = {
    playbackRate: 1,
    currentTime: 500 as number | null,
    playState: 'finished' as string,
    finished: Promise.resolve() as Promise<unknown>,
    updatePlaybackRate(r: number) {
      a.playbackRate = r;
      log.push(`${name}:rate ${r}`);
    },
    play() {
      log.push(`${name}:play`);
      a.playState = 'running';
      a.finished = new Promise<void>((res) => {
        finish = () => {
          a.playState = 'finished';
          res();
        };
      });
    },
  };
  return { a: a as AnimationLike, end: () => finish() };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createReplayer', () => {
  it('rewinds every animation at a negative rate and plays forward only after all finished', async () => {
    const log: string[] = [];
    const x = fake(log, 'x');
    const y = fake(log, 'y');
    const replay = createReplayer(() => [x.a, y.a]);
    replay();
    expect(log).toEqual(['x:rate -2', 'x:play', 'y:rate -2', 'y:play']);
    x.end();
    await tick();
    expect(log).toHaveLength(4);
    y.end();
    await tick();
    expect(log.slice(4)).toEqual(['x:rate 1', 'x:play', 'y:rate 1', 'y:play']);
  });

  it('ignores a second trigger while a rewind or the forward play is running', async () => {
    const log: string[] = [];
    const x = fake(log, 'x');
    const replay = createReplayer(() => [x.a]);
    replay();
    replay();
    expect(log).toEqual(['x:rate -2', 'x:play']);
    x.end();
    await tick();
    replay();
    expect(log).toEqual(['x:rate -2', 'x:play', 'x:rate 1', 'x:play']);
    x.end();
    await tick();
    replay();
    expect(log).toHaveLength(6);
  });

  it('does nothing with no animations, or while one is still playing on load', () => {
    const log: string[] = [];
    createReplayer(() => [])();
    const x = fake(log, 'x');
    x.a.playState = 'running';
    createReplayer(() => [x.a])();
    expect(log).toEqual([]);
  });
});

describe('isHover', () => {
  it('ignores touch, accepts mouse and pen', () => {
    expect(isHover({ pointerType: 'touch' })).toBe(false);
    expect(isHover({ pointerType: 'mouse' })).toBe(true);
    expect(isHover({ pointerType: 'pen' })).toBe(true);
  });
});
