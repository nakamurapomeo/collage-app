import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

export function useCollage(collageId) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)

    // Initial Fetch
    useEffect(() => {
        if (!collageId) return

        const fetchItems = async () => {
            setLoading(true)
            const { data, error } = await supabase
                .from('collage_items')
                .select('*')
                .eq('collage_id', collageId)
                .order('created_at', { ascending: true })

            if (error) {
                console.error('Error fetching items:', error)
            } else {
                setItems(data || [])
            }
            setLoading(false)
        }

        fetchItems()

        // Realtime Subscription
        const channel = supabase
            .channel(`collage-${collageId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'collage_items', filter: `collage_id=eq.${collageId}` },
                (payload) => {
                    // console.log('Realtime change:', payload)
                    if (payload.eventType === 'INSERT') {
                        setItems(prev => {
                            if (prev.find(i => i.id === payload.new.id)) return prev
                            return [...prev, payload.new]
                        })
                    } else if (payload.eventType === 'UPDATE') {
                        setItems(prev => prev.map(item => item.id === payload.new.id ? payload.new : item))
                    } else if (payload.eventType === 'DELETE') {
                        setItems(prev => prev.filter(item => item.id !== payload.old.id))
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [collageId])

    // Actions
    const addItem = async (type, content, x, y) => {
        const newItem = {
            collage_id: collageId,
            type,
            content, // URL or Text
            x,
            y,
            width: 200,
            height: 200,
            z_index: items.length + 1
        }
        const { error } = await supabase.from('collage_items').insert([newItem])
        if (error) console.error('Error adding item:', error)
    }

    const updateItem = async (id, changes) => {
        // Optimistic update
        setItems(prev => prev.map(item => item.id === id ? { ...item, ...changes } : item))

        // DB update (throttled/debounced in a real app, but direct for now)
        const { error } = await supabase.from('collage_items').update(changes).eq('id', id)
        if (error) console.error('Error updating item:', error)
    }

    const deleteItem = async (id) => {
        // Optimistic update
        setItems(prev => prev.filter(item => item.id !== id))

        const { error } = await supabase.from('collage_items').delete().eq('id', id)
        if (error) console.error('Error deleting item:', error)
    }

    // Image Upload Helper
    const uploadImage = async (file) => {
        const fileName = `${collageId}/${Date.now()}-${file.name}`
        const { data, error } = await supabase.storage
            .from('collage-images')
            .upload(fileName, file)

        if (error) {
            console.error('Upload error:', error)
            return null
        }

        const { data: { publicUrl } } = supabase.storage
            .from('collage-images')
            .getPublicUrl(fileName)

        return publicUrl
    }

    return { items, loading, addItem, updateItem, deleteItem, uploadImage }
}
