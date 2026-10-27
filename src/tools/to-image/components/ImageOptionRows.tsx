import { recordAction } from '../../../lib/actionTrail.ts';
import { reportEdit } from '../../../lib/productAnalytics.ts';
import OptionRow, { type Option } from '../../../shell/pageWorkspace/OptionRow.tsx';
import type { ImageFormat, ImageLayout } from '../lib/toImageOutput.ts';
import type { ToImageMessages } from '../messages';

interface Settings {
  format: ImageFormat;
  scale: number;
  layout: ImageLayout;
  setFormat: (value: ImageFormat) => void;
  setScale: (value: number) => void;
  setLayout: (value: ImageLayout) => void;
}

/** The three setting rows (format, quality, layout); a changed setting is recorded once. */
export function imageOptionRows(t: ToImageMessages, { format, scale, layout, setFormat, setScale, setLayout }: Settings) {
  const changeSetting = <T,>(current: T, next: T, set: (value: T) => void) => {
    if (next === current) return;
    set(next);
    recordAction('change_setting');
    reportEdit('pdf-to-image');
  };
  const formatRow = (id: string, compact = false) => (
    <OptionRow
      id={id}
      label={t.formatLabel}
      showLabel={!compact}
      options={[
        { value: 'image/png', label: 'PNG', hint: t.formatPngHint },
        { value: 'image/jpeg', label: 'JPG', hint: t.formatJpgHint },
      ] as Option<ImageFormat>[]}
      value={format}
      onChange={(next) => changeSetting(format, next, setFormat)}
      dir={t.dir}
      compact={compact}
    />
  );
  const qualityRow = (id: string) => (
    <OptionRow
      id={id}
      label={t.qualityLabel}
      options={[
        { value: 1, label: t.qualityStandard, hint: t.qualityStandardHint },
        { value: 2, label: t.qualityHigh, hint: t.qualityHighHint },
        { value: 3, label: t.qualityMaximum, hint: t.qualityMaximumHint },
      ]}
      value={scale}
      onChange={(next) => changeSetting(scale, next, setScale)}
      dir={t.dir}
    />
  );
  const layoutRow = (id: string) => (
    <OptionRow
      id={id}
      label={t.layoutLabel}
      options={[
        { value: 'separate', label: t.layoutSeparate, hint: t.layoutSeparateHint },
        { value: 'concatenated', label: t.layoutCombined, hint: t.layoutCombinedHint },
      ] as Option<ImageLayout>[]}
      value={layout}
      onChange={(next) => changeSetting(layout, next, setLayout)}
      dir={t.dir}
    />
  );
  return { formatRow, qualityRow, layoutRow };
}
