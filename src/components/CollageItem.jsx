import { useRef, useEffect } from 'react'

export function CollageItem({ item, updateItem, deleteItem, onSelect }) {
    // Drag logic removed as per request.
    // We strictly use item.x / item.y provided by the Auto-Packer.

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
            }}
            style={{
                position: 'absolute',
                top: item.y,
                left: item.x,
                width: item.width,
                height: item.height || 'auto',
                cursor: 'pointer', // Changed from grab
                zIndex: item.z_index,
                userSelect: 'none',
                transition: 'top 0.3s, left 0.3s, width 0.3s, height 0.3s', // Smooth re-layout
            }}
        >
            {item.type === 'image' && (
                <img
                    src={item.content}
                    alt=""
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        pointerEvents: 'none',
                        boxShadow: 'none',
                        display: 'block',
                        imageRendering: 'auto'
                    }}
                />
            )}
            {item.type === 'text' && (
                <div style={{
                    fontSize: `${item.style?.fontSize || 24}px`,
                    color: item.style?.color || '#fff',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    whiteSpace: 'pre-wrap',
                    padding: '4px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '4px'
                }}>
                    {item.content}
                </div>
            )}
        </div>
    )
}
