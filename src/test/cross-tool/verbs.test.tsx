// @ts-nocheck - test-only, mirrors the other cross-tool specs' untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';

// Every tool's verb stage is aria-hidden decoration: no text, no style attribute (CSP). The glob finds
// each `src/tools/<tool>/verb/*Verb.tsx`, so a verb added later is held to the same three rules.
const modules = import.meta.glob('../../tools/*/verb/*Verb.tsx', { eager: true });
const verbs = Object.entries(modules).map(([path, mod]) => [path.split('/').pop().replace('.tsx', ''), mod.default]);

// A verb that takes props is mounted once per prop value.
const PROPS = { CompressVerb: [{ subject: 'page' }, { subject: 'photo' }] };

function mountAll(name, Verb) {
  return (PROPS[name] ?? [{}]).map((props) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Verb {...props} />, host));
    return host;
  });
}

describe('verb stages', () => {
  it('are discovered from every tool folder', () => {
    expect(verbs.length).toBeGreaterThan(0);
  });

  describe.each(verbs)('%s', (name, Verb) => {
    it('hides the whole stage from assistive tech', () => {
      for (const host of mountAll(name, Verb)) expect(host.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    });

    it('never carries a style attribute (CSP)', () => {
      for (const host of mountAll(name, Verb)) expect(host.querySelectorAll('[style]').length).toBe(0);
    });

    it('has no text', () => {
      for (const host of mountAll(name, Verb)) expect(host.textContent).toBe('');
    });
  });
});
