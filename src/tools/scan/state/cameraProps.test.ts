import { describe, expect, it, vi } from 'vitest';
import { newPage, resultKey } from '../lib/scanPages.ts';
import { cameraProps } from './cameraProps.ts';
import type { CameraMode } from './scanState.ts';
import type { ScanPage } from './scanWork.ts';

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const page = (preview: string): ScanPage => ({ ...newPage(file, 'document'), preview });

function setup(camera: CameraMode | null, pages: ScanPage[] = [page('first'), page('last')]) {
  const host = { dispatch: vi.fn(), addFiles: vi.fn(), retakePage: vi.fn(), removePage: vi.fn() };
  const [first, last] = pages;
  return { host, first, last, props: cameraProps({ camera, pages, results: {}, ...host }) };
}

describe('cameraProps', () => {
  it('is null while the camera is closed', () => {
    expect(setup(null).props).toBeNull();
  });

  it('counts the pages and shows the last one', () => {
    const { props } = setup({ mode: 'many' });
    expect(props?.count).toBe(2);
    expect(props?.lastSrc).toBe('last');
    expect(setup({ mode: 'many' }, []).props?.lastSrc).toBeNull();
  });

  it('shows the last page as it will download once its result is current', () => {
    const pages = [page('photo')];
    const [last] = pages;
    const result = (key: string) => ({ [last.id]: { key, url: 'made', thumbUrl: 'thumb', page: null } }) as unknown as Parameters<typeof cameraProps>[0]['results'];
    const props = (results: ReturnType<typeof result>) => cameraProps({ camera: { mode: 'many' }, pages, results, dispatch: vi.fn(), addFiles: vi.fn(), retakePage: vi.fn(), removePage: vi.fn() });
    expect(props(result(resultKey(last)))?.lastSrc).toBe('made');
    expect(props(result('stale'))?.lastSrc).toBe('photo');
  });

  it('many: each page taken joins the scan, and the camera stays open', () => {
    const { host, props } = setup({ mode: 'many' });
    props?.onTaken(file);
    expect(host.addFiles).toHaveBeenCalledWith([file]);
    expect(host.dispatch).not.toHaveBeenCalled();
  });

  it('one: the page taken replaces that page, then the camera closes', () => {
    const pages = [page('first'), page('last')];
    const { host, props } = setup({ mode: 'one', pageId: pages[0].id }, pages);
    props?.onTaken(file);
    expect(host.retakePage).toHaveBeenCalledWith(pages[0].id, file);
    expect(host.dispatch).toHaveBeenCalledWith({ type: 'cameraClosed' });
  });

  it('Retake in the review removes the last page', () => {
    const { host, last, props } = setup({ mode: 'many' });
    props?.onRetakeLast();
    expect(host.removePage).toHaveBeenCalledWith(last.id);
  });

  it('Fix the corners closes the camera and opens the last page at its corners', () => {
    const { host, last, props } = setup({ mode: 'many' });
    props?.onFixCorners();
    expect(host.dispatch.mock.calls.map(([e]) => e.type)).toEqual(['cameraClosed', 'pageOpened', 'cornersOpened']);
    expect(host.dispatch).toHaveBeenCalledWith({ type: 'pageOpened', id: last.id });
  });

  it('the native photos join the scan (many) or replace the page (one), and the camera closes', () => {
    const many = setup({ mode: 'many' });
    many.props?.onFallbackFiles([file, file]);
    expect(many.host.addFiles).toHaveBeenCalledWith([file, file]);
    expect(many.host.dispatch).toHaveBeenCalledWith({ type: 'cameraClosed' });
    const pages = [page('first')];
    const one = setup({ mode: 'one', pageId: pages[0].id }, pages);
    one.props?.onFallbackFiles([file]);
    expect(one.host.retakePage).toHaveBeenCalledWith(pages[0].id, file);
  });
});
