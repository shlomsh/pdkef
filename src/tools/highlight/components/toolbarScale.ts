import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/** True inside the desktop mark toolbar, which holds its physical size under zoom; its popovers must too. */
export const ToolbarScale = createContext(false);

export const useToolbarScaled = () => useContext(ToolbarScale);

/** Counter-scale for a popover's content (`scale`, not `transform`: floating-ui owns that), shrinking toward the trigger. */
export const COUNTER_SCALE = { scale: 'calc(1 / var(--vv-scale, 1))', transformOrigin: '50% 0' } as const;
