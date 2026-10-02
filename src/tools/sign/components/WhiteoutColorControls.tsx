import { useState } from 'preact/hooks';
import WhiteoutColorGroup from '../../../editor-ui/whiteout/WhiteoutColorGroup.tsx';
import { useEyedropper } from '../../../editor-ui/whiteout/pageSampling.ts';
import { useRecentWhiteoutColors } from '../../../editor-ui/whiteout/useRecentWhiteoutColors.ts';
import type { ColorMode } from '../../../editor/model/editorModel.ts';
import { whiteoutColorLabels, type SignMessages } from '../../../i18n/toolMessages';
import { SIGN_PAGE_SURFACE } from '../whiteoutPageColor.ts';

/** Paints a colour on a whiteout's DOM only: the picker's live preview. */
function paintWhiteout(id: string, color: string) {
  document.querySelectorAll<HTMLElement>(`[data-editor-element-id="${id}"] [data-whiteout-fill]`)
    .forEach((fill) => { fill.style.backgroundColor = color; });
}

/** The selected whiteout's colour group in Sign's toolbar. The toolbar only mounts while
 * the element is selected, so the pipette stops with it. Auto sends the mode alone
 * (nothing is carried; the workspace supplies the sampled colour); a pick carries. */
export default function WhiteoutColorControls({ element, onChange, messages }: {
  element: { id: string; color?: string; colorMode?: ColorMode };
  onChange: (changes: { color?: string; colorMode: ColorMode }) => void;
  messages: SignMessages;
}) {
  const [eyedropping, setEyedropping] = useState(false);
  const [recents, rememberRecent] = useRecentWhiteoutColors();
  const pick = (color: string) => {
    onChange({ color, colorMode: 'custom' });
    rememberRecent(color);
  };
  useEyedropper(eyedropping, (color) => { pick(color); setEyedropping(false); }, () => setEyedropping(false), `[${SIGN_PAGE_SURFACE}]`);
  return (
    <WhiteoutColorGroup
      labels={whiteoutColorLabels(messages)}
      color={element.color ?? '#ffffff'}
      auto={element.colorMode === 'auto'}
      eyedropping={eyedropping}
      recentColors={recents}
      onToggleEyedropper={() => setEyedropping((on) => !on)}
      onMatchPage={() => onChange({ colorMode: 'auto' })}
      onPickColor={pick}
      paintPreview={(color) => paintWhiteout(element.id, color)}
    />
  );
}
