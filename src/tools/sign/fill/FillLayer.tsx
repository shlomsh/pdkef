/**
 * Fill mode's page layer (SNG-15): renders one page's fill items, a FieldSlot for an
 * empty slot or a text element (through TextFillContext) for one already placed, in
 * the order `items` already carries (fillOrder), so DOM order is reading order and
 * "next" (fillDom.ts's focusNextFillInput) is simply the next fill input after this
 * one. A Fragment on purpose: no wrapper box, so the children position against the
 * page overlay exactly like production's own elements and nothing here blocks a tap
 * from reaching them. This module decides nothing of its own: aimed, pending focus
 * and the free slot's lifecycle all come from useFill(), and every other decision
 * (what a tap does, what a commit becomes) lives above it, in fillTap.ts and
 * fillSlots.ts.
 */
import { useEffect } from 'preact/hooks';
import FieldSlot from './FieldSlot.tsx';
import { useFill, TextFillContext } from './FillContext.tsx';
import { focusFillInput } from './fillDom.ts';
import type { FillLayerProps } from './fillTypes.ts';

export default function FillLayer({ items, pageWidthPoints, enterKeyHintOf, slotLabel, renderText, onEnter, onCommitSlot }: FillLayerProps) {
  const { aimedKey, pendingFocusKey, setPendingFocusKey, closeFreeSlot } = useFill();
  // A slot a tap just opened takes focus from the focus proxy once it renders (docs/sign-fill-mode.md, "The focus proxy").
  useEffect(() => {
    if (pendingFocusKey === null || !items.some((item) => item.key === pendingFocusKey)) return;
    if (focusFillInput(pendingFocusKey)) setPendingFocusKey(null);
  }, [pendingFocusKey, items]);
  return (
    <>
      {items.map((item) => (item.kind === 'slot' ? (
        <FieldSlot key={item.key} slot={item.slot} enterKeyHint={enterKeyHintOf(item.key)} aimed={item.key === aimedKey}
          pageWidthPoints={pageWidthPoints} label={slotLabel} onEnter={() => onEnter(item.key)}
          onCommit={(text) => onCommitSlot(item.slot, text)} onLeave={item.slot.field === null ? closeFreeSlot : undefined} />
      ) : (
        <TextFillContext.Provider key={item.key} value={{ fillKey: item.key, enterKeyHint: enterKeyHintOf(item.key), onEnter: () => onEnter(item.key) }}>
          {renderText(item.element)}
        </TextFillContext.Provider>
      )))}
    </>
  );
}
