import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlurStrengthSlider from './BlurStrengthSlider.tsx';
import RedactBoxToolbar from './RedactBoxToolbar.tsx';

/**
 * The Redact island loads preact/compat (astro.config.mjs: preact({ compat: true })).
 * For range and colour inputs compat rewrites a JSX `onChange` to the `input` event,
 * which fires on every drag step. Code that assumed `onChange` meant "released" or
 * "picker closed" shipped twice. The fix is useNativeChange(ref, cb), which listens to
 * the real `change` event. This file guards both the behaviour and the source.
 */

let host: HTMLDivElement | null = null;

afterEach(() => {
  const h = host;
  if (h) { act(() => render(null, h)); h.remove(); host = null; }
  document.body.innerHTML = '';
});

function mount(vnode: any) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const h = host;
  act(() => render(vnode, h));
  return h;
}

const fire = (el: Element, type: string) => act(() => { el.dispatchEvent(new Event(type, { bubbles: true })); });

describe('compat is active in this test', () => {
  it('maps onChange on a range input to the input event, as in production', () => {
    // If this fails, the cases below prove nothing: the test is no longer under the production rewrite.
    const spy = vi.fn();
    const h = mount(<input type="range" onChange={spy} />);
    fire(h.querySelector('input')!, 'input');
    expect(spy).toHaveBeenCalled();
  });
});

describe('range and colour commits under compat', () => {
  it('BlurStrengthSlider commits once on change, never on input', () => {
    const spy = vi.fn();
    const h = mount(
      <BlurStrengthSlider elementId="b" value={0.3} onChange={spy} labels={{ title: 'Blur strength', lighter: 'Lighter', stronger: 'Stronger' }} />,
    );
    const input = h.querySelector('[data-editor-blur-strength-input]') as HTMLInputElement;
    for (const v of ['0.4', '0.5', '0.6']) { input.value = v; fire(input, 'input'); }
    expect(spy).not.toHaveBeenCalled();
    fire(input, 'change');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('RedactBoxToolbar colour picker commits once on change, never on input', () => {
    const element = { id: 'w', type: 'whiteout', color: '#ffffff', colorMode: 'auto', left: 10, top: 10, width: 20, height: 10, pageIndex: 0 } as any;
    const fns = {
      onToggleEyedropper: vi.fn(), onMatchPage: vi.fn(), onPickColor: vi.fn(), onChangeStrength: vi.fn(),
      onDuplicate: vi.fn(), onDelete: vi.fn(), onRemoveGroup: vi.fn(), onRemoveFindSet: vi.fn(),
    };
    const h = mount(<RedactBoxToolbar element={element} eyedropping={false} {...fns} />);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    input.value = '#111111'; fire(input, 'input');
    input.value = '#222222'; fire(input, 'input');
    expect(fns.onPickColor).not.toHaveBeenCalled();
    fire(input, 'change');
    expect(fns.onPickColor).toHaveBeenCalledTimes(1);
    expect(fns.onPickColor).toHaveBeenCalledWith('#222222');
  });
});

/**
 * Returns the source text of every `<input ...>` JSX element that is a range or colour
 * input carrying an `onChange=` prop. Walks each element honouring `{}` depth and quotes,
 * so arrow functions (`=>`) inside props do not end the element early.
 */
export function findCompatOnChangeInputs(source: string): string[] {
  const found: string[] = [];
  const open = /<input(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(source))) {
    let depth = 0;
    let quote = '';
    let i = m.index + 6;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) { if (c === quote && source[i - 1] !== '\\') quote = ''; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const el = source.slice(m.index, i + 1);
    if (/\btype=(?:"(?:range|color)"|'(?:range|color)'|\{\s*['"`](?:range|color)['"`]\s*\})/.test(el) && /\bonChange=/.test(el)) found.push(el);
  }
  return found;
}

describe('static scan: no onChange on range or colour inputs', () => {
  it('the matcher flags an offending element and passes a clean one', () => {
    const bad = `<input\n  type="range"\n  onChange={(e) => go(e)}\n/>`;
    const clean = `<input type="range" ref={ref} onInput={(e) => paint(e.currentTarget)} /><input type="text" onChange={f} />`;
    expect(findCompatOnChangeInputs(bad)).toHaveLength(1);
    expect(findCompatOnChangeInputs(clean)).toEqual([]);
  });

  it('no non-test .tsx under src/tools/redact uses it', () => {
    const dir = 'src/tools/redact/'; // vitest runs from the repo root
    const offenders: string[] = [];
    for (const f of readdirSync(dir) as string[]) {
      if (!f.endsWith('.tsx') || /\.test\.tsx$/.test(f)) continue;
      const hits = findCompatOnChangeInputs(readFileSync(dir + f, 'utf8'));
      if (hits.length) offenders.push(`${f}: ${hits.length} range/color <input> with onChange`);
    }
    expect(
      offenders,
      `preact/compat turns onChange on range/color inputs into the per-drag-step input event. Use useNativeChange (src/tools/redact/useNativeChange.ts) instead.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
