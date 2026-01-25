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
