import styles from './LampStage.module.css';

/**
 * The lamp's moving parts that belong to no control: the dimming veil, the lamp's cone of light, the click ring, the
 * string, and the bead that becomes the capsule (the morph, with the capsule's copy fading out over it on the way out).
 * It lives inside the workspace, which real fullscreen keeps on screen. Every part rests invisible; lib/lampEntrance
 * animates them and hands them back.
 */
export default function LampStage() {
  return (
    <div class={styles.stage} aria-hidden="true" inert>
      <div class={styles.veil} data-lamp-part="veil" />
      <div class={styles.cone} data-lamp-part="cone"><i /></div>
      <div class={styles.string} data-lamp-part="string" />
      <div class={styles.ring} data-lamp-part="ring" />
      <div class={styles.morph} data-lamp-part="morph"><i class={styles.face} data-lamp-part="face" /></div>
      <div class={styles.ghost} data-lamp-part="ghost" />
    </div>
  );
}
