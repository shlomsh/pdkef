import { Component, type ComponentChildren, type ComponentType } from 'preact';
import { installUncaughtErrorReporting, isReported, markReported, reportError } from './errorReport.ts';

/**
 * The one boundary every island renders inside (ARCH-72). It installs the window
 * `error` / `unhandledrejection` reporting once per page (the install is idempotent, so any
 * number of islands share it), and reports a render error a child throws, then throws it again:
 * what a person sees is exactly what they would see with no boundary at all.
 */
export default class IslandErrorBoundary extends Component<{ children?: ComponentChildren }> {
  componentDidMount(): void {
    installUncaughtErrorReporting();
  }

  componentDidCatch(error: unknown): void {
    // Marked first, so an outer boundary or the window handler that sees this same throw next skips it.
    if (!isReported(error)) {
      markReported(error);
      reportError('uncaught', error, 'island_render');
    }
    throw error;
  }

  render() {
    return this.props.children;
  }
}

/** An island's exported component, rendered inside the shared boundary. */
export function withIslandBoundary<P extends object>(Wrapped: ComponentType<P>): ComponentType<P> {
  const Bounded = (props: P) => (
    <IslandErrorBoundary>
      <Wrapped {...props} />
    </IslandErrorBoundary>
  );
  Bounded.displayName = `withIslandBoundary(${Wrapped.displayName || Wrapped.name || 'Island'})`;
  return Bounded;
}
