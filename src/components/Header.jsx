import React, { useState } from 'react';

export function Header({
    title,
    sets,
    currentSetId,
    onSwitchSet,
    onCreateSet,
    onRenameSet,
    onDeleteSet,
    onExportZip,
    onImportZip,
    onSettings,
    onAddImage,
    onAddText,
    onPack,
    onShuffle,
    canvasScale,
    setCanvasScale,
    onRefresh,
    status,
    fileInputRef,
    onPaste,
    onReorderSets,
    onToggleSidebar
}) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [newSetName, setNewSetName] = useState('');
    const [editName, setEditName] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [showMenu, setShowMenu] = useState(false);

    // Simple responsive check
    const [isMobile, setIsMobile] = useState(window.innerWidth < 600);
    React.useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 600);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleCreate = () => {
        if (newSetName.trim()) {
            onCreateSet(newSetName); setNewSetName(''); setShowDropdown(false);
        }
    };
    const startRename = (set) => { setEditName(set.id); setEditNameValue(set.name); };
    const saveRename = (id) => { if (editNameValue.trim()) onRenameSet(id, editNameValue); setEditName(null); }

    // Drag & Drop for Sets
    const [draggingId, setDraggingId] = useState(null);
    const [dropTarget, setDropTarget] = useState(null); // { id: string, position: 'top' | 'bottom' }

    const handleDragStart = (e, id) => {
        setDraggingId(id);
    };

    const handleDragOver = (e, id) => {
        e.preventDefault();
        if (draggingId === id) { setDropTarget(null); return; }

        const rect = e.target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const position = e.clientY < midY ? 'top' : 'bottom';
        setDropTarget({ id, position });
    };

    const handleDrop = (e, targetId) => {
        e.preventDefault();
        if (!draggingId || !dropTarget || draggingId === targetId) {
            setDraggingId(null); setDropTarget(null); return;
        }

        const newSets = [...sets];
        const dragIndex = newSets.findIndex(s => s.id === draggingId);
        const [draggedItem] = newSets.splice(dragIndex, 1);

        const targetIndex = newSets.findIndex(s => s.id === targetId);
        // If bottom, insert after. If top, insert at index.
        const insertIndex = dropTarget.position === 'bottom' ? targetIndex + 1 : targetIndex;

        newSets.splice(insertIndex, 0, draggedItem);
        onReorderSets(newSets);

        setDraggingId(null);
        setDropTarget(null);
    };

    // Mobile layout adjustments
    const titleStyle = isMobile ? { fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' } : { fontSize: '1.2rem' };
    const buttonStyle = { fontSize: '1.2rem', padding: '5px', background: 'transparent', border: 'none', cursor: 'pointer' };

    return (
        <header style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: '60px',
            background: 'rgba(20, 20, 20, 0.95)', backdropFilter: 'blur(10px)',
            borderBottom: '1px solid #333', display: 'flex', alignItems: 'center',
            padding: isMobile ? '0 10px' : '0 20px', zIndex: 1000, justifyContent: 'space-between'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '5px' : '15px' }}>
                {/* Set Selector */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={onToggleSidebar}
                        style={{ background: 'transparent', color: '#ffd700', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', border: 'none', ...titleStyle }}
                    >
                        {title} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>☰</span>
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                {/* Status Indicator (Always visible now) */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {status === 'loading' && <span style={{ color: '#aaa', fontSize: '12px' }}>↻</span>}
                    {status === 'saved' && <span style={{ color: '#4caf50', fontSize: '12px' }}>✓</span>}
                    {status === 'unsaved' && <span style={{ color: '#ff9800', fontSize: '12px' }}>...</span>}
                    {status === 'error' && <span style={{ color: '#f44', fontSize: '12px' }}>✕</span>}
                </div>
                {!isMobile && <div style={{ width: 1, height: 20, background: '#444', margin: '0 5px' }}></div>}

                {/* Refresh Button */}
                <button onClick={onRefresh} title="Refresh" style={buttonStyle}>🔄</button>

                {/* Zoom Controls */}
                {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', background: '#333', borderRadius: '20px', padding: '2px 8px' }}>
                        <button onClick={() => setCanvasScale(s => Math.max(0.1, s - 0.1))} style={{ fontSize: '1rem', background: 'transparent', color: 'white', padding: '0 5px', border: 'none', cursor: 'pointer' }}>-</button>
                        <span style={{ color: 'white', fontSize: '0.8rem', minWidth: '35px', textAlign: 'center' }}>{Math.round(canvasScale * 100)}%</span>
                        <button onClick={() => setCanvasScale(s => Math.min(3, s + 0.1))} style={{ fontSize: '1rem', background: 'transparent', color: 'white', padding: '0 5px', border: 'none', cursor: 'pointer' }}>+</button>
                    </div>
                )}

                {/* Main Actions */}
                {!isMobile && (
                    <>
                        <button onClick={onShuffle} title="Shuffle" style={buttonStyle}>🎲</button>
                        <button onClick={onAddText} title="Add Text" style={buttonStyle}>Aa</button>
                    </>
                )}

                {/* Add Actions (Always visible) */}
                <button onClick={onPaste} title="Paste from Clipboard" style={buttonStyle}>📋</button>
                <button onClick={() => fileInputRef.current?.click()} title="Add Image" style={buttonStyle}>📷</button>

                {/* Menu */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowMenu(!showMenu)} style={buttonStyle}>≡</button>
                    {showMenu && (
                        <>
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }} onClick={() => setShowMenu(false)} />
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, width: '180px',
                                background: '#222', border: '1px solid #444', borderRadius: '8px', padding: '5px',
                                display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 1002
                            }}>
                                {isMobile && (
                                    <>
                                        <div style={{ padding: '5px 10px', color: '#aaa', fontSize: '0.8rem', borderBottom: '1px solid #444' }}>
                                            Zoom: {Math.round(canvasScale * 100)}%
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                                                <button onClick={() => setCanvasScale(s => Math.max(0.1, s - 0.1))} style={{ ...buttonStyle, background: '#333', borderRadius: 4, width: '45%' }}>-</button>
                                                <button onClick={() => setCanvasScale(s => Math.min(3, s + 0.1))} style={{ ...buttonStyle, background: '#333', borderRadius: 4, width: '45%' }}>+</button>
                                            </div>
                                        </div>
                                        <button onClick={() => { onShuffle(); setShowMenu(false); }} style={{ textAlign: 'left', background: 'transparent', padding: '10px', color: 'white', border: 'none' }}>🎲 Shuffle</button>
                                        <button onClick={() => { onAddText(); setShowMenu(false); }} style={{ textAlign: 'left', background: 'transparent', padding: '10px', color: 'white', border: 'none' }}>Aa Add Text</button>
                                    </>
                                )}
                                <button onClick={() => { onExportZip(); setShowMenu(false); }} style={{ textAlign: 'left', background: 'transparent', padding: '10px', color: 'white', border: 'none' }}>📤 Export ZIP</button>
                                <label style={{ display: 'block', padding: '10px', cursor: 'pointer', textAlign: 'left', color: 'white', fontSize: '13.33px' }}>
                                    📥 Import ZIP
                                    <input type="file" accept=".zip" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) onImportZip(e.target.files[0]); setShowMenu(false); }} />
                                </label>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
