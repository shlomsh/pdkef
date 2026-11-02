import { nextRadioIndex } from '../lib/marker/roving.ts';

/** Arrow keys on a `role="radiogroup"`: focus and check the next radio. The radio is clicked, so its own handler
 * makes the change; the key goes no further, so a toolbar around the group does not move focus as well. */
export function onRadioKeyDown(e: KeyboardEvent) {
  const group = e.currentTarget as HTMLElement;
  const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
  // Step from the focused radio, else the checked one: with none checked the tab stop is the first, and an arrow must leave it.
  let current = radios.indexOf(document.activeElement as HTMLElement);
  if (current < 0) current = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
  const next = nextRadioIndex(current, e.key, radios.length, getComputedStyle(group).direction === 'rtl');
  if (next === null) return;
  e.preventDefault();
  e.stopPropagation();
  radios[next].focus();
  radios[next].click();
}

/** The group's one tab stop: the checked radio, or the first when none is checked. */
export const radioTabIndex = (checked: boolean, index: number, anyChecked: boolean) => (checked || (!anyChecked && index === 0) ? 0 : -1);
