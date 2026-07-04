export default function WhiteoutElement({ element }) {
  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: element.color || '#ffffff' }} />
  );
}
