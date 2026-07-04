export default function SignatureElement({ element, tintedSigUrl }) {
  if (!element.dataUrl) return null;
  return (
    <img
      src={tintedSigUrl || element.dataUrl}
      alt="Signature"
      className="sign-sig-image"
    />
  );
}
