import { useState } from 'preact/hooks';
import Popover from './Popover.jsx';

const THICKNESS_OPTIONS = [1, 2, 3, 5, 8, 12, 16];

export default function ThicknessPickerMenu({ value, onChange, title }) {
  const [open, setOpen] = useState(false);
  const currentThickness = value || 3;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      trigger={
        <button
          type="button"
          className="sign-element-btn"
          title={title}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={currentThickness} stroke-linecap="round">
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      }
      content={
        <div className="sign-popover" role="menu" style={{ minWidth: '100px', padding: '0.15rem', cursor: 'default' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
            {THICKNESS_OPTIONS.map(thickness => (
              <button
                key={thickness}
                type="button"
                // Selected state uses a class (not an inline background) so the
                // .sign-menu-item:hover rule isn't overridden by an inline style —
                // that's what killed the hover feedback before.
                className={`sign-menu-item sign-thickness-item${thickness === currentThickness ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(thickness);
                  setOpen(false);
                }}
                title={`${thickness}px thickness`}
              >
                <svg width="100%" height="14" viewBox="0 0 100 14" fill="currentColor">
                  <rect x="10" y={7 - thickness / 2} width="80" height={thickness} rx={thickness > 4 ? 2 : 0} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
