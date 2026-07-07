import ElementResizers from '../../ElementResizers.jsx';

export default function WhiteoutNode({ element, isActive, onResizeStart }) {
  return (
    <>
      <div style={{ width: '100%', height: '100%', backgroundColor: element.color || '#ffffff' }} />
      <ElementResizers 
        element={element}
        isActive={isActive}
        isShape={true}
        isLine={false}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
