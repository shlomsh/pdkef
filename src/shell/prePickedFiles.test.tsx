import { hydrate, render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { takeInputFiles, useAdoptPrePickedFiles } from './prePickedFiles.ts';
import { setInputFiles } from '../test/support/setInputFiles.js';

function Picker({ onFiles, ready = true }: { onFiles: (files: File[]) => void; ready?: boolean }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useAdoptPrePickedFiles(ref, onFiles, ready);
  return <input ref={ref} type="file" />;
}

const pdf = (name: string) => new File([''], name, { type: 'application/pdf' });

describe('pre-picked files', () => {
  let container: HTMLElement;
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  // The page ships the input as markup; the file is chosen into it before any script runs.
  function serveInputWith(files: File[]) {
    container = document.createElement('div');
    container.innerHTML = '<input type="file">';
    document.body.appendChild(container);
    const served = container.querySelector('input') as HTMLInputElement;
    if (files.length) setInputFiles(served, files);
    return served;
  }

  it('hands over a file chosen before hydration, and empties the input', () => {
    const served = serveInputWith([pdf('early.pdf')]);
    const onFiles = vi.fn();
    act(() => hydrate(<Picker onFiles={onFiles} />, container));
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['early.pdf']);
    expect(container.querySelector('input')).toBe(served);
    expect(served.value).toBe('');
  });

  it('does nothing when no file was chosen early', () => {
    serveInputWith([]);
    const onFiles = vi.fn();
    act(() => hydrate(<Picker onFiles={onFiles} />, container));
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('waits for ready and reads only once', () => {
    serveInputWith([pdf('early.pdf')]);
    const onFiles = vi.fn();
    act(() => hydrate(<Picker onFiles={onFiles} ready={false} />, container));
    expect(onFiles).not.toHaveBeenCalled();
    act(() => render(<Picker onFiles={onFiles} ready />, container));
    expect(onFiles).toHaveBeenCalledTimes(1);
    act(() => render(<Picker onFiles={onFiles} ready />, container));
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it('takeInputFiles tolerates a missing input', () => {
    expect(takeInputFiles(null)).toEqual([]);
  });
});
