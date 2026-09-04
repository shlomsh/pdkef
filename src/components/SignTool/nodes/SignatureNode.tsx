import { useState, useEffect } from 'preact/hooks';
import ElementResizers from '../../ElementResizers.tsx';
import { tintImageDataUrl } from '../../../lib/signHelpers.js';
import styles from '../EditorElement.module.css';
import type { SignatureElement } from '../../../editor/model/editorModel.ts';
import type { ElementNodeProps } from '../nodeProps.ts';

export default function SignatureNode({ element, isActive, onResizeStart }: ElementNodeProps<SignatureElement>) {
  const [tintedSigUrl, setTintedSigUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!element.dataUrl) return;
    if (!element.color || element.color === '#000000') {
      setTintedSigUrl(null);
      return;
    }
    let cancelled = false;
    tintImageDataUrl(element.dataUrl, element.color).then((tinted: string) => {
      if (!cancelled) setTintedSigUrl(tinted);
    });
    return () => { cancelled = true; };
  }, [element.dataUrl, element.color]);

  return (
    <>
      <img
        src={tintedSigUrl || element.dataUrl}
        alt="Signature"
        className={styles['signature-image']}
        draggable={false}
      />
      <ElementResizers 
        element={element}
        isActive={isActive}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
