import { useRef, useEffect } from 'react'

export function CollageItem({ item, updateItem, deleteItem, onSelect }) {
    // Drag logic removed as per request.
    // We strictly use item.x / item.y provided by the Auto-Packer.

    const isFloating = !item.is_in_last_row && item.container_width;
    const widthStyle = isFloating
        ? `${(item.width / item.container_width) * 100}%`
        : `${item.width}px`;
    const leftStyle = isFloating
        ? `${(item.x / item.container_width) * 100}%`
        : `${item.x}px`;

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
            }}
            style={{
                position: 'absolute',
                top: `${item.y}px`,
                left: leftStyle,
                width: widthStyle,
                height: `${item.height}px`,
                cursor: 'pointer',
                zIndex: item.z_index,
                userSelect: 'none',
                transition: 'top 0.3s, left 0.3s, width 0.3s, height 0.3s',
                aspectRatio: item.aspect_ratio || 'auto',
                backgroundColor: '#000',
            }}
        >
            {item.type === 'image' && (
                <img
                    src={item.content}
                    alt=""
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain', // CRITICAL: NEVER CLIP
                        pointerEvents: 'none',
                        display: 'block',
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
