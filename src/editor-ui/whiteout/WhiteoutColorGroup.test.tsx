import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WhiteoutColorGroup from './WhiteoutColorGroup.tsx';

const labels = {
  group: 'צבע הטיפקס', auto: 'אוטומטי', autoTitle: 'התאמה לדף סביב התיבה',
  pipette: 'בחירת צבע מהדף', useColorTemplate: 'שימוש ב-{color}', customColor: 'בחירת צבע אחר',
};

let host: HTMLDivElement | null = null;

afterEach(() => {
  const h = host;
  if (h) { act(() => render(null, h)); h.remove(); host = null; }
});

function mount(props: Partial<Parameters<typeof WhiteoutColorGroup>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const fns = { onToggleEyedropper: vi.fn(), onMatchPage: vi.fn(), onPickColor: vi.fn(), paintPreview: vi.fn() };
  const h = host;
  act(() => {
    render(<WhiteoutColorGroup labels={labels} color="#f7f1de" auto={false} eyedropping={false} {...fns} {...props} />, h);
  });
  return { host: h, ...fns };
}

describe('WhiteoutColorGroup', () => {
  it('renders exactly the labels it is given', () => {
    const m = mount({ recentColors: ['#112233'] });
    expect(m.host.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe(labels.group);
    const auto = m.host.querySelector('[data-whiteout-color-auto]')!;
    expect(auto.textContent).toBe(labels.auto);
    expect(auto.getAttribute('title')).toBe(labels.autoTitle);
    const pipette = m.host.querySelector('[data-whiteout-color-eyedropper]')!;
    expect(pipette.getAttribute('aria-label')).toBe(labels.pipette);
    expect(m.host.querySelector('[data-whiteout-color-recent="#112233"]')!.getAttribute('aria-label')).toBe('שימוש ב-#112233');
    expect(m.host.querySelector('[data-whiteout-color-custom]')!.getAttribute('title')).toBe(labels.customColor);
    expect(m.host.querySelector('input[type="color"]')!.getAttribute('aria-label')).toBe(labels.customColor);
  });

  it('calls onMatchPage from Auto and onToggleEyedropper from the pipette', async () => {
    const m = mount();
    await act(async () => { (m.host.querySelector('[data-whiteout-color-auto]') as HTMLElement).click(); });
    expect(m.onMatchPage).toHaveBeenCalledTimes(1);
    await act(async () => { (m.host.querySelector('[data-whiteout-color-eyedropper]') as HTMLElement).click(); });
    expect(m.onToggleEyedropper).toHaveBeenCalledTimes(1);
  });

  it('renders the current colour first then the recents, and picks one on click', async () => {
    const m = mount({ recentColors: ['#112233', '#F7F1DE'] });
    const chips = Array.from(m.host.querySelectorAll('[data-whiteout-color-recent]')).map((e) => e.getAttribute('data-whiteout-color-recent'));
    expect(chips).toEqual(['#f7f1de', '#112233']);
    await act(async () => { (m.host.querySelector('[data-whiteout-color-recent="#112233"]') as HTMLElement).click(); });
    expect(m.onPickColor).toHaveBeenCalledWith('#112233');
  });

  it('previews through paintPreview on input without committing', () => {
    const m = mount();
    const input = m.host.querySelector('input[type="color"]') as HTMLInputElement;
    act(() => { input.value = '#abcdef'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(m.paintPreview).toHaveBeenCalledWith('#abcdef');
    expect(m.onPickColor).not.toHaveBeenCalled();
  });
});
