const px = (value: string) => parseFloat(value) || 0;

/* The loaded card's first-screen floor (PdfTool.module.css) and its bottom padding. The floor is
   the card's top plus its MIN-height, never its content height, so what is sized to it can never
   feed back into the measurement. No card or no min-height (jsdom has no layout): null. */
export function cardFloor(el: Element): { floor: number; paddingBottom: number } | null {
  const card = el.closest<HTMLElement>('[data-tool-loaded]');
  if (!card) return null;
  const style = getComputedStyle(card);
  const minHeight = px(style.minHeight);
  if (minHeight <= 0) return null;
  return { floor: card.getBoundingClientRect().top + minHeight, paddingBottom: px(style.paddingBottom) };
}
