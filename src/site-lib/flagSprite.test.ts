import { describe, expect, it } from 'vitest';
import { flagSprite } from './flagSprite';

const flag = (code: string, body: string, viewBox = '0 0 513 342') => ({
  code,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`,
});
const rect = '<path fill="#f00" d="M0 0h513v342H0z"/>';

const cells = (svg: string) => [...svg.matchAll(/<svg x="([\d.]+)" y="0" width="513" height="342" viewBox="([^"]*)">/g)];
const views = (svg: string) => [...svg.matchAll(/<view id="([^"]+)" viewBox="([\d.]+) 0 513 342"\/>/g)];

describe('flagSprite', () => {
  it('puts each flag in its own nested cell and gives it a view, and the cells never overlap', () => {
    const svg = flagSprite([flag('IN', rect), flag('KE', rect), flag('US', rect)]);
    expect(cells(svg)).toHaveLength(3);
    const v = views(svg);
    expect(v.map((m) => m[1])).toEqual(['IN', 'KE', 'US']);
    const xs = v.map((m) => Number(m[2]));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] + 513);
    expect(cells(svg).map((m) => Number(m[1]))).toEqual(xs);
  });

  it('keeps the children of a flag verbatim and drops its outer wrapper', () => {
    const svg = flagSprite([flag('IN', rect)]);
    expect(svg).toContain(rect);
    expect(svg.match(/<svg\b/g)).toHaveLength(2); // the sprite and the one cell
    expect(svg.match(/xmlns="http/g)).toHaveLength(1);
  });

  it('uses a flag own viewBox when it is not 0 0 513 342', () => {
    const svg = flagSprite([flag('ES', rect, '0 0 22.5 15'), flag('IN', rect)]);
    expect(cells(svg).map((m) => m[2])).toEqual(['0 0 22.5 15', '0 0 513 342']);
    expect(views(svg).map((m) => m[1])).toEqual(['ES', 'IN']);
  });

  it('prefixes internal ids and rewrites every reference, so two flags with one gradient id stay apart', () => {
    const body = '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><clipPath id="c"><rect width="9" height="9"/></clipPath></defs><path fill="url(#g)" clip-path="url(#c)" d="M0 0h1v1z"/><use href="#c"/><use xlink:href="#g"/>';
    const svg = flagSprite([flag('AA', body), flag('BB', body)]);
    for (const code of ['AA', 'BB']) {
      expect(svg).toContain(`id="${code}-g"`);
      expect(svg).toContain(`id="${code}-c"`);
      expect(svg).toContain(`fill="url(#${code}-g)"`);
      expect(svg).toContain(`clip-path="url(#${code}-c)"`);
      expect(svg).toContain(`href="#${code}-c"`);
      expect(svg).toContain(`xlink:href="#${code}-g"`);
    }
    expect(svg).not.toMatch(/id="[gc]"/);
    expect(svg).not.toMatch(/url\(#[gc]\)/);
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not touch a reference to an id the flag does not define', () => {
    const svg = flagSprite([flag('AA', '<path fill="url(#elsewhere)" d="M0 0z"/>')]);
    expect(svg).toContain('url(#elsewhere)');
  });

  it('is a valid empty svg with no flags', () => {
    const svg = flagSprite([]);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*><\/svg>$/);
    expect(cells(svg)).toHaveLength(0);
  });

  it('is sorted by code and stable whatever order the flags arrive in, and a code is placed once', () => {
    const a = flagSprite([flag('US', rect), flag('IN', rect), flag('KE', rect)]);
    const b = flagSprite([flag('KE', rect), flag('IN', rect), flag('US', rect), flag('IN', rect)]);
    expect(a).toBe(b);
    expect(views(a).map((m) => m[1])).toEqual(['IN', 'KE', 'US']);
  });

  it('refuses a code that could not be an id, and a file that is not an svg', () => {
    expect(() => flagSprite([flag('A"B', rect)])).toThrow(/code/);
    expect(() => flagSprite([{ code: 'IN', svg: '<html></html>' }])).toThrow(/svg/);
  });
});
