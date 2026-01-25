import { useRef, useState, useEffect } from 'react'
import { apiClient } from '../apiClient' // Updated import
import { CollageItem } from './CollageItem'
import { CropModal } from './CropModal'
import { PullToRefresh } from './PullToRefresh'

export function Canvas({
    items, setItems, collageId, fileInputRef, baseSize,
    onPack, onShuffle, canvasScale, setCanvasScale,
    onSave, onRefresh // Added onRefresh
}) {
    const [uploading, setUploading] = useState(false)
    const [selectedItem, setSelectedItem] = useState(null)
    const containerRef = useRef(null)

    const onPackRef = useRef(onPack)
    // Update ref when onPack changes (which happens when items change)
    useEffect(() => { onPackRef.current = onPack }, [onPack])

    useEffect(() => {
        const timer = setTimeout(() => { onPackRef.current() }, 300)
        return () => clearTimeout(timer)
    }, [canvasScale]) // Only run on scale change (or mount)

    const uploadImage = async (file) => {
        // Generate simple path
        const path = `${collageId}/${Date.now()}-${file.name || 'img.jpg'}`
        const { data, error } = await apiClient.storage.upload(file, path)
        if (error) {
            console.error('Upload failed:', error)
            alert('Falied to upload image: ' + error)
            return null
        }
        return data
    }

    const handleFiles = async (files) => {
        setUploading(true)
        let newItems = []
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const publicUrl = await uploadImage(file)
                if (publicUrl) {
                    const img = new Image()
                    img.src = publicUrl
                    await new Promise(r => img.onload = r)
                    const aspectRatio = img.naturalWidth / img.naturalHeight
                    const width = Math.floor(baseSize * aspectRatio)
                    newItems.push({
                        id: crypto.randomUUID(), // Local ID generation
                        collage_id: collageId, type: 'image', content: publicUrl,
                        x: 0, y: 0, width: width || 200, height: baseSize || 200,
                        aspect_ratio: aspectRatio,
                        z_index: items.length + newItems.length + 1, style: {}
                    })
                }
            }
        }

        if (newItems.length > 0) {
            const updatedList = [...items, ...newItems]
            const exactWidth = containerRef.current?.offsetWidth || window.innerWidth
            onPack(exactWidth / canvasScale, updatedList)
        }
        setUploading(false)
    }

    const updateItem = async (id, changes, saveToDb = true) => {
        let updatedList = items;

        if (changes.newFile) {
            setUploading(true)
            const publicUrl = await uploadImage(changes.newFile)
            setUploading(false)
            if (publicUrl) {
                // Load image to get actual new aspect ratio
                const img = new Image()
                img.src = publicUrl
                await new Promise(r => img.onload = r)
                const aspectRatio = img.naturalWidth / img.naturalHeight
                const width = Math.floor(baseSize * aspectRatio)
                const height = baseSize

                const actualChanges = {
                    content: publicUrl,
                    width: width || 200,
                    height: height || 200,
                    aspect_ratio: aspectRatio,
                    style: { ...changes.style, scale: 1 },
                    content_link: changes.content_link
                }
                updatedList = items.map(i => i.id === id ? { ...i, ...actualChanges } : i)
                setItems(updatedList)
            }
        } else {
            updatedList = items.map(i => i.id === id ? { ...i, ...changes } : i)
            setItems(updatedList)
        }

        if (saveToDb) {
            onSave(updatedList)
        }
    }

    const deleteItem = async (id) => {
        setSelectedItem(null)
        const remaining = items.filter(i => i.id !== id)
        setItems(remaining)
        onPack(null, remaining) // Triggers save
    }

    const handleRandom = () => {
        if (!selectedItem) return
        const images = items.filter(i => i.type === 'image' && i.id !== selectedItem.id)
        if (images.length === 0) return
        const random = images[Math.floor(Math.random() * images.length)]
        setSelectedItem(random)
    }

    return (
        <div
            style={{
                marginTop: '60px', width: '100%', height: 'calc(100vh - 60px)',
                position: 'relative', background: '#121212',
                // Enable scroll by removing overflow: hidden (except x)
                overflowX: 'hidden', overflowY: 'hidden' // PullToRefresh handles Y scroll
            }}
            ref={containerRef}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
                e.preventDefault()
                if (e.dataTransfer.files.length > 0) handleFiles(Array.from(e.dataTransfer.files))
            }}
            onClick={() => setSelectedItem(null)}
            className="canvas-container"
        >
            <PullToRefresh onRefresh={onShuffle}>
                <div style={{
                    minHeight: 'calc(100vh - 60px + 1px)',
                    position: 'relative',
                    paddingBottom: '40vh' // Extra space for better scroll feel
                }}>
                    {/* MinHeight ensures scrollable even when empty-ish */}

                    <input type="file" multiple accept="image/*" style={{ display: 'none' }} ref={fileInputRef} onChange={(e) => handleFiles(Array.from(e.target.files))} />

                    <div style={{
                        transformOrigin: 'top left', transform: `scale(${canvasScale})`,
                        width: '100%', height: '100%', position: 'absolute', top: 0, left: 0,
                        transition: 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                    }}>
                        {items.map(item => (
                            <CollageItem key={item.id} item={item} updateItem={updateItem} deleteItem={deleteItem} onSelect={setSelectedItem} />
                        ))}
                    </div>

                    {items.length === 0 && !uploading && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#555', pointerEvents: 'none', textAlign: 'center' }}>
                            Drag & Drop images or click 📷<br />New images will appear at the bottom
                        </div>
                    )}
                </div>
            </PullToRefresh>

            {selectedItem && (
                <CropModal item={selectedItem} onClose={() => setSelectedItem(null)} onSave={updateItem} onDelete={deleteItem} onRandom={handleRandom} />
            )}

            {uploading && <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#333', padding: 10, borderRadius: 8, color: 'white', zIndex: 100 }}>Uploading...</div>}
        </div>
    )
}
