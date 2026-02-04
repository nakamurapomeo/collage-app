import { useState } from 'react'

export function Sidebar({ isOpen, onClose, sets, currentSetId, onSwitchSet, onCreateSet, onUpdateMetadata, onDeleteSet }) {
    if (!isOpen) return null;

    const COLORS = [
        '#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF6', '#FFFF33',
        '#FF3380', '#8033FF', '#33FFAB', '#FF8C33', '#FFFFFF', '#000000'
    ]

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', zIndex: 2500,
                    backdropFilter: 'blur(5px)',
                    opacity: isOpen ? 1 : 0, transition: 'opacity 0.3s'
                }}
            />
            {/* Sidebar Panel */}
            <div style={{
                position: 'fixed', top: 0, left: 0, bottom: 0,
                width: '85%', maxWidth: '320px',
                background: 'rgba(30,30,30,0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '10px 0 30px rgba(0,0,0,0.5)',
                zIndex: 2501,
                transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)',
                display: 'flex', flexDirection: 'column',
                color: 'white'
            }}>
                <div style={{ padding: '25px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', letterSpacing: '0.5px' }}>Collages</h2>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '1.2rem', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                    {sets.map(set => (
                        <SidebarItem
                            key={set.id}
                            set={set}
                            isCurrent={set.id === currentSetId}
                            onSelect={() => { onSwitchSet(set.id); onClose(); }}
                            onUpdate={onUpdateMetadata}
                            onDelete={onDeleteSet}
                            colors={COLORS}
                        />
                    ))}
                </div>

                <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                    <button
                        onClick={() => {
                            const name = prompt("Enter new collage name:");
                            if (name) { onCreateSet(name); onClose(); }
                        }}
                        style={{
                            width: '100%', padding: '14px',
                            background: 'linear-gradient(135deg, #007bff, #00d2ff)',
                            color: 'white',
                            border: 'none', borderRadius: '12px',
                            fontWeight: 'bold', fontSize: '1rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0,123,255,0.4)',
                            transition: 'transform 0.2s',
                        }}
                        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        + New Collage
                    </button>
                </div>
            </div>
        </>
    );
}

function SidebarItem({ set, isCurrent, onSelect, onUpdate, onDelete, colors }) {
    const [showColorPicker, setShowColorPicker] = useState(false);

    // Default color if none set
    const themeColor = set.color || '#444';

    return (
        <div style={{
            marginBottom: '10px',
            borderRadius: '12px',
            background: isCurrent ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
            border: isCurrent ? `1px solid ${set.color || '#fff'}` : '1px solid transparent',
            transition: 'all 0.2s',
            overflow: 'hidden'
        }}>
            <div
                onClick={onSelect}
                style={{
                    padding: '15px',
                    display: 'flex', alignItems: 'center', gap: '15px',
                    cursor: 'pointer'
                }}
            >
                {/* Color Dot / Picker Trigger */}
                <div
                    onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
                    style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: themeColor,
                        border: '2px solid rgba(255,255,255,0.8)',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                        flexShrink: 0
                    }}
                />

                <span style={{ flex: 1, fontWeight: isCurrent ? 'bold' : '500', fontSize: '1.05rem' }}>{set.name}</span>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        const newName = prompt("Rename:", set.name);
                        if (newName) onUpdate(set.id, { name: newName });
                    }} style={iconButtonStyle}>✏️</button>

                    <button onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete?')) onDelete(set.id);
                    }} style={iconButtonStyle}>🗑️</button>
                </div>
            </div>

            {/* Color Picker Drawer */}
            {showColorPicker && (
                <div style={{
                    padding: '0 15px 15px 15px',
                    display: 'flex', flexWrap: 'wrap', gap: '8px',
                    animation: 'fadeIn 0.2s'
                }}>
                    <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                    {colors.map(c => (
                        <div
                            key={c}
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdate(set.id, { color: c });
                                setShowColorPicker(false);
                            }}
                            style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: c,
                                cursor: 'pointer',
                                border: set.color === c ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                                transform: set.color === c ? 'scale(1.1)' : 'scale(1)',
                                transition: 'transform 0.1s'
                            }}
                        />
                    ))}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUpdate(set.id, { color: null }); // Reset
                            setShowColorPicker(false);
                        }}
                        style={{
                            fontSize: '0.8rem', padding: '5px 10px', borderRadius: '15px',
                            background: 'rgba(255,255,255,0.1)', color: '#aaa', border: 'none', cursor: 'pointer'
                        }}
                    >Reset</button>
                </div>
            )}
        </div>
    )
}

const iconButtonStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: 'none',
    borderRadius: '6px',
    width: '32px', height: '32px',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1rem',
    color: '#ccc'
}
