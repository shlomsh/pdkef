import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { useOutputNameOverride } from './useOutputNameOverride.ts';

type Api = ReturnType<typeof useOutputNameOverride>;

function mount(initial: File | null) {
  const container = document.createElement('div');
  let api!: Api;
  const Probe = ({ file }: { file: File | null }) => {
    api = useOutputNameOverride(file, { prefix: 'signed_' });
    return null;
  };
  const show = (file: File | null) => act(() => render(<Probe file={file} />, container));
  show(initial);
  return { get: () => api, show };
}

const pdf = (name: string) => new File(['x'], name, { type: 'application/pdf' });

describe('useOutputNameOverride', () => {
  it('starts as prefix plus the source name', () => {
    const h = mount(pdf('Lease.pdf'));
    expect(h.get().parts.fileName).toBe('signed_Lease.pdf');
  });

  it('a typed name wins; empty or the source name goes back to automatic', () => {
    const h = mount(pdf('Lease.pdf'));
    act(() => h.get().rename('Final'));
    expect(h.get().parts.fileName).toBe('signed_Final.pdf');
    act(() => h.get().rename(''));
    expect(h.get().parts.fileName).toBe('signed_Lease.pdf');
    act(() => h.get().rename('Final'));
    act(() => h.get().rename('Lease'));
    expect(h.get().customised).toBe(false);
  });

  it('opening a different file drops the typed name', () => {
    const h = mount(pdf('Lease.pdf'));
    act(() => h.get().rename('Final'));
    h.show(pdf('Other.pdf'));
    expect(h.get().parts.fileName).toBe('signed_Other.pdf');
  });

  it('a different File with the same name drops the typed name too', () => {
    const h = mount(pdf('Lease.pdf'));
    act(() => h.get().rename('Final'));
    h.show(pdf('Lease.pdf'));
    expect(h.get().parts.fileName).toBe('signed_Lease.pdf');
  });
});
