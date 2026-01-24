import { useState } from 'react'

export function TextModal({ onClose, onAdd }) {
    const [text, setText] = useState('')
    const [color, setColor] = useState('#ffffff')
    const [size, setSize] = useState(24)

    const handleAdd = () => {
        if (text.trim()) {
            onAdd({ text, color, size })
            onClose()
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'start', paddingTop: '100px'
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#222', padding: '20px', borderRadius: '12px',
                width: '300px', display: 'flex', flexDirection: 'column', gap: '15px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}>
                <input
                    autoFocus
                    type="text"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Enter text..."
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    style={{
                        fontSize: '18px', padding: '10px', borderRadius: '6px',
                        border: 'none', background: '#333', color: 'white', width: '100%', boxSizing: 'border-box'
                    }}
                />

                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="color"
                        value={color}
                        onChange={e => setColor(e.target.value)}
                        style={{ background: 'none', border: 'none', width: '40px', height: '40px', cursor: 'pointer' }}
                    />
                    <input
                        type="range" min="12" max="100"
                        value={size} onChange={e => setSize(Number(e.target.value))}
                        style={{ flex: 1, accentColor: color }}
                    />
                    <span style={{ color: '#aaa', width: '30px' }}>{size}</span>
                </div>

                <button
                    onClick={handleAdd}
                    style={{
                        background: '#ffd700', color: '#000', fontWeight: 'bold', padding: '10px',
                        borderRadius: '6px', cursor: 'pointer', border: 'none'
                    }}
                >
                    Add
                </button>
            </div>
        </div>
    )
}
