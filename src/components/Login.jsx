import { useState } from 'react'

export function Login({ onLogin }) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        // Call onLogin prop which calls API
        const success = await onLogin(password)

        if (!success) {
            setError('Incorrect password')
            setLoading(false)
        }
        // If success, parent handles transition
    }

    return (
        <div style={{
            height: '100vh', width: '100vw', background: '#121212', color: 'white',
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <form onSubmit={handleSubmit} style={{
                background: '#222', padding: '40px', borderRadius: '8px',
                display: 'flex', flexDirection: 'column', gap: '20px', width: '300px'
            }}>
                <h2 style={{ textAlign: 'center', margin: 0 }}>Login</h2>

                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{
                        padding: '10px', borderRadius: '4px', border: '1px solid #444',
                        background: '#111', color: 'white'
                    }}
                />

                {error && <div style={{ color: '#ff4444', fontSize: '14px', textAlign: 'center' }}>{error}</div>}

                <button
                    type="submit" disabled={loading}
                    style={{
                        padding: '10px', borderRadius: '4px', border: 'none',
                        background: '#ffd700', color: 'black', fontWeight: 'bold',
                        cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? 'Entering...' : 'Enter'}
                </button>
            </form>
        </div>
    )
}
