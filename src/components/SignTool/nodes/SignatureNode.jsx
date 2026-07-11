import { useState, useEffect } from 'preact/hooks';
import ElementResizers from '../../ElementResizers.jsx';
import { tintImageDataUrl } from '../../../lib/sign.js';
import styles from '../EditorElement.module.css';

export default function SignatureNode({ element, isActive, onResizeStart }) {
  const [tintedSigUrl, setTintedSigUrl] = useState(null);

  useEffect(() => {
    if (!element.dataUrl) return;
    if (!element.color || element.color === '#000000') {
      setTintedSigUrl(null);
      return;
    }
    let cancelled = false;
    tintImageDataUrl(element.dataUrl, element.color).then((tinted) => {
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
