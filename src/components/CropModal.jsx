import { useRef, useState, useEffect } from 'react'

export function CropModal({ item, onClose, onSave, onDelete, onRandom }) {
    const [scale, setScale] = useState(item.style?.scale || 1)
    const [link, setLink] = useState(item.content_link || '')
    const [previewUrl, setPreviewUrl] = useState('')

    const imgRef = useRef(null)
    const containerRef = useRef(null)
    const [cropStart, setCropStart] = useState(null)
    const [cropEnd, setCropEnd] = useState(null)
    const [isCropping, setIsCropping] = useState(false)

    useEffect(() => {
        setScale(item.style?.scale || 1)
        setLink(item.content_link || '')
        setCropStart(null)
        setCropEnd(null)
        setPreviewUrl(item.content + (item.content.includes('?') ? '&' : '?') + 't=' + Date.now())
    }, [item])

    const handleLinkOpen = () => { if (link) window.open(link, '_blank') }

    const handlePasteLink = async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (text) setLink(text)
        } catch (e) {
            alert("Clipboard access denied.")
        }
    }

    // --- handlers ---
    const handleMouseDown = (e) => {
        if (!imgRef.current) return
        e.stopPropagation(); e.preventDefault()
        const rect = imgRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        setCropStart({ x, y }); setCropEnd({ x, y }); setIsCropping(true)
    }
    const handleMouseMove = (e) => {
        if (!isCropping || !imgRef.current) return
        const rect = imgRef.current.getBoundingClientRect()
        const clampedX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
        const clampedY = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
        setCropEnd({ x: clampedX, y: clampedY })
    }
    const handleMouseUp = () => setIsCropping(false)

    const handleApplyCrop = async (isCopy = false) => {
        try {
            if (!cropStart || !cropEnd || !imgRef.current) return
            // If just clicking apply without selection (if possible), or minimal drag
            if (Math.abs(cropEnd.x - cropStart.x) < 20) return

            const img = imgRef.current
            const rect = img.getBoundingClientRect()
            const x = Math.min(cropStart.x, cropEnd.x)
            const y = Math.min(cropStart.y, cropEnd.y)
            const w = Math.abs(cropEnd.x - cropStart.x)
            const h = Math.abs(cropEnd.y - cropStart.y)
            const factorX = img.naturalWidth / rect.width
            const factorY = img.naturalHeight / rect.height
            const canvas = document.createElement('canvas')
            canvas.width = w * factorX; canvas.height = h * factorY
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, x * factorX, y * factorY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
            canvas.toBlob(async (blob) => {
                if (!blob) { alert("Crop failed"); return; }

                if (isCopy === true) {
                    onSave(null, { newFile: blob, isCopy: true, originalId: item.id }) // Special signal for copy
                } else {
                    onSave(item.id, { newFile: blob, style: { ...item.style, scale: 1 } })
                }
                onClose()
            }, 'image/jpeg', 0.95)
        } catch (e) { alert("Crop failed: " + e.message) }
    }

    const handleSaveMeta = () => {
        onSave(item.id, { style: { ...item.style, scale }, content_link: link })
        onClose()
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.92)', zIndex: 2000,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            backdropFilter: 'blur(8px)', userSelect: 'none'
        }}>
            <div className="crop-modal" onClick={e => e.stopPropagation()} style={{
                background: '#151515', width: '98vw', height: '95vh',
                borderRadius: '8px', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', position: 'relative', border: '1px solid #333'
            }}>
                <div style={{ padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#000' }}>
                    <button onClick={onRandom} style={{ background: '#333', color: '#eee', fontSize: '1rem', padding: '8px 16px' }}>🎲 Random</button>
                    <button onClick={onClose} style={{ background: 'transparent', fontSize: '2rem', lineHeight: '1rem', color: '#888' }}>×</button>
                </div>

                <div style={{ flex: 1, background: '#080808', position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'crosshair', userSelect: 'none' }} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                    <div ref={containerRef} style={{ position: 'relative', transform: `scale(${scale})`, transformOrigin: 'center', boxShadow: '0 0 50px rgba(0,0,0,0.5)', display: 'flex' }}>
                        <img ref={imgRef} src={previewUrl} crossOrigin="anonymous" style={{ maxHeight: 'calc(90vh - 160px)', maxWidth: '95vw', display: 'block', pointerEvents: 'none' }} alt="Edit" draggable={false} />
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'crosshair' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} />
                        {cropStart && cropEnd && (
                            <div style={{
                                position: 'absolute', left: Math.min(cropStart.x, cropEnd.x) / scale, top: Math.min(cropStart.y, cropEnd.y) / scale,
                                width: Math.abs(cropEnd.x - cropStart.x) / scale, height: Math.abs(cropEnd.y - cropStart.y) / scale,
                                border: `${2 / scale}px solid white`, boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.6)`, pointerEvents: 'none'
                            }} />
                        )}
                    </div>

                    {/* Prominent Link Open Button Overlay - Emoji Only, Semi-Transparent */}
                    {link && (
                        <button
                            onClick={handleLinkOpen}
                            style={{
                                position: 'absolute', bottom: 20, right: 20,
                                background: 'rgba(50, 50, 50, 0.6)',
                                color: 'white',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: '50%',
                                width: '60px', height: '60px',
                                fontSize: '2rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backdropFilter: 'blur(5px)',
                                cursor: 'pointer',
                                zIndex: 100
                            }}
                            title="Open Link"
                        >
                            🔗
                        </button>
                    )}
                </div>

                <div style={{ padding: '20px', background: '#111', color: '#eee', borderTop: '1px solid #333' }}>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span style={{ color: '#aaa' }}>Zoom View</span>
                                <span style={{ color: '#aaa' }}>{scale.toFixed(1)}x</span>
                            </div>
                            <input type="range" min="0.5" max="3" step="0.1" value={scale} onChange={e => setScale(Number(e.target.value))} style={{ width: '100%', accentColor: '#ffd700', height: '6px' }} />
                        </div>
                        <div style={{ flex: 2, minWidth: '300px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span style={{ color: '#aaa' }}>Link URL</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input type="text" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." style={{ flex: 1, background: '#222', border: '1px solid #444', color: 'white', padding: '8px', borderRadius: '4px' }} />
                                <button onClick={handlePasteLink} style={{ background: '#333', padding: '0 12px', cursor: 'pointer' }} title="Paste">📋</button>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', marginTop: '20px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => { if (confirm('Delete image?')) onDelete(item.id); }} style={{ background: '#331111', color: '#ff6666', border: '1px solid #552222', padding: '10px 20px' }}>🗑️ Delete</button>
                        <div style={{ flex: 1 }}></div>

                        {/* Copy Button */}
                        <button onClick={() => handleApplyCrop(true)} disabled={!cropStart || !cropEnd} style={{ background: '#0077ff', color: 'white', fontWeight: 'bold', padding: '10px 20px', opacity: (!cropStart || !cropEnd) ? 0.5 : 1 }}>
                            📑 Copy & Save
                        </button>

                        {/* Toggle Crop Button */}
                        <button
                            onClick={isCropping ? handleApplyCrop : () => { setIsCropping(true); setCropStart({ x: 0, y: 0 }); /* Dummy start to enable mode? No, handled by mouse. Just prompt. */ }}
                            style={{ background: cropStart ? '#fff' : '#333', color: cropStart ? '#000' : '#888', fontWeight: 'bold', padding: '10px 30px' }}
                        >
                            {cropStart ? '✂️ Apply Crop' : '✂️ Crop Mode'}
                        </button>

                        <button onClick={handleSaveMeta} style={{ background: '#ffd700', color: '#000', fontWeight: 'bold', padding: '10px 30px', fontSize: '1.1rem' }}>Done</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
