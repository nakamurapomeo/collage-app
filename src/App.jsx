import { useState, useRef, useEffect, useCallback } from 'react'
import { apiClient } from './apiClient'
import { Header } from './components/Header'
import { Canvas } from './components/Canvas'
import { TextModal } from './components/TextModal'
import { Login } from './components/Login'
import { packItemsTight } from './utils/packing'
import JSZip from 'jszip'

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [authChecking, setAuthChecking] = useState(true)
    const [globalError, setGlobalError] = useState(null)

    const [collageId, setCollageId] = useState(null)
    const [collageSets, setCollageSets] = useState([])
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [syncStatus, setSyncStatus] = useState('saved')
    const [baseSize, setBaseSize] = useState(100)
    const [canvasScale, setCanvasScale] = useState(1)

    const [showTextModal, setShowTextModal] = useState(false)
    const [toast, setToast] = useState(null)
    const fileInputRef = useRef(null)

    // Auth Check
    useEffect(() => {
        async function checkAuth() {
            const { loggedIn } = await apiClient.auth.check()
            setIsLoggedIn(loggedIn)
            setAuthChecking(false)
        }
        checkAuth()
    }, [])

    // Initialize Data (Only if logged in)
    // Initialize Data (Only if logged in)
    // Initialize Data (Only if logged in)
    const fetchCollages = useCallback(async () => {
        if (!isLoggedIn) return
        setLoading(true)
        setGlobalError(null)

        // 1. Fetch List
        const { data: listData, error: listError } = await apiClient.collages.list()

        if (listError) {
            console.error("Failed to fetch collages:", listError)
            setGlobalError(listError)
            setLoading(false)
            return
        }

        if (listData) {
            setCollageSets(listData)
            if (!collageId && listData.length > 0) setCollageId(listData[0].id)
            else if (!collageId && listData.length === 0) createCollage('My First Collage')
        }

        // 2. Fetch Current Collage Items (if selected or just set)
        const targetId = collageId || (listData && listData.length > 0 ? listData[0].id : null)

        if (targetId) {
            const { data: collageData } = await apiClient.collages.get(targetId)
            if (collageData) {
                const loadedItems = collageData.items || []
                setItems(loadedItems)
                // Re-pack if needed, but usually just display is fine
                if (loadedItems.length > 0) {
                    const packed = packItemsTight(loadedItems, window.innerWidth / canvasScale, baseSize)
                    setItems(packed)
                }
            }
        }

        setLoading(false)
        setLoading(false)
    }, [isLoggedIn, collageId]) // Removed canvasScale, baseSize from dependencies

    // Main Data Fetch Effect (Initial & on ID change)
    useEffect(() => {
        if (isLoggedIn) fetchCollages()
    }, [isLoggedIn, collageId])

    // Background Polling for Real-time Sync
    useEffect(() => {
        if (!isLoggedIn || !collageId) return

        const interval = setInterval(async () => {
            // Skip polling if we are currently loading, have unsaved changes, or show modal
            if (loading || syncStatus === 'unsaved' || showTextModal) return

            // Fetch current collage items silently
            const { data: collageData } = await apiClient.collages.get(collageId)
            if (collageData && Array.isArray(collageData.items)) {
                // simple check to avoid unnecessary state updates if nothing changed
                const currentItemsStr = JSON.stringify(items)
                const serverItemsStr = JSON.stringify(collageData.items)

                if (currentItemsStr !== serverItemsStr) {
                    // Update items and re-pack
                    const loadedItems = collageData.items
                    const packed = packItemsTight(loadedItems, window.innerWidth / canvasScale, baseSize)
                    setItems(packed)
                }
            }
        }, 5000) // Poll every 5 seconds

        return () => clearInterval(interval)
    }, [isLoggedIn, collageId, loading, syncStatus, items, canvasScale, baseSize, showTextModal])


    // Actions
    const handleLogin = async (password) => {
        const { error } = await apiClient.auth.login(password)
        if (!error) {
            setIsLoggedIn(true)
            return { success: true }
        }
        return { success: false, error }
    }

    const createCollage = async (name) => {
        const newId = crypto.randomUUID()
        const newSet = { id: newId, name, created_at: new Date().toISOString() }

        setCollageSets(prev => [...prev, newSet])
        setCollageId(newId)

        const { error } = await apiClient.collages.save(newId, name, [])
        if (error) {
            alert('Failed to create collage on server: ' + error)
        }
    }

    const renameCollage = async (id, newName) => {
        const oldSets = collageSets
        setCollageSets(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s))
        const { error } = await apiClient.collages.save(id, newName)
        if (error) {
            alert('Failed to rename collage: ' + error)
            setCollageSets(oldSets)
        }
    }

    const deleteCollage = async (id) => {
        if (collageSets.length <= 1) { alert("Cannot delete the last set."); return; }
        if (!confirm("Are you sure you want to delete this collage?")) return

        const oldSets = collageSets
        const oldId = collageId
        const remaining = collageSets.filter(s => s.id !== id)

        setCollageSets(remaining)
        if (collageId === id) setCollageId(remaining[0].id)

        const { error } = await apiClient.collages.delete(id)
        if (error) {
            alert('Failed to delete collage: ' + error)
            setCollageSets(oldSets)
            setCollageId(oldId)
        }
    }

    const saveCollage = async (overrideItems) => {
        if (!collageId || loading) return // Prevent saving while loading or if not ready
        setSyncStatus('unsaved')
        const targetItems = overrideItems || items
        const currentName = collageSets.find(s => s.id === collageId)?.name || 'Collage'

        const { error } = await apiClient.collages.save(collageId, currentName, targetItems)
        if (error) {
            setSyncStatus('error')
            console.error('Save error:', error)
        } else {
            setSyncStatus('saved')
        }
    }

    const handleAddText = async ({ text, color, size }) => {
        const width = text.length * size * 0.6
        const newItem = {
            id: 'text-' + Date.now(),
            collage_id: collageId, type: 'text', content: text,
            x: 0, y: 0, width: width, height: size * 1.5,
            style: { color, fontSize: size }, z_index: items.length + 10
        }
        const newItems = [...items, newItem]

        // Pack
        const packed = packItemsTight(newItems, window.innerWidth / canvasScale, baseSize)
        setItems(packed)

        // Save
        await saveCollage(packed)
    }

    const handlePack = useCallback((customWidth = null, itemsToPack = null) => {
        const width = customWidth || window.innerWidth / canvasScale
        const targetItems = itemsToPack || items
        const packed = packItemsTight(targetItems, width, baseSize)
        setItems(packed)
        saveCollage(packed) // Use saveCollage helper
    }, [items, baseSize, collageId, canvasScale])

    const handleShuffle = useCallback(() => {
        const width = window.innerWidth / canvasScale
        const shuffled = [...items].sort(() => Math.random() - 0.5)
        const packed = packItemsTight(shuffled, width, baseSize)
        setItems(packed)
        saveCollage(packed)
    }, [items, baseSize, collageId, canvasScale])

    const handlePasteImage = async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            let pasted = false;
            for (const item of clipboardItems) {
                if (item.types.some(type => type.startsWith('image/'))) {
                    const blob = await item.getType(item.types.find(type => type.startsWith('image/')));
                    // Mock file object (Canvas expects File)
                    const file = new File([blob], "pasted-image.png", { type: blob.type });
                    // Access Canvas handler via ref? No, better pass to a handler or expose Canvas method.
                    // Actually, Header is sibling to Canvas. We need to pass data down or lift state up.
                    // Easier: Pass file to Canvas via a prop that triggers default upload? 
                    // Or better: Let App handle upload then add item. 
                    // Let's reuse the hidden file input in Header/Canvas!
                    // Wait, fileInputRef is in Header (or passed to it). But we can't programmatically set files on input.
                    // Solution: We'll implement a direct upload handler in App and add item.
                    const path = `${collageId}/${Date.now()}-pasted.png`
                    setLoading(true)
                    const { data: publicUrl, error } = await apiClient.storage.upload(file, path)

                    if (publicUrl) {
                        const img = new Image()
                        img.src = publicUrl
                        await new Promise(r => img.onload = r)
                        const aspectRatio = img.naturalWidth / img.naturalHeight
                        const width = Math.floor(baseSize * aspectRatio)
                        const newItem = {
                            id: crypto.randomUUID(),
                            collage_id: collageId, type: 'image', content: publicUrl,
                            x: 0, y: 0, width: width || 200, height: baseSize || 200,
                            z_index: items.length + 1, style: {}
                        }
                        const newItems = [...items, newItem]
                        // Pack and Save
                        const packed = packItemsTight(newItems, window.innerWidth / canvasScale, baseSize)
                        setItems(packed)
                        await saveCollage(packed)
                        setToast('Pasted! 📋')
                        setTimeout(() => setToast(null), 2000)
                        pasted = true;
                    }
                    setLoading(false)
                }
            }
            if (!pasted) alert("No image found in clipboard");
        } catch (err) {
            console.error(err);
            alert("Failed to read clipboard: " + err);
        }
    };

    const handleReorderSets = async (newSets) => {
        setCollageSets(newSets);
        // Persist order (update entire list)
        // Note: API save logic for sets usually updates individual metadata.
        // We might need a bulk update endpoint or just re-saving the list index is implicitly handled by some backends.
        // Our KV implementation has `collage_list` key. We need an API to update THE LIST ORDER.
        // Currently `apiClient.collages.list` gets it, but save updates single.
        // Let's assume we need to update the list key. 
        // We'll add a specific endpoint/method or just abuse saving one item to trigger list update? 
        // No, we need to update the list explicitly. 
        // Let's add `apiClient.collages.reorder(newSets)`
        await apiClient.collages.reorder(newSets)
    };
    const handleExportZip = async () => {
        const zip = new JSZip();
        for (const item of items) {
            if (item.type === 'image') {
                try {
                    const res = await fetch(item.content);
                    const blob = await res.blob();
                    const ext = item.content.split('.').pop().split('?')[0] || 'png';
                    zip.file(`image-${item.id}.${ext}`, blob);
                } catch (e) { console.error(e); }
            }
        }
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `collage-${collageId}.zip`;
        link.click();
    };

    const handleImportZip = async (file) => {
        alert("Import ZIP is coming soon! For now, please add images directly.");
    };

    if (authChecking) return <div style={{ color: 'white', padding: 20 }}>Loading...</div>
    if (!isLoggedIn) return <Login onLogin={handleLogin} />

    if (globalError) return (
        <div style={{ color: 'white', padding: 40, textAlign: 'center' }}>
            <h2 style={{ color: '#ff4444' }}>Connection Error</h2>
            <p>{globalError}</p>
            <p style={{ color: '#888', fontSize: '0.9em' }}>
                Please check your Cloudflare settings (KV Bindings, Environment Variables).
            </p>
            <button onClick={() => location.reload()} style={{ padding: '10px 20px', marginTop: 20, cursor: 'pointer' }}>Retry</button>
        </div>
    )

    const currentSet = collageSets.find(s => s.id === collageId)
    if (!collageId) return <div style={{ color: 'white', padding: 20 }}>Loading Collage...</div>

    return (
        <div className="app-container">
            <Header
                title={currentSet?.name || 'Collage'}
                sets={collageSets} currentSetId={collageId}
                onSwitchSet={setCollageId} onCreateSet={createCollage} onRenameSet={renameCollage} onDeleteSet={deleteCollage}
                onExportZip={handleExportZip} onImportZip={handleImportZip}
                status={syncStatus}
                onPack={() => handlePack()}
                onShuffle={handleShuffle}
                canvasScale={canvasScale} setCanvasScale={setCanvasScale}
                fileInputRef={fileInputRef} onAddImage={() => fileInputRef.current?.click()} onAddText={() => setShowTextModal(true)}
                onRefresh={fetchCollages}
                onPaste={handlePasteImage}
                onReorderSets={handleReorderSets}
            />
            <Canvas
                items={items} setItems={setItems} collageId={collageId}
                fileInputRef={fileInputRef} baseSize={baseSize}
                canvasScale={canvasScale} setCanvasScale={setCanvasScale}
                onPack={handlePack} onShuffle={handleShuffle}
                // Pass saveCollage to Canvas for image updates
                onSave={saveCollage}
                onRefresh={fetchCollages} // Added for Pull-to-Refresh
            />
            {showTextModal && <TextModal onClose={() => setShowTextModal(false)} onAdd={handleAddText} />}

            {toast && (
                <div style={{
                    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0, 122, 255, 0.9)', color: 'white', padding: '10px 24px',
                    borderRadius: '30px', zIndex: 2000, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    animation: 'fadeInOut 2s forwards', fontWeight: 'bold'
                }}>
                    {toast}
                </div>
            )}
            <style>{`
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translate(-50%, 20px); }
                    15% { opacity: 1; transform: translate(-50%, 0); }
                    85% { opacity: 1; transform: translate(-50%, 0); }
                    100% { opacity: 0; transform: translate(-50%, -20px); }
                }
            `}</style>
        </div>
    )
}
export default App
