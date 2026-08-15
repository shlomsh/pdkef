import { useRef } from 'preact/hooks';
import useViewDensity from '../lib/useViewDensity.js';
import FullscreenButton from './FullscreenButton.jsx';
import styles from './ViewControl.module.css';

const RELAXED = 0;
const CONDENSED = 1;
const FULLSCREEN = 2;

const SEGMENTS = [
  { key: 'relaxed', label: 'Relaxed view' },
  { key: 'condensed', label: 'Condensed view' },
  { key: 'fullscreen', label: 'Full screen' },
];

function SegmentIcon({ segment }) {
  if (segment === 'relaxed') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (segment === 'condensed') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 7h18" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

// Replaces FullscreenButton in the toolbar, same slot (E9-view-density-control-spec.md
// 2.4). Renders BOTH the >=920px segmented control and the <920px FullscreenButton
// fallback and lets CSS pick one - no resize listener, no hydration mismatch.
//
// density (persisted) and isFullscreen (transient, owned by the Fullscreen API) stay
// two separate pieces of state under one three-stop ladder rather than one enum:
// fullscreen has external exits (Esc, F11, browser UI) that would desync a merged
// enum, and it cannot be restored on load since browsers require a user gesture to
// enter it. See spec 2.1-2.2.
export default function ViewControl({ isFullscreen, toggleFullscreen }) {
  const [density, setDensity] = useViewDensity();
  const segmentRefs = useRef([]);

  const activeIndex = isFullscreen ? FULLSCREEN : (density === 'relaxed' ? RELAXED : CONDENSED);

  const selectSegment = (index) => {
    if (index === FULLSCREEN) {
      toggleFullscreen();
      return;
    }
    setDensity(index === RELAXED ? 'relaxed' : 'condensed');
    if (isFullscreen) toggleFullscreen();
  };

  const onKeyDown = (e) => {
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (activeIndex + 1) % 3;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (activeIndex + 2) % 3;
    else if (e.key === 'Home') next = RELAXED;
    else if (e.key === 'End') next = FULLSCREEN;
    if (next === null) return;
    e.preventDefault();
    selectSegment(next);
    segmentRefs.current[next]?.focus();
  };

  return (
    <>
      {/* data-toolbar-narrow-hidden: a plain HTML attribute rather than a class,
          so SignToolbar.module.css (a different CSS Modules file, which cannot
          see this file's scoped .segmented hash) can still exclude this control
          from its "how many controls does the phone actually see" nth-child
          counting below 920px, where this element is unconditionally
          display:none - see that file's --controls-per-row comment. */}
      <div className={styles.segmented} data-toolbar-narrow-hidden role="radiogroup" aria-label="View density" onKeyDown={onKeyDown}>
        {SEGMENTS.map((segment, index) => {
          const isActive = activeIndex === index;
          const label = segment.key === 'fullscreen' && isFullscreen ? 'Exit full screen' : segment.label;
          return (
            <button
              key={segment.key}
              ref={(el) => { segmentRefs.current[index] = el; }}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={label}
              title={label}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.segment}${isActive ? ` ${styles.active}` : ''}`}
              onClick={() => selectSegment(index)}
            >
              <SegmentIcon segment={segment.key} />
            </button>
          );
        })}
      </div>
      {/* Rendered unwrapped and unmodified (FullscreenButton.jsx stays untouched -
          see spec 4.1), so it stays a direct .toolbar child sized by .toolbar > *
          exactly like every other button. ViewControl.module.css hides it at
          >=920px with an adjacent-sibling selector off .segmented instead of a
          wrapper div, so the existing "every toolbar button is a direct child of
          .toolbar or .dropdown" structural invariant (SignToolbar.test.jsx) holds
          without change. */}
      <FullscreenButton isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />
    </>
  );
}
