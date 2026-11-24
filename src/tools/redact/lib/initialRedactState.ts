import { getAppStyle, getEditorPreference } from '#editor/workspace/preferenceStore.ts';
import { resolveWhiteoutColor, resolveRedactBlurStrength } from './redactStyle.ts';
import { resolveBrush } from '../components/BrushControls.tsx';
import { initialRedactState, type RedactState } from '../state/redactState.ts';

/** The island's starting state: the preferences it starts from are read once, here. */
export function initialRedactStateFromPreferences(): RedactState {
  return initialRedactState({
    activeColor: resolveWhiteoutColor(undefined, getAppStyle(), getEditorPreference('lastWhiteoutColor')),
    activeBlurStrength: resolveRedactBlurStrength(undefined, getAppStyle(), getEditorPreference('lastBlurStrength')),
    brush: resolveBrush(undefined, getAppStyle()),
  });
}
