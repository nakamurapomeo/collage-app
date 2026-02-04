import { useRef, useEffect } from 'react'

export function CollageItem({ item, updateItem, deleteItem, onSelect }) {
    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
            }}
            style={{
                position: 'absolute',
                top: `${item.y}px`,
                left: `${item.x}px`,
                width: `${item.width}px`,
                height: `${item.height}px`,
                cursor: 'pointer',
                zIndex: item.z_index,
                userSelect: 'none',
                transition: 'top 0.3s, left 0.3s, width 0.3s, height 0.3s',
                overflow: 'hidden', // Prevent image bleeding causing overlap look
                // backgroundColor: '#000',
            }}
        >
            {item.type === 'image' && (
                <img
                    src={item.content}
                    alt=""
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover', // 仕様書：切り抜きなしで全体を表示 -> 隙間優先でcoverに変更
                        pointerEvents: 'none',
                        display: 'block',
                        // Add border only for text images to separate them from other images
                        border: item.originalText ? '2px solid white' : 'none',
                        boxSizing: 'border-box'
                    }}
                />
            )}
            {item.type === 'text' && (
                <svg width="100%" height="100%" viewBox={`0 0 ${item.width} ${item.height}`} style={{ display: 'block' }}>
                    <text
                        x={(item.style?.paddingLeft || 0)} // Offset to accommodate left overflowing pixels
                        y={(item.style?.ascent || (item.style?.fontSize ? item.style.fontSize * 0.8 : 20)) + 1} // +1 for buffer
                        fill={item.style?.color || '#fff'}
                        fontSize={item.style?.fontSize || 24}
                        fontFamily="sans-serif"
                        textAnchor="start"
                        style={{
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                            // No userSelect here, handled by parent
                        }}
                    >
                        {item.content}
                    </text>
                </svg>
            )}
        </div>
    )
}
