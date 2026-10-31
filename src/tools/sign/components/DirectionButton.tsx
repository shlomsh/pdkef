import { PilcrowLeft, PilcrowRight } from 'lucide-preact';
import type { SignMessages } from '#editor/registry/messages.ts';

/** The reading-direction button shared by the text and highlight toolbars. */
export default function DirectionButton({ direction, onFlip, t, className }: { direction: 'ltr' | 'rtl'; onFlip: () => void; t: SignMessages; className: string }) {
  return (
    <button
      type="button"
      // This describes the detected writing direction; it is not a
      // selected formatting option. In particular, RTL text should not
      // make the control look persistently pressed for Hebrew/Arabic
      // users.
      className={className}
      onClick={onFlip}
      title={direction === 'rtl' ? t.rtlTextTitle : t.ltrTextTitle}
      aria-label={direction === 'rtl' ? t.directionRtlAria : t.directionLtrAria}
    >
      {direction === 'rtl' ? (
        <PilcrowLeft size={14} strokeWidth={2.5} />
      ) : (
        <PilcrowRight size={14} strokeWidth={2.5} />
      )}
    </button>
  );
}
