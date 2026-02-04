export function Sidebar({ isOpen, onClose, sets, currentSetId, onSwitchSet, onCreateSet, onRenameSet, onDeleteSet }) {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2500,
                    backdropFilter: 'blur(3px)',
                    opacity: isOpen ? 1 : 0, transition: 'opacity 0.3s'
                }}
            />
            {/* Sidebar Panel */}
            <div style={{
                position: 'fixed', top: 0, left: 0, bottom: 0,
                width: '80%', maxWidth: '300px',
                background: '#1a1a1a',
                boxShadow: '5px 0 20px rgba(0,0,0,0.5)',
                zIndex: 2501,
                transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                display: 'flex', flexDirection: 'column',
                borderRight: '1px solid #333'
            }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Collages</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {sets.map(set => (
                        <div
                            key={set.id}
                            onClick={() => { onSwitchSet(set.id); onClose(); }}
                            style={{
                                padding: '15px 12px',
                                margin: '5px 0',
                                borderRadius: '8px',
                                background: set.id === currentSetId ? '#333' : 'transparent',
                                color: set.id === currentSetId ? '#fff' : '#aaa',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                        >
                            <span style={{ fontWeight: set.id === currentSetId ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{set.name}</span>

                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newName = prompt("Rename collage:", set.name);
                                        if (newName && newName.trim()) onRenameSet(set.id, newName.trim());
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', fontSize: '1rem' }}
                                >✏️</button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm("Delete this collage?")) onDeleteSet(set.id);
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', fontSize: '1rem', color: '#ff6666' }}
                                >🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ padding: '20px', borderTop: '1px solid #333' }}>
                    <button
                        onClick={() => {
                            const name = prompt("Enter new collage name:");
                            if (name) { onCreateSet(name); onClose(); }
                        }}
                        style={{
                            width: '100%', padding: '12px',
                            background: '#007bff', color: 'white',
                            border: 'none', borderRadius: '8px',
                            fontWeight: 'bold', cursor: 'pointer'
                        }}
                    >
                        + New Collage
                    </button>
                </div>
            </div>
        </>
    );
}
