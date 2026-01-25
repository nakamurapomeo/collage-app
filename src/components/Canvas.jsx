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

    // Pinch Zoom Logic
    const [initialPinchDist, setInitialPinchDist] = useState(null);
    useEffect(() => {
        const handleTouchStart = (e) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                setInitialPinchDist(dist);
            }
        };
        const handleTouchMove = (e) => {
            if (e.touches.length === 2 && initialPinchDist) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const delta = dist - initialPinchDist;
                // Sensible zoom speed
                if (Math.abs(delta) > 10) {
                    // Determine direction
                    const scaleChange = delta > 0 ? 0.02 : -0.02;
                    setCanvasScale(prev => Math.max(0.1, Math.min(3, prev + scaleChange)));
                    setInitialPinchDist(dist); // Reset to avoid acceleration
                }
            }
        };
        const handleTouchEnd = () => {
            setInitialPinchDist(null);
        };

        const container = containerRef.current;
        if (container) {
            // Passive false to allow preventing default if needed, but we usually want default scroll if not pinching
            // For zoom checking, simple listener
            container.addEventListener('touchstart', handleTouchStart);
            container.addEventListener('touchmove', handleTouchMove);
            container.addEventListener('touchend', handleTouchEnd);
        }
        return () => {
            if (container) {
                container.removeEventListener('touchstart', handleTouchStart);
                container.removeEventListener('touchmove', handleTouchMove);
                container.removeEventListener('touchend', handleTouchEnd);
            }
        }
    }, [initialPinchDist, setCanvasScale]);

    useEffect(() => {
        const handleResize = () => {
            // Resize should repack for display but NOT save to server (prevents overwriting server layout with local width)
            onPackRef.current(null, null, false)
        }
        window.addEventListener('resize', handleResize)

        const timer = setTimeout(() => { onPackRef.current(null, null, false) }, 300)
        return () => {
            clearTimeout(timer)
            window.removeEventListener('resize', handleResize)
        }
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
                    const width = baseSize * aspectRatio
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

        if (changes.isCopy && changes.newFile) {
            // Handle Copy - Create New Item
            setUploading(true)
            const publicUrl = await uploadImage(changes.newFile)
            setUploading(false)
            if (publicUrl) {
                const img = new Image()
                img.src = publicUrl
                await new Promise(r => img.onload = r)
                const aspectRatio = img.naturalWidth / img.naturalHeight
                const width = baseSize * aspectRatio // Float precision

                // Find original to copy styles? or just default?
                // The newFile is the cropped blob.

                const newItem = {
                    id: crypto.randomUUID(),
                    collage_id: collageId, type: 'image', content: publicUrl,
                    x: 0, y: 0, width: width || 200, height: baseSize || 200,
                    aspect_ratio: aspectRatio,
                    z_index: items.length + 1,
                    style: { ...changes.style, scale: 1 } // Reset scale for cropped image
                }

                updatedList = [...items, newItem];
                // Check if we need to pack immediately?
                // Probably yes.
                const container = document.querySelector('.pull-to-refresh-container') || document.querySelector('.canvas-container');
                const containerW = container?.clientWidth || window.innerWidth;
                const safeW = Math.max(containerW, 320);
                const packingWidth = (safeW - 40) / canvasScale;
                const packed = await new Promise(resolve => {
                    // Determine if we have access to packItemsTight here?
                    // onPack handles packing logic passed from App.
                    // But onPack expects (width, list).
                    // We can just call onPack(packingWidth, updatedList) but onPack in App calls setItems.
                    // So we should just call onPack.
                    resolve(updatedList)
                })
                // Wait, onPack in App.jsx sets items. We should pass the LIST to onPack.

                // But wait, updateItem logic usually setsItems itself?
                // Line 97: setItems(updatedList).
                // So we should do that.

                // For layout re-calc, we should call onPack logic?
                // existing logic for handleFiles calls onPack.

                // Let's just append and let onPack handle it via the ref? 
                // App.jsx logic for handleFiles calls onPack explicitly.

                // Here we can just call setItems and then onPack.
                // onPack is passed as prop.
                onPack(packingWidth, updatedList);
                return; // onPack will set items and save
            }
        }
        else if (changes.newFile) {
            setUploading(true)
            const publicUrl = await uploadImage(changes.newFile)
            setUploading(false)
            if (publicUrl) {
                // Load image to get actual new aspect ratio
                const img = new Image()
                img.src = publicUrl
                await new Promise(r => img.onload = r)
                const aspectRatio = img.naturalWidth / img.naturalHeight
                const width = baseSize * aspectRatio
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

    const totalHeight = items.reduce((max, item) => Math.max(max, item.y + item.height), 0);

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
                    height: totalHeight > 0 ? `${totalHeight * canvasScale + 60}px` : '100%', // Reduced buffer per request
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
