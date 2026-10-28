import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleWorkspaceFullscreen, useFullscreenChange } from './workspaceFullscreen.ts';
import { recentActions, resetActionTrailForTests } from '../../lib/telemetry/actionTrail.ts';

afterEach(() => {
  Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  resetActionTrailForTests();
});

describe('toggleWorkspaceFullscreen', () => {
  it('asks the workspace for real fullscreen and records it', () => {
    const workspace = { requestFullscreen: vi.fn(() => Promise.resolve()) } as any;
    const setPseudo = vi.fn();
    toggleWorkspaceFullscreen(workspace, false, setPseudo);
    expect(workspace.requestFullscreen).toHaveBeenCalled();
    expect(setPseudo).not.toHaveBeenCalled();
    expect(recentActions()).toContain('fullscreen');
  });

  it('falls back to pseudo fullscreen when the request is refused', async () => {
    const workspace = { requestFullscreen: vi.fn(() => Promise.reject(new Error('no'))) } as any;
    const setPseudo = vi.fn();
    toggleWorkspaceFullscreen(workspace, false, setPseudo);
    await Promise.resolve();
    await Promise.resolve();
    expect(setPseudo).toHaveBeenCalledWith(true);
  });

  it('falls back when the browser has no requestFullscreen or it is disabled', () => {
    const setPseudo = vi.fn();
    toggleWorkspaceFullscreen({} as any, false, setPseudo);
    expect(setPseudo).toHaveBeenLastCalledWith(true);
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    toggleWorkspaceFullscreen({ requestFullscreen: vi.fn() } as any, false, setPseudo);
    expect(setPseudo).toHaveBeenCalledTimes(2);
  });

  it('leaves pseudo fullscreen first, and exits real fullscreen when active', () => {
    const setPseudo = vi.fn();
    toggleWorkspaceFullscreen(null, true, setPseudo);
    expect(setPseudo).toHaveBeenCalledWith(false);
    const exit = vi.fn();
    (document as any).exitFullscreen = exit;
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true });
    toggleWorkspaceFullscreen(null, false, setPseudo);
    expect(exit).toHaveBeenCalled();
  });
});

describe('useFullscreenChange', () => {
  it('reports whether the workspace itself is the fullscreen element', () => {
    const workspace = document.createElement('div');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onChange = vi.fn();
    function Probe() {
      useFullscreenChange({ current: workspace }, onChange);
      return null;
    }
    act(() => render(<Probe />, host));
    Object.defineProperty(document, 'fullscreenElement', { value: workspace, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(onChange).toHaveBeenLastCalledWith(true);
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(onChange).toHaveBeenLastCalledWith(false);
    act(() => render(null, host));
    host.remove();
  });
});
