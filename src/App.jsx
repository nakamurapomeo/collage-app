import { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import './App.css';

// IndexedDB setup
const DB_NAME = 'CollageAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'collages';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const saveToDB = async (id, data) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ id, ...data, updatedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const loadFromDB = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllFromDB = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const deleteFromDB = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const readFileAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

const getImageDimensions = (src) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 100, height: 100 });
    img.src = src;
  });
};

function App() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [canvasWidth, setCanvasWidth] = useState(window.innerWidth - 16);
  const [bgColor, setBgColor] = useState('#1a1a2e');
  const [showSettings, setShowSettings] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [currentSaveName, setCurrentSaveName] = useState('');
  const [saveName, setSaveName] = useState('');
  const [savedList, setSavedList] = useState([]);
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [toast, setToast] = useState('');
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState(24);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [baseSize, setBaseSize] = useState(100);
  const [zoomImage, setZoomImage] = useState(null);
  const [isScaling, setIsScaling] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  useEffect(() => {
    getAllFromDB().then(list => setSavedList(list)).catch(console.error);

    const handleResize = () => {
      setCanvasWidth(window.innerWidth - 16);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Gap-free bin packing algorithm
  const packItemsTight = useCallback((itemList, width) => {
    if (itemList.length === 0) return [];

    const packed = [];
    const heights = new Array(Math.ceil(width)).fill(0);

    for (const item of itemList) {
      const itemWidth = Math.floor((item.baseWidth || 100) * (item.scale || 1));
      const itemHeight = Math.floor((item.baseHeight || 100) * (item.scale || 1));

      // Find the best position (lowest point that fits)
      let bestX = 0;
      let bestY = Infinity;

      for (let x = 0; x <= width - itemWidth; x++) {
        // Find max height in this range
        let maxH = 0;
        for (let i = x; i < x + itemWidth && i < heights.length; i++) {
          maxH = Math.max(maxH, heights[i]);
        }
        if (maxH < bestY) {
          bestY = maxH;
          bestX = x;
        }
      }

      // Place the item
      packed.push({ ...item, x: bestX, y: bestY });

      // Update heights
      for (let i = bestX; i < bestX + itemWidth && i < heights.length; i++) {
        heights[i] = bestY + itemHeight;
      }
    }

    return packed;
  }, []);

  // Pack all items
  const packItems = useCallback(() => {
    setItems(prev => packItemsTight(prev, canvasWidth));
  }, [canvasWidth, packItemsTight]);

  // Handle file drop
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const newItems = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await readFileAsDataURL(file);
      const dims = await getImageDimensions(dataUrl);
      const aspectRatio = dims.width / dims.height;
      const baseHeight = baseSize;
      const baseWidth = baseHeight * aspectRatio;

      newItems.push({
        id: Date.now() + i,
        type: 'image',
        src: dataUrl,
        x: 0,
        y: 0,
        baseWidth,
        baseHeight,
        scale: 1,
        aspectRatio
      });
    }

    setItems(prev => packItemsTight([...prev, ...newItems], canvasWidth));
    showToast(`${files.length}枚の画像を追加しました`);
  }, [baseSize, canvasWidth, packItemsTight]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // Handle file input
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    const newItems = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await readFileAsDataURL(file);
      const dims = await getImageDimensions(dataUrl);
      const aspectRatio = dims.width / dims.height;
      const baseHeight = baseSize;
      const baseWidth = baseHeight * aspectRatio;

      newItems.push({
        id: Date.now() + i,
        type: 'image',
        src: dataUrl,
        x: 0,
        y: 0,
        baseWidth,
        baseHeight,
        scale: 1,
        aspectRatio
      });
    }

    setItems(prev => packItemsTight([...prev, ...newItems], canvasWidth));
    e.target.value = '';
    if (files.length > 0) showToast(`${files.length}枚の画像を追加しました`);
  };

  // Drag reordering (not during scaling)
  const handleItemDragStart = (e, item, index) => {
    if (isScaling) {
      e.preventDefault();
      return;
    }
    setDragItem({ item, index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleItemDragOver = (e, index) => {
    e.preventDefault();
    if (dragItem && dragItem.index !== index) {
      setDragOverIndex(index);
    }
  };

  const handleItemDragEnd = () => {
    if (dragItem && dragOverIndex !== null && dragItem.index !== dragOverIndex) {
      setItems(prev => {
        const newItems = [...prev];
        const [movedItem] = newItems.splice(dragItem.index, 1);
        newItems.splice(dragOverIndex, 0, movedItem);
        return packItemsTight(newItems, canvasWidth);
      });
    }
    setDragItem(null);
    setDragOverIndex(null);
  };

  // Update scale and repack
  const updateScale = (id, newScale) => {
    setItems(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, scale: newScale } : i);
      return packItemsTight(updated, canvasWidth);
    });
  };

  // Delete item
  const deleteItem = (id) => {
    setItems(prev => packItemsTight(prev.filter(i => i.id !== id), canvasWidth));
    setSelectedId(null);
  };

  // Shuffle
  const shuffleItems = () => {
    if (items.length === 0) return;
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    setItems(packItemsTight(shuffled, canvasWidth));
    showToast('シャッフルしました');
  };

  // Add text
  const addText = () => {
    if (!textInput.trim()) return;
    const textWidth = Math.min(textInput.length * textSize * 0.6, canvasWidth - 8);
    const newItem = {
      id: Date.now(),
      type: 'text',
      text: textInput,
      color: textColor,
      fontSize: textSize,
      x: 0,
      y: 0,
      baseWidth: textWidth,
      baseHeight: textSize + 12,
      scale: 1
    };
    setItems(prev => packItemsTight([...prev, newItem], canvasWidth));
    setTextInput('');
    setShowTextModal(false);
    showToast('テキストを追加しました');
  };

  // Pixabay API for in-app image search
  const PIXABAY_API_KEY = '47501194-e0373ebfe04c1c4f3e1d42b34'; // Free public demo key

  const searchPixabay = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(searchQuery)}&image_type=photo&per_page=15&safesearch=true`
      );
      const data = await response.json();
      if (data.hits && data.hits.length > 0) {
        const results = data.hits.map((hit, i) => ({
          id: `pixabay-${hit.id}-${i}`,
          thumb: hit.previewURL,
          full: hit.webformatURL,
          alt: hit.tags || searchQuery
        }));
        setSearchResults(results);
      } else {
        setSearchResults([]);
        showToast('画像が見つかりませんでした');
      }
    } catch (err) {
      console.error('Pixabay search error:', err);
      showToast('検索に失敗しました');
    }
    setIsSearching(false);
  };

  const addSearchResult = async (result) => {
    try {
      const response = await fetch(result.full);
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      const dims = await getImageDimensions(dataUrl);
      const aspectRatio = dims.width / dims.height;
      const baseHeight = baseSize;
      const baseWidth = baseHeight * aspectRatio;

      const newItem = {
        id: Date.now(),
        type: 'image',
        src: dataUrl,
        x: 0,
        y: 0,
        baseWidth,
        baseHeight,
        scale: 1,
        aspectRatio
      };
      setItems(prev => packItemsTight([...prev, newItem], canvasWidth));
      showToast('画像を追加しました');
    } catch (err) {
      console.error('Failed to add image:', err);
      showToast('画像の追加に失敗しました');
    }
  };

  // Save/Load
  const saveCollage = async () => {
    if (!saveName.trim()) return;
    await saveToDB(saveName, { items, bgColor, baseSize });
    const list = await getAllFromDB();
    setSavedList(list);
    setCurrentSaveName(saveName);
    setShowSaveModal(false);
    setSaveName('');
    showToast('保存しました');
  };

  const loadCollage = async (name) => {
    const data = await loadFromDB(name);
    if (data) {
      setItems(packItemsTight(data.items || [], canvasWidth));
      setBgColor(data.bgColor || '#1a1a2e');
      setBaseSize(data.baseSize || 100);
      setCurrentSaveName(name);
      setShowSaveDropdown(false);
      showToast('読み込みました');
    }
  };

  const deleteSaved = async (id) => {
    await deleteFromDB(id);
    const list = await getAllFromDB();
    setSavedList(list);
    if (currentSaveName === id) setCurrentSaveName('');
    showToast('削除しました');
  };

  // Zip
  const exportZip = async () => {
    const zip = new JSZip();
    const data = { items: [], bgColor, baseSize };

    const imgFolder = zip.folder('images');
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type === 'image' && item.src.startsWith('data:')) {
        const base64 = item.src.split(',')[1];
        const ext = item.src.includes('gif') ? 'gif' : 'jpg';
        imgFolder.file(`img_${item.id}.${ext}`, base64, { base64: true });
        data.items.push({ ...item, src: `images/img_${item.id}.${ext}` });
      } else {
        data.items.push(item);
      }
    }

    zip.file('data.json', JSON.stringify(data, null, 2));
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSaveName || 'collage'}-backup.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Zipをエクスポートしました');
  };

  const importZip = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const zip = await JSZip.loadAsync(file);
      const dataFile = zip.file('data.json');
      if (!dataFile) {
        showToast('無効なZipファイルです');
        return;
      }
      const jsonText = await dataFile.async('string');
      const data = JSON.parse(jsonText);

      const newItems = [];
      for (const item of data.items) {
        if (item.type === 'image' && item.src.startsWith('images/')) {
          const imgFile = zip.file(item.src);
          if (imgFile) {
            const base64 = await imgFile.async('base64');
            const ext = item.src.includes('gif') ? 'gif' : 'jpeg';
            newItems.push({ ...item, src: `data:image/${ext};base64,${base64}` });
          }
        } else {
          newItems.push(item);
        }
      }

      setItems(packItemsTight(newItems, canvasWidth));
      setBgColor(data.bgColor || '#1a1a2e');
      setBaseSize(data.baseSize || 100);
      showToast('インポートしました');
    } catch (err) {
      console.error('Import error:', err);
      showToast('インポートに失敗しました');
    }
    e.target.value = '';
  };

  const clearAll = () => {
    if (confirm('全てクリアしますか？')) {
      setItems([]);
      setSelectedId(null);
      setCurrentSaveName('');
      showToast('クリアしました');
    }
  };

  const canvasHeight = items.length > 0
    ? Math.max(150, Math.max(...items.map(i => i.y + Math.floor((i.baseHeight || 100) * (i.scale || 1)))) + 8)
    : 150;

  const selectedItem = items.find(i => i.id === selectedId);

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      <header className="header">
        <div className="save-dropdown-wrapper">
          <button
            className="current-save-btn"
            onClick={() => { getAllFromDB().then(setSavedList); setShowSaveDropdown(!showSaveDropdown); }}
          >
            📄 {currentSaveName || '(未保存)'}
            <span className="dropdown-arrow">▼</span>
          </button>
          {showSaveDropdown && (
            <div className="save-dropdown">
              <button className="close-btn" onClick={() => setShowSaveDropdown(false)}>×</button>
              <div className="dropdown-title">保存データ</div>
              {savedList.length === 0 ? (
                <div className="dropdown-empty">データなし</div>
              ) : (
                savedList.map(s => (
                  <div key={s.id} className="dropdown-item">
                    <span onClick={() => loadCollage(s.id)}>{s.id}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteSaved(s.id); }}>×</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="header-buttons">
          <button onClick={() => fileInputRef.current.click()} title="画像追加">📁</button>
          <button onClick={() => setShowTextModal(true)} title="テキスト">✏️</button>
          <button onClick={() => setShowSearchModal(true)} title="検索">🔍</button>
          <button onClick={shuffleItems} title="シャッフル">🎲</button>
          <button onClick={() => setShowSaveModal(true)} title="保存">💾</button>
          <button onClick={() => setShowSettings(!showSettings)} title="設定">⚙️</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.gif"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-row">
            <label>サイズ</label>
            <input type="range" min="50" max="200" value={baseSize} onChange={e => setBaseSize(+e.target.value)} />
            <span>{baseSize}px</span>
          </div>
          <div className="settings-row">
            <label>背景</label>
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} />
          </div>
          <div className="settings-row">
            <button onClick={packItems}>📦 詰める</button>
            <button onClick={exportZip}>📤 出力</button>
            <label className="file-btn">
              📥 読込
              <input type="file" accept=".zip" onChange={importZip} style={{ display: 'none' }} />
            </label>
            <button onClick={clearAll} className="btn-danger">🗑️</button>
          </div>
        </div>
      )}

      <div className="main-content">
        <div
          ref={canvasRef}
          className={`canvas ${isDragging ? 'dragging' : ''}`}
          style={{ width: canvasWidth, minHeight: canvasHeight, backgroundColor: bgColor }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => setSelectedId(null)}
        >
          {items.length === 0 && (
            <div className="empty-hint">
              ドラッグ＆ドロップで画像を追加<br />
              または「📁」ボタンをクリック
            </div>
          )}
          {items.map((item, index) => {
            const scaledWidth = Math.floor((item.baseWidth || 100) * (item.scale || 1));
            const scaledHeight = Math.floor((item.baseHeight || 100) * (item.scale || 1));
            const isSelected = selectedId === item.id;
            const isDragOver = dragOverIndex === index;

            return (
              <div
                key={item.id}
                className={`item ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: scaledWidth,
                  height: scaledHeight
                }}
                draggable={!isScaling}
                onDragStart={(e) => handleItemDragStart(e, item, index)}
                onDragOver={(e) => handleItemDragOver(e, index)}
                onDragEnd={handleItemDragEnd}
                onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}
                onDoubleClick={() => item.type === 'image' && setZoomImage(item.src)}
              >
                {item.type === 'image' ? (
                  <img src={item.src} alt="" draggable={false} />
                ) : (
                  <div className="text-item" style={{ color: item.color, fontSize: item.fontSize * (item.scale || 1) }}>
                    {item.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Floating controls - fixed position */}
        {selectedItem && (
          <div
            className="floating-controls"
            onMouseDown={() => setIsScaling(true)}
            onMouseUp={() => setIsScaling(false)}
            onTouchStart={() => setIsScaling(true)}
            onTouchEnd={() => setIsScaling(false)}
          >
            <span className="scale-label">倍率:</span>
            <input
              type="range"
              min="0.3"
              max="3"
              step="0.1"
              value={selectedItem.scale || 1}
              onChange={e => updateScale(selectedId, +e.target.value)}
              className="scale-slider"
            />
            <span className="scale-value">{(selectedItem.scale || 1).toFixed(1)}x</span>
            <button onClick={() => deleteItem(selectedId)} className="delete-btn">×</button>
          </div>
        )}
      </div>

      {/* Zoom Modal */}
      {zoomImage && (
        <div className="modal-overlay" onClick={() => setZoomImage(null)}>
          <div className="zoom-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setZoomImage(null)}>×</button>
            <img src={zoomImage} alt="zoomed" />
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowSaveModal(false)}>×</button>
            <h2>💾 保存</h2>
            <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="保存名..." autoFocus />
            <button onClick={saveCollage}>保存</button>
          </div>
        </div>
      )}

      {/* Text Modal */}
      {showTextModal && (
        <div className="modal-overlay" onClick={() => setShowTextModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowTextModal(false)}>×</button>
            <h2>✏️ テキスト追加</h2>
            <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="テキストを入力..." autoFocus />
            <div className="modal-row">
              <label>色</label>
              <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} />
            </div>
            <div className="modal-row">
              <label>サイズ</label>
              <input type="range" min="10" max="60" value={textSize} onChange={e => setTextSize(+e.target.value)} />
              <span>{textSize}px</span>
            </div>
            <button onClick={addText}>追加</button>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowSearchModal(false)}>×</button>
            <h2>🔍 画像検索</h2>
            <div className="search-input-row">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="検索ワード（英語推奨）..."
                autoFocus
                onKeyDown={e => e.key === 'Enter' && searchPixabay()}
              />
              <button onClick={searchPixabay} disabled={isSearching} className="search-btn">
                {isSearching ? '...' : '検索'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map(r => (
                  <div key={r.id} className="search-result" onClick={() => addSearchResult(r)}>
                    <img src={r.thumb} alt={r.alt} />
                  </div>
                ))}
              </div>
            )}
            <p className="search-note">Powered by Pixabay</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
