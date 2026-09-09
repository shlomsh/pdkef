import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');
const homePage = readFileSync(resolve(process.cwd(), 'src/pages/index.astro'), 'utf8');

function token(source, name) {
  const match = source.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing literal colour token ${name}`);
  return match[1];
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const root = (name) => token(globalCss, name);
const home = (name) => token(homePage, name);

describe('Sea Glass contrast contracts', () => {
  it.each([
    '--color-surface',
    '--color-bg',
    '--color-primary-soft',
    '--color-primary-tint',
  ])(
    'keeps primary text AA-readable on %s',
    (background) => {
      expect(contrast(root('--color-primary-text'), root(background))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['--color-primary', '--color-primary-hover', '--color-primary-active'])(
    'keeps white button labels AA-readable on %s',
    (background) => {
      expect(contrast(root('--color-surface'), root(background))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    '--color-surface',
    '--color-bg',
    '--color-surface-sunken',
    '--color-primary-soft',
    '--color-primary-tint',
  ])('keeps the solid focus ring at non-text contrast on %s', (background) => {
    expect(contrast(root('--color-primary'), root(background))).toBeGreaterThanOrEqual(3);
    expect(globalCss).toMatch(/--shadow-focus:\s*[^;]*var\(--color-primary\)/);
  });

  it.each([
    '--color-surface',
    '--color-bg',
    '--color-surface-sunken',
    '--color-primary-soft',
    '--color-primary-tint',
  ])(
    'keeps muted body text AA-readable on %s',
    (background) => {
      expect(contrast(root('--color-muted'), root(background))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps the refreshed homepage foregrounds AA-readable on its aqua field', () => {
    const background = home('--home-workspace');
    expect(contrast(root('--color-primary-text'), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(root('--color-annotation'), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(home('--color-text'), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(home('--color-muted'), background)).toBeGreaterThanOrEqual(4.5);
  });
});
