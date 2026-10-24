import styles from './PageWorkspace.module.css';

/** The rail's "Add page numbers" checkbox row, directly above the Download element. */
export default function PageNumbersRow({ checked, onChange, label }: {
  checked: boolean;
  onChange: (event: Event) => void;
  label: string;
}) {
  return (
    <label class={styles['page-numbers-row']}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
