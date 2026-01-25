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
    onShuffle, // New
    canvasScale, // New
    setCanvasScale, // New
    status,
    fileInputRef
}) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [newSetName, setNewSetName] = useState('');
    const [editName, setEditName] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [showMenu, setShowMenu] = useState(false);

    const handleCreate = () => {
        if (newSetName.trim()) {
            onCreateSet(newSetName); setNewSetName(''); setShowDropdown(false);
        }
    };
    const startRename = (set) => { setEditName(set.id); setEditNameValue(set.name); };
    const saveRename = (id) => { if (editNameValue.trim()) onRenameSet(id, editNameValue); setEditName(null); }

    return (
        <header style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: '60px',
            background: 'rgba(20, 20, 20, 0.95)', backdropFilter: 'blur(10px)',
            borderBottom: '1px solid #333', display: 'flex', alignItems: 'center',
            padding: '0 20px', zIndex: 1000, justifyContent: 'space-between'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {/* Set Selector */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        style={{ background: 'transparent', fontSize: '1.2rem', color: '#ffd700', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        {title} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>▼</span>
                    </button>
                    {showDropdown && (
                        <>
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, cursor: 'default' }} onClick={() => setShowDropdown(false)} />
                            <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '250px', background: '#222', border: '1px solid #444', borderRadius: '8px', zIndex: 1001, padding: '5px' }}>
                                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                    {sets.map(set => (
                                        <div key={set.id} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', color: set.id === currentSetId ? '#ffd700' : '#ddd' }}>
                                            {editName === set.id ? (
                                                <input value={editNameValue} onChange={e => setEditNameValue(e.target.value)} onBlur={() => saveRename(set.id)} autoFocus style={{ background: '#333', color: 'white', border: 'none' }} />
                                            ) : (
                                                <span onClick={() => { onSwitchSet(set.id); setShowDropdown(false) }} style={{ cursor: 'pointer', flex: 1 }}>{set.name}</span>
                                            )}
                                            <div style={{ display: 'flex', gap: 5 }}>
                                                <button onClick={(e) => { e.stopPropagation(); startRename(set) }} style={{ background: 'transparent' }}>✏️</button>
                                                <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) onDeleteSet(set.id) }} style={{ background: 'transparent', color: '#f44' }}>🗑️</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ borderTop: '1px solid #444', padding: '5px', display: 'flex' }}>
                                    <input placeholder="New Set..." value={newSetName} onChange={e => setNewSetName(e.target.value)} style={{ flex: 1, background: '#333', border: 'none', color: 'white', padding: 5 }} />
                                    <button onClick={handleCreate}>＋</button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Status Indicator */}
                {status === 'loading' && <span style={{ color: '#aaa', fontSize: '12px' }}>Loading...</span>}
                {status === 'saved' && <span style={{ color: '#4caf50', fontSize: '12px' }}>✓</span>}
                {status === 'unsaved' && <span style={{ color: '#ff9800', fontSize: '12px' }}>...</span>}
                {status === 'error' && <span style={{ color: '#f44', fontSize: '12px' }} title="Save failed">✕</span>}

                <div style={{ width: 1, height: 20, background: '#444', margin: '0 5px' }}></div>

                {/* Zoom Controls */}
                <div style={{ display: 'flex', alignItems: 'center', background: '#333', borderRadius: '20px', padding: '2px 8px' }}>
                    <button onClick={() => setCanvasScale(s => Math.max(0.1, s - 0.1))} style={{ fontSize: '1rem', background: 'transparent', color: 'white', padding: '0 5px' }}>-</button>
                    <span style={{ color: 'white', fontSize: '0.8rem', minWidth: '35px', textAlign: 'center' }}>{Math.round(canvasScale * 100)}%</span>
                    <button onClick={() => setCanvasScale(s => Math.min(3, s + 0.1))} style={{ fontSize: '1rem', background: 'transparent', color: 'white', padding: '0 5px' }}>+</button>
                </div>

                {/* Main Actions */}
                <button onClick={onShuffle} title="Shuffle" style={{ fontSize: '1.2rem', padding: '5px', background: 'transparent' }}>🎲</button>
                <button onClick={() => fileInputRef.current?.click()} title="Add Image" style={{ fontSize: '1.2rem', padding: '5px', background: 'transparent' }}>📷</button>
                <button onClick={onAddText} title="Add Text" style={{ fontSize: '1.2rem', padding: '5px', background: 'transparent' }}>Aa</button>

                {/* Menu */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowMenu(!showMenu)} style={{ fontSize: '1.2rem', background: 'transparent' }}>≡</button>
                    {showMenu && (
                        <>
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }} onClick={() => setShowMenu(false)} />
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, width: '150px',
                                background: '#222', border: '1px solid #444', borderRadius: '8px', padding: '5px',
                                display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 1002
                            }}>
                                <button onClick={() => { onExportZip(); setShowMenu(false); }} style={{ textAlign: 'left', background: 'transparent' }}>📤 Export ZIP</button>
                                <label style={{ display: 'block', padding: '8px 16px', cursor: 'pointer', textAlign: 'left', color: 'white', fontSize: '13.33px' }}>
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
