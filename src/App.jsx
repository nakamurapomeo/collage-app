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

    // Main Data Fetch Effect
    useEffect(() => {
        if (isLoggedIn) fetchCollages()
    }, [isLoggedIn, collageId]) // Reacts to ID change too


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

    const handleExportZip = async () => { /* ... */ }
    const handleImportZip = async () => { /* ... */ }

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
            />
            <Canvas
                items={items} setItems={setItems} collageId={collageId}
                fileInputRef={fileInputRef} baseSize={baseSize}
                canvasScale={canvasScale} setCanvasScale={setCanvasScale}
                onPack={handlePack} onShuffle={handleShuffle}
                // Pass saveCollage to Canvas for image updates
                onSave={saveCollage}
            />
            {showTextModal && <TextModal onClose={() => setShowTextModal(false)} onAdd={handleAddText} />}
        </div>
    )
}
export default App
