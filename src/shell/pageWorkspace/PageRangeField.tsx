import { useEffect, useRef, useState } from 'preact/hooks';
import { parsePageSelector, pageNumbersToRangeString } from '#lib/pages/pageSelector.js';
import { includedPageNumbers, type PlanEntry } from '#lib/pages/pagePlan.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import pdfToolStyles from '../PdfTool.module.css';

/** The strings the field reads; Split's and PDF to Image's catalogues both carry them. */
export interface PageRangeMessages {
  pagesLabel: string;
  pageSelectorPlaceholder: string;
  outOfRange: string;
  rangeOutOfRange: string;
  invalidPart: string;
  noValidPages: string;
}

interface PageRangeFieldProps {
  plan: PlanEntry[];
  pageCount: number;
  /** The pages the typed range keeps; called only when that differs from the plan.
   * `merge` is true for every commit after the first while the field keeps focus. */
  onSelect: (pageNumbers: number[], options: { merge: boolean }) => void;
  messages: PageRangeMessages;
  /** The rail and the phone controls each carry a field; ids stay unique. */
  id?: string;
}

/** parsePageSelector's errors carry a code and params so the catalogue can phrase them; anything else keeps its own message. */
function errorText(err: any, messages: PageRangeMessages): string {
  const template = err?.code ? (messages as any)[err.code] : undefined;
  return template ? formatMessage(template, err.params ?? {}) : err.message;
}

/** The selection in the one form the field shows and compares: "1-3, 5". */
const canonical = (pageNumbers: number[]) => pageNumbersToRangeString(pageNumbers);

/**
 * Split's page range ("1-3, 5, 8-"), kept in step with the plan both ways.
 * A range typed here commits through `onSelect`; any other change to the plan
 * (a tile, a bulk button, Undo) rewrites the text. What the field itself just
 * committed is not rewritten, so the person's own spelling stays while typing.
 */
export default function PageRangeField({ plan, pageCount, onSelect, messages, id = 'page-selector-input' }: PageRangeFieldProps) {
  const included = canonical(includedPageNumbers(plan));
  const [text, setText] = useState(included);
  const [error, setError] = useState('');
  // The selection the text currently stands for.
  const shownRef = useRef(included);
  // Whether the field has committed since it took focus: a range typed in one
  // go passes through "1" and "1-" (an open range) and is still one Undo step.
  const committedRef = useRef(false);

  useEffect(() => {
    if (included === shownRef.current) return;
    shownRef.current = included;
    // Another edit landed between two typed ones: they are no longer one Undo step.
    committedRef.current = false;
    setText(included);
    setError('');
  }, [included]);

  const onInput = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    setText(value);
    try {
      const numbers: number[] = parsePageSelector(value, pageCount);
      setError('');
      const next = canonical(numbers);
      shownRef.current = next;
      if (next === included) return;
      onSelect(numbers, { merge: committedRef.current });
      committedRef.current = true;
      recordAction('select_pages');
    } catch (err: any) {
      // expected: the person's own range did not parse; the selection stays and the message shows under the field.
      // While a range is being typed ("1-" or "1,") the error is held back.
      setError(/[-,]\s*$/.test(value) ? '' : errorText(err, messages));
    }
  };

  return (
    <div>
      <div class={pdfToolStyles['page-selector-field']}>
        <label for={id} class={pdfToolStyles['page-selector-label']}>{messages.pagesLabel}</label>
        <input
          id={id}
          type="text"
          class={`${pdfToolStyles['page-selector-input']}${error ? ` ${pdfToolStyles['has-error']}` : ''}`}
          value={text}
          onInput={onInput}
          onFocus={() => { committedRef.current = false; }}
          onBlur={() => { committedRef.current = false; }}
          dir="ltr"
          placeholder={messages.pageSelectorPlaceholder}
          aria-describedby={error ? `${id}-hint` : undefined}
          aria-invalid={!!error}
        />
      </div>
      {error && <p id={`${id}-hint`} class={pdfToolStyles['page-selector-error']} role="alert">{error}</p>}
    </div>
  );
}
