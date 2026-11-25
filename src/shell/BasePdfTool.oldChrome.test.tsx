// @vitest-environment jsdom
// @vitest-environment-options { "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36" }
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BasePdfTool from './BasePdfTool.tsx';
import { resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';

// Split from BasePdfTool.test.tsx: the notice reads navigator.userAgent, which jsdom takes from the environment options above.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

describe('BasePdfTool', () => {
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    // Live control: the page really has this user agent.
    expect(navigator.userAgent).toBe(UA);
  });

  afterEach(() => {
    resetUsageEventsForTests();
    if (container) {
      act(() => render(null, container as HTMLDivElement));
      container.remove();
      container = null;
    }
  });

  function mount(props: { hasFiles: boolean; intake?: { needsPdfjs: boolean } }) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<BasePdfTool onFilesAdded={() => {}} {...props} />, container as HTMLDivElement);
    });
  }

  const text = () => (container as HTMLDivElement).textContent;

  describe('old browser notice', () => {
    it('stays off the empty page, so an old browser can still read it', () => {
      mount({ hasFiles: false });
      expect(text()).not.toContain('needs Chrome 109');
    });

    it('appears once a file is added, naming the version to update to', () => {
      mount({ hasFiles: true });
      expect(text()).toContain('needs Chrome 109 or newer');
    });
  });
});
