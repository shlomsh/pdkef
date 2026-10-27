import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import ResultPage from './ResultPage.tsx';

const LABELS = { exact: 'Exactly as it downloads', updating: 'Updating...', making: 'Making your page...' };
const A4 = { pageWidth: 600, pageHeight: 800 };

let container: HTMLElement | null = null;
function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<ResultPage labels={LABELS} exact={true} {...props} />, container!));
  return container;
}
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ResultPage', () => {
  it('places a centred landscape image in percentages, y measured from the bottom', () => {
    // 400x200 image centred on a 600x800 page: x=100, y=300 (from bottom).
    mount({ src: 'a.jpg', place: { ...A4, x: 100, y: 300, width: 400, height: 200 } });
    const img = container!.querySelector('img');
    expect(parseFloat(img.style.left)).toBeCloseTo(100 / 6, 4);
    expect(parseFloat(img.style.top)).toBeCloseTo(37.5, 4);
    expect(parseFloat(img.style.width)).toBeCloseTo(400 / 6, 4);
    expect(parseFloat(img.style.height)).toBeCloseTo(25, 4);
    expect(img.getAttribute('draggable')).toBe('false');
  });

  it('a Fit page fills 100%', () => {
    mount({ src: 'a.jpg', place: { ...A4, x: 0, y: 0, width: 600, height: 800 } });
    const img = container!.querySelector('img');
    expect(img.style.left).toBe('0%');
    expect(img.style.top).toBe('0%');
    expect(img.style.width).toBe('100%');
    expect(img.style.height).toBe('100%');
  });

  it('captions each state', () => {
    const place = { ...A4, x: 0, y: 0, width: 600, height: 800 };
    mount({ src: 'a.jpg', place, detail: 'A4 · 1021 KB' });
    const cap = container!.querySelector('figcaption');
    expect(cap.getAttribute('aria-live')).toBe('polite');
    expect(cap.textContent).toBe('Exactly as it downloads · A4 · 1021 KB');
    act(() => render(<ResultPage labels={LABELS} exact={true} src="a.jpg" place={place} />, container!));
    expect(container!.querySelector('figcaption').textContent).toBe('Exactly as it downloads');
    act(() => render(<ResultPage labels={LABELS} exact={false} src="a.jpg" place={place} detail="x" />, container!));
    expect(container!.querySelector('figcaption').textContent).toContain('Updating...');
    act(() => render(<ResultPage labels={LABELS} exact={false} src={null} place={null} />, container!));
    expect(container!.querySelector('figcaption').textContent).toBe('Making your page...');
  });

  it('toggles data-exact', () => {
    const place = { ...A4, x: 0, y: 0, width: 600, height: 800 };
    mount({ src: 'a.jpg', place, exact: true });
    expect(container!.querySelector('[data-exact]')).not.toBeNull();
    act(() => render(<ResultPage labels={LABELS} exact={false} src="a.jpg" place={place} />, container!));
    expect(container!.querySelector('[data-exact]')).toBeNull();
  });

  it('renders no img and A4 proportions without a src', () => {
    mount({ src: null, place: null, exact: false });
    expect(container!.querySelector('img')).toBeNull();
    const paper = container!.querySelector('[data-paper]');
    expect(paper.style.aspectRatio.replace(/\s/g, '')).toMatch(/^595\.28\/841\.89$/);
  });

  it('shows a working overlay on the page itself while updating, with no dimming', () => {
    const place = { ...A4, x: 0, y: 0, width: 600, height: 800 };
    mount({ src: 'a.jpg', place, exact: false });
    const paper = container!.querySelector('[data-paper]');
    expect(paper.hasAttribute('data-updating')).toBe(true);
    const overlay = paper.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toContain('Updating...');
    expect(container!.querySelector('img').className).not.toMatch(/stale/);
    act(() => render(<ResultPage labels={LABELS} exact={true} src="a.jpg" place={place} />, container!));
    expect(container!.querySelector('[data-updating]')).toBeNull();
    expect(container!.querySelector('[aria-hidden="true"]')).toBeNull();
    act(() => render(<ResultPage labels={LABELS} exact={false} src={null} place={null} />, container!));
    expect(container!.querySelector('[data-updating]')).toBeNull();
    expect(container!.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('says Updating once, on the page: the caption keeps it for screen readers only', () => {
    mount({ src: 'a.jpg', place: { ...A4, x: 0, y: 0, width: 600, height: 800 }, exact: false });
    const caption = container!.querySelector('figcaption');
    expect(caption.textContent).toContain(LABELS.updating);
    const visible = Array.from(caption.childNodes).filter((n) => !(n.nodeType === 1 && n.classList.contains('sr-only'))).map((n) => n.textContent).join('').trim();
    expect(visible).toBe('');
    expect(caption.getAttribute('aria-live')).toBe('polite');
  });
});
