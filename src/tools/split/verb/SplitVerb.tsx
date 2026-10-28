import VerbStage from '#shell/verb/VerbStage.tsx';
import paperStyles from '#shell/verb/paper.module.css';
import styles from './SplitVerb.module.css';

const page = `${paperStyles.page} ${paperStyles.stripA}`;

/** Split's verb: the top five pages of a deck of ten are dealt onto a pile, then the two decks part. */
export default function SplitVerb() {
  return (
    <VerbStage>
      <div class={`${styles.deck} ${styles.left}`} data-deck="left">
        <i class={page} />
        <i class={page} />
        <i class={page} />
        <i class={page} />
        <i class={`${page} ${styles.top}`} />
      </div>
      <div class={`${styles.deck} ${styles.right}`} data-deck="right">
        <i class={`${page} ${styles.top}`} />
        <i class={page} />
        <i class={page} />
        <i class={page} />
        <i class={page} />
      </div>
    </VerbStage>
  );
}
