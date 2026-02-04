import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export function CropModal({ item, onClose, onSave, onDelete, onRandom, onEditOriginalText }) {
    const [scale, setScale] = useState(item.style?.scale || 1)
    const [link, setLink] = useState(item.content_link || '')
    const [previewUrl, setPreviewUrl] = useState('')

    const imgRef = useRef(null)
    const containerRef = useRef(null)

    // Crop State
    const [isCropMode, setIsCropMode] = useState(false)
    const [cropStart, setCropStart] = useState(null)
    const [cropEnd, setCropEnd] = useState(null)
    const [isSelecting, setIsSelecting] = useState(false)

    useEffect(() => {
        setScale(item.style?.scale || 1)
        setLink(item.content_link || '')
        setCropStart(null)
        setCropEnd(null)
        // Add timestamp to prevent caching issues if needed, but only if URL params expected
        setPreviewUrl(item.content)
    }, [item])

    // Pinch Zoom Logic (Only active when NOT in Crop Mode to prevent conflict)
    const [initialPinchDist, setInitialPinchDist] = useState(null)
    useEffect(() => {
        if (isCropMode) return; // Disable zoom specific gestures during crop mode (optional, but safer)

        const handleTouchStart = (e) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
                setInitialPinchDist(dist)
            }
        }
        const handleTouchMove = (e) => {
            if (e.touches.length === 2 && initialPinchDist) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
                const delta = dist - initialPinchDist
                if (Math.abs(delta) > 1) {
                    const zoomFactor = 0.005
                    setScale(prev => Math.max(0.5, Math.min(5, prev + (delta * zoomFactor))))
                    setInitialPinchDist(dist)
                }
            }
        }
        const handleTouchEnd = () => setInitialPinchDist(null)

        const el = containerRef.current?.parentElement
        if (el) {
            el.addEventListener('touchstart', handleTouchStart);
            el.addEventListener('touchmove', handleTouchMove);
            el.addEventListener('touchend', handleTouchEnd)
        }
        return () => {
            if (el) {
                el.removeEventListener('touchstart', handleTouchStart);
                el.removeEventListener('touchmove', handleTouchMove);
                el.removeEventListener('touchend', handleTouchEnd)
            }
        }
    }, [initialPinchDist, isCropMode])

    const handleLinkOpen = () => { if (link) window.open(link, '_blank') }

    const handlePasteLink = async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (text) setLink(text)
        } catch (e) { alert("Clipboard access denied.") }
    }

    // --- Crop Handlers ---
    const handleStart = (clientX, clientY) => {
        if (!isCropMode || !imgRef.current) return
        const rect = imgRef.current.getBoundingClientRect()
        const x = clientX - rect.left
        const y = clientY - rect.top

        // Ensure click is within image
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

        setCropStart({ x, y })
        setCropEnd({ x, y })
        setIsSelecting(true)
    }

    const handleMouseDown = (e) => {
        if (!isCropMode) return;
        e.stopPropagation(); e.preventDefault()
        handleStart(e.clientX, e.clientY)
    }

    const handleTouchStartCrop = (e) => {
        if (!isCropMode) return;
        if (e.touches.length !== 1) return
        e.stopPropagation()
        handleStart(e.touches[0].clientX, e.touches[0].clientY)
    }

    const handleMove = (clientX, clientY) => {
        if (!isSelecting || !isCropMode || !imgRef.current) return
        const rect = imgRef.current.getBoundingClientRect()
        const clampedX = Math.max(0, Math.min(clientX - rect.left, rect.width))
        const clampedY = Math.max(0, Math.min(clientY - rect.top, rect.height))
        setCropEnd({ x: clampedX, y: clampedY })
    }

    const handleMouseMove = (e) => handleMove(e.clientX, e.clientY)
    const handleTouchMoveCrop = (e) => {
        if (e.touches.length !== 1) return
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    const handleEnd = () => setIsSelecting(false)

    // Resize Handles
    const startResize = (e, corner) => {
        e.stopPropagation(); e.preventDefault()
        if (!cropStart || !cropEnd) return
        setIsSelecting(true)

        const x1 = Math.min(cropStart.x, cropEnd.x)
        const y1 = Math.min(cropStart.y, cropEnd.y)
        const x2 = Math.max(cropStart.x, cropEnd.x)
        const y2 = Math.max(cropStart.y, cropEnd.y)

        if (corner === 'nw') { setCropStart({ x: x2, y: y2 }); setCropEnd({ x: x1, y: y1 }); }
        if (corner === 'ne') { setCropStart({ x: x1, y: y2 }); setCropEnd({ x: x2, y: y1 }); }
        if (corner === 'sw') { setCropStart({ x: x2, y: y1 }); setCropEnd({ x: x1, y: y2 }); }
        if (corner === 'se') { setCropStart({ x: x1, y: y1 }); setCropEnd({ x: x2, y: y2 }); }
    }

    const performCrop = async (isCopy) => {
        try {
            if (!cropStart || !cropEnd || !imgRef.current) return
            if (Math.abs(cropEnd.x - cropStart.x) < 20) { alert("Selection too small"); return; }

            const img = imgRef.current
            const rect = img.getBoundingClientRect()

            // Coordinates relative to the displayed image rect
            const x = Math.min(cropStart.x, cropEnd.x)
            const y = Math.min(cropStart.y, cropEnd.y)
            const w = Math.abs(cropEnd.x - cropStart.x)
            const h = Math.abs(cropEnd.y - cropStart.y)

            // Scale to natural image size
            const factorX = img.naturalWidth / rect.width
            const factorY = img.naturalHeight / rect.height

            const canvas = document.createElement('canvas')
            canvas.width = w * factorX
            canvas.height = h * factorY
            const ctx = canvas.getContext('2d')

            // Draw cropped area
            ctx.drawImage(img, x * factorX, y * factorY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)

            canvas.toBlob(async (blob) => {
                if (!blob) { alert("Crop generation failed"); return; }

                if (isCopy) {
                    onSave(null, { newFile: blob, isCopy: true, originalId: item.id })
                } else {
                    onSave(item.id, { newFile: blob, style: { ...item.style, scale: 1 } }) // Reset scale on overwrite
                }

                // Reset state
                setCropStart(null); setCropEnd(null); setIsCropMode(false);
                onClose()
            }, 'image/png', 1.0)

        } catch (e) {
            console.error(e)
            alert("Crop failed: " + e.message)
        }
    }

    const handleSaveMeta = () => {
        onSave(item.id, { style: { ...item.style, scale }, content_link: link })
        onClose()
    }

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(5, 5, 5, 0.95)', zIndex: 9999,
            display: 'flex', flexDirection: 'column',
            backdropFilter: 'blur(10px)', userSelect: 'none'
        }} onClick={onClose}>

            {/* 1. Header Area with Controls */}
            <div style={{
                padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onRandom} style={secondaryBtnStyle}>🎲 Random</button>
                    {item.originalText && (
                        <button onClick={() => { onClose(); onEditOriginalText(item); }} style={accentBtnStyle}>
                            🅰️ Edit Text
                        </button>
                    )}
                </div>

                {/* Crop Mode Toggle */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => {
                            setIsCropMode(!isCropMode);
                            if (isCropMode) { setCropStart(null); setCropEnd(null); } // Clear on exit
                        }}
                        style={{
                            ...primaryBtnStyle,
                            background: isCropMode ? '#fff' : 'rgba(255,255,255,0.1)',
                            color: isCropMode ? '#000' : '#fff'
                        }}
                    >
                        {isCropMode ? 'Stop Cropping' : '✂️ Start Crop'}
                    </button>
                    <button onClick={onClose} style={closeBtnStyle}>×</button>
                </div>
            </div>

            {/* 2. Main Image Area - Maximized */}
            <div style={{
                flex: 1, position: 'relative', overflow: 'hidden',
                display: 'flex', justifyContent: 'center', alignItems: 'center'
            }}
                onMouseUp={handleEnd} onMouseLeave={handleEnd}>

                <div ref={containerRef} style={{
                    position: 'relative',
                    transform: `scale(${scale})`, transformOrigin: 'center',
                    transition: isSelecting ? 'none' : 'transform 0.1s ease-out' // Smooth zoom, instant crop
                }}>
                    <img
                        ref={imgRef} src={previewUrl}
                        style={{
                            maxHeight: '80vh', maxWidth: '95vw', // Limit to viewport mostly
                            objectFit: 'contain',
                            display: 'block', pointerEvents: 'none',
                            boxShadow: '0 0 40px rgba(0,0,0,0.5)'
                        }}
                        draggable={false}
                    />

                    {/* Overlay for interaction */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        cursor: isCropMode ? 'crosshair' : 'default',
                        touchAction: 'none'
                    }}
                        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                        onTouchStart={handleTouchStartCrop} onTouchMove={handleTouchMoveCrop}
                    />

                    {/* Crop Box */}
                    {isCropMode && cropStart && cropEnd && (
                        <div style={{
                            position: 'absolute',
                            left: Math.min(cropStart.x, cropEnd.x),
                            top: Math.min(cropStart.y, cropEnd.y),
                            width: Math.abs(cropEnd.x - cropStart.x),
                            height: Math.abs(cropEnd.y - cropStart.y),
                            border: '2px solid #fff',
                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)', // Dim outside
                            pointerEvents: 'none'
                        }}>
                            {/* Handles */}
                            {['nw', 'ne', 'sw', 'se'].map(pos => (
                                <div key={pos}
                                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); startResize(e.clientX, e.clientY, pos) }}
                                    onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); startResize(e.touches[0].clientX, e.touches[0].clientY, pos) }}
                                    style={{
                                        position: 'absolute', width: 20, height: 20, background: '#fff',
                                        top: pos.includes('n') ? -10 : 'auto', bottom: pos.includes('s') ? -10 : 'auto',
                                        left: pos.includes('w') ? -10 : 'auto', right: pos.includes('e') ? -10 : 'auto',
                                        cursor: 'pointer', pointerEvents: 'auto', borderRadius: '50%'
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Link Button (Overlay in View Mode) */}
                {!isCropMode && link && (
                    <button onClick={handleLinkOpen} style={{
                        position: 'absolute', bottom: 30, right: 30,
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '1.8rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 10
                    }}>
                        🔗
                    </button>
                )}
            </div>

            {/* 3. Footer / Action Area */}
            <div style={{
                padding: '20px', background: 'rgba(20,20,20,0.95)', borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', flexDirection: 'column', gap: '15px'
            }} onClick={e => e.stopPropagation()}>

                {/* Crop Actions (Visible only when selection exists) */}
                {isCropMode && cropStart && cropEnd && Math.abs(cropEnd.x - cropStart.x) > 10 && (
                    <div style={{
                        padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px',
                        display: 'flex', justifyContent: 'center', gap: '15px',
                        animation: 'slideUp 0.3s'
                    }}>
                        <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
                        <button onClick={() => performCrop(false)} style={actionBtnStyle('orange')}>
                            🔄 Replace Original
                        </button>
                        <button onClick={() => performCrop(true)} style={actionBtnStyle('#007bff')}>
                            📑 Save as Copy
                        </button>
                    </div>
                )}

                {/* Standard Meta & Tools */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: '300px' }}>
                        <span style={{ color: '#888' }}>Link:</span>
                        <input
                            value={link} onChange={e => setLink(e.target.value)}
                            placeholder="https://..."
                            style={inputStyle}
                        />
                        <button onClick={handlePasteLink} style={iconBtnStyle} title="Paste Clipboard">📋</button>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => { if (confirm('Delete this item?')) onDelete(item.id); }} style={dangerBtnStyle}>
                            🗑️ Delete
                        </button>
                        <button onClick={handleSaveMeta} style={doneBtnStyle}>
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}

// --- Styles ---
const primaryBtnStyle = {
    padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s'
}
const secondaryBtnStyle = {
    padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: '#ccc', borderRadius: '20px', border: 'none', cursor: 'pointer'
}
const accentBtnStyle = {
    padding: '8px 16px', background: 'rgba(100,100,255,0.3)', color: '#aaf', borderRadius: '20px', border: '1px solid rgba(100,100,255,0.5)', cursor: 'pointer'
}
const closeBtnStyle = {
    background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', padding: '0 10px'
}
const actionBtnStyle = (bg) => ({
    padding: '10px 20px', background: bg, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem'
})
const dangerBtnStyle = {
    padding: '10px 20px', background: 'rgba(255,50,50,0.2)', color: '#f88', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '8px', cursor: 'pointer'
}
const doneBtnStyle = {
    padding: '10px 30px', background: '#fff', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem'
}
const inputStyle = {
    flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px 12px', borderRadius: '6px'
}
const iconBtnStyle = {
    background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px', borderRadius: '6px', cursor: 'pointer'
}
