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

// Cloud Sync API
const SYNC_API_URL = 'https://collage-sync-api.nakamurapomeo.workers.dev';

const cloudUpload = async (name, zipBlob, password) => {
  const formData = new FormData();
  formData.append('file', zipBlob, `${name}.zip`);
  formData.append('name', name);

  const res = await fetch(`${SYNC_API_URL}/api/sync/upload`, {
    method: 'POST',
    headers: { 'X-Sync-Password': password },
    body: formData
  });
  return res.json();
};

const cloudDownload = async (name, password) => {
  const res = await fetch(`${SYNC_API_URL}/api/sync/download?name=${encodeURIComponent(name)}`, {
    headers: { 'X-Sync-Password': password }
  });
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
};

const cloudList = async (password) => {
  const res = await fetch(`${SYNC_API_URL}/api/sync/list`, {
    headers: { 'X-Sync-Password': password }
  });
  return res.json();
};

const cloudDelete = async (name, password) => {
  const res = await fetch(`${SYNC_API_URL}/api/sync/delete?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { 'X-Sync-Password': password }
  });
  return res.json();
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
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const [cropItemId, setCropItemId] = useState(null);
  const [cropStart, setCropStart] = useState(null);
  const [cropEnd, setCropEnd] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropMagnifier, setCropMagnifier] = useState(null);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [pullStartY, setPullStartY] = useState(null);
  const [isPulling, setIsPulling] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [syncPassword, setSyncPassword] = useState(() => localStorage.getItem('syncPassword') || '');
  const [cloudSaves, setCloudSaves] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const mainContentRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  useEffect(() => {
    // Load last edited save on startup
    const init = async () => {
      const list = await getAllFromDB();
      setSavedList(list);

      const lastSaveName = localStorage.getItem('lastSaveName');
      if (lastSaveName && list.some(s => s.id === lastSaveName)) {
        const data = await loadFromDB(lastSaveName);
        if (data) {
          setItems(packItemsTight(data.items || [], window.innerWidth - 16));
          setBgColor(data.bgColor || '#1a1a2e');
          setBaseSize(data.baseSize || 100);
          setCurrentSaveName(lastSaveName);
        }
      }
    };
    init().catch(console.error);

    const handleResize = () => {
      setCanvasWidth(window.innerWidth - 16);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto cloud sync - upload when items change (debounced)
  useEffect(() => {
    if (!syncPassword || items.length === 0) return;

    const saveToCloud = async () => {
      try {
        const zipBlob = await createZipBlob();
        await cloudUpload(currentSaveName || 'auto', zipBlob, syncPassword);
      } catch (err) {
        console.error('Auto sync error:', err);
      }
    };

    const timer = setTimeout(saveToCloud, 5000); // 5秒後に自動保存
    return () => clearTimeout(timer);
  }, [items, syncPassword, currentSaveName]);

  // Justified row layout - zero gap masonry like FStop/Google Photos
  const packItemsTight = useCallback((itemList, containerWidth) => {
    if (itemList.length === 0) return [];

    const targetRowHeight = baseSize; // Target height for each row
    const packed = [];
    let currentY = 0;
    let rowItems = [];
    let rowAspectSum = 0;

    const finalizeRow = (items, aspectSum, y, isLastRow = false) => {
      if (items.length === 0) return;

      // Calculate row height to fill entire width
      // rowWidth = sum(height * aspectRatio) for each item
      // For justified: containerWidth = rowHeight * sum(aspectRatios)
      // So: rowHeight = containerWidth / sum(aspectRatios)
      let rowHeight = containerWidth / aspectSum;

      // Limit row height for last incomplete row
      if (isLastRow && rowHeight > targetRowHeight * 1.5) {
        rowHeight = targetRowHeight;
      }

      let x = 0;
      for (const item of items) {
        const aspectRatio = item.aspectRatio || ((item.baseWidth || 100) / (item.baseHeight || 100));
        const itemWidth = Math.floor(rowHeight * aspectRatio);
        const itemHeight = Math.floor(rowHeight);

        // Calculate scale factor to achieve this size
        const baseW = item.baseWidth || 100;
        const baseH = item.baseHeight || 100;
        const scale = itemHeight / baseH;

        packed.push({
          ...item,
          x: Math.floor(x),
          y: Math.floor(y),
          baseWidth: baseW,
          baseHeight: baseH,
          scale: scale
        });

        x += itemWidth;
      }

      return Math.floor(rowHeight);
    };

    for (const item of itemList) {
      const aspectRatio = item.aspectRatio || ((item.baseWidth || 100) / (item.baseHeight || 100));

      // Add item to current row
      rowItems.push(item);
      rowAspectSum += aspectRatio;

      // Check if row is full (would result in height <= target)
      const potentialHeight = containerWidth / rowAspectSum;

      if (potentialHeight <= targetRowHeight) {
        // Row is complete, finalize it
        const rowHeight = finalizeRow(rowItems, rowAspectSum, currentY);
        currentY += rowHeight;
        rowItems = [];
        rowAspectSum = 0;
      }
    }

    // Handle remaining items in last row
    if (rowItems.length > 0) {
      const rowHeight = finalizeRow(rowItems, rowAspectSum, currentY, true);
      currentY += rowHeight;
    }

    return packed;
  }, [baseSize]);

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

  // Shuffle - respects pinned items
  const shuffleItems = () => {
    if (items.length === 0) return;
    // Separate pinned and unpinned items
    const pinned = items.filter(i => i.pinned);
    const unpinned = items.filter(i => !i.pinned);
    // Shuffle each group separately
    const shuffledPinned = [...pinned].sort(() => Math.random() - 0.5);
    const shuffledUnpinned = [...unpinned].sort(() => Math.random() - 0.5);
    // Combine: pinned first, then unpinned
    setItems(packItemsTight([...shuffledPinned, ...shuffledUnpinned], canvasWidth));
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

  // Browser-based image search
  const openGoogleImageSearch = () => {
    if (!searchQuery.trim()) return;
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`, '_blank');
    setShowSearchModal(false);
    showToast('Googleで画像検索を開きました');
  };

  const openDuckDuckGoImageSearch = () => {
    if (!searchQuery.trim()) return;
    window.open(`https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&iax=images&ia=images`, '_blank');
    setShowSearchModal(false);
    showToast('DuckDuckGoで画像検索を開きました');
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
    localStorage.setItem('lastSaveName', saveName);
    setShowSaveModal(false);
    setSaveName('');
    showToast('保存しました');
  };

  // Overwrite save (auto-save)
  const overwriteSave = async (silent = false) => {
    if (!currentSaveName) return;
    await saveToDB(currentSaveName, { items, bgColor, baseSize });
    localStorage.setItem('lastSaveName', currentSaveName);
    if (!silent) showToast('上書き保存しました');
  };

  // Auto-save after changes (debounced)
  useEffect(() => {
    if (!currentSaveName || items.length === 0) return;
    const timer = setTimeout(() => {
      overwriteSave(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [items, bgColor, baseSize, currentSaveName]);

  const loadCollage = async (name) => {
    const data = await loadFromDB(name);
    if (data) {
      setItems(packItemsTight(data.items || [], canvasWidth));
      setBgColor(data.bgColor || '#1a1a2e');
      setBaseSize(data.baseSize || 100);
      setCurrentSaveName(name);
      localStorage.setItem('lastSaveName', name);
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

  // Cloud Sync Functions
  const createZipBlob = async () => {
    const zip = new JSZip();
    const data = { items: [], bgColor, baseSize };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type === 'image' && item.src.startsWith('data:')) {
        const ext = item.src.includes('gif') ? 'gif' : 'jpg';
        const base64Data = item.src.split(',')[1];
        zip.file(`images/${item.id}.${ext}`, base64Data, { base64: true });
        data.items.push({ ...item, src: `images/${item.id}.${ext}` });
      } else {
        data.items.push(item);
      }
    }

    zip.file('data.json', JSON.stringify(data, null, 2));
    return await zip.generateAsync({ type: 'blob' });
  };

  const uploadToCloud = async () => {
    if (!syncPassword) {
      showToast('同期パスワードを設定してください');
      return;
    }
    if (!currentSaveName) {
      showToast('先にローカル保存してください');
      return;
    }

    setIsSyncing(true);
    try {
      const zipBlob = await createZipBlob();
      await cloudUpload(currentSaveName, zipBlob, syncPassword);
      showToast('☁️ クラウドにアップロードしました');
      await fetchCloudSaves();
    } catch (err) {
      console.error('Upload error:', err);
      showToast('アップロードに失敗しました');
    }
    setIsSyncing(false);
  };

  const downloadFromCloud = async (name) => {
    if (!syncPassword) {
      showToast('同期パスワードを設定してください');
      return;
    }

    setIsSyncing(true);
    try {
      const zipBlob = await cloudDownload(name, syncPassword);
      const zip = await JSZip.loadAsync(zipBlob);
      const dataFile = zip.file('data.json');
      if (!dataFile) {
        showToast('無効なZipファイルです');
        setIsSyncing(false);
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
      setCurrentSaveName(name);
      showToast('☁️ クラウドから読み込みました');
      setShowCloudModal(false);
    } catch (err) {
      console.error('Download error:', err);
      showToast('ダウンロードに失敗しました');
    }
    setIsSyncing(false);
  };

  const fetchCloudSaves = async () => {
    if (!syncPassword) return;
    try {
      const result = await cloudList(syncPassword);
      setCloudSaves(result.saves || []);
    } catch (err) {
      console.error('List error:', err);
    }
  };

  const deleteCloudSave = async (name) => {
    if (!confirm(`「${name}」をクラウドから削除しますか？`)) return;
    try {
      await cloudDelete(name, syncPassword);
      showToast('削除しました');
      await fetchCloudSaves();
    } catch (err) {
      showToast('削除に失敗しました');
    }
  };

  const saveSyncPassword = (pw) => {
    setSyncPassword(pw);
    localStorage.setItem('syncPassword', pw);
  };

  // Crop functions - direct open
  const openCropEditor = (src, itemId) => {
    setCropImage(src);
    setCropItemId(itemId);
    setCropStart(null);
    setCropEnd(null);
    setShowCropModal(true);
  };

  const handleCropStart = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setCropStart({ x, y });
    setCropEnd({ x, y });
    setIsCropping(true);
    // Show magnifier on mobile
    if (e.touches) {
      setCropMagnifier({ x, y, clientX, clientY });
    }
  };

  const handleCropMove = (e) => {
    if (!isCropping) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    setCropEnd({ x, y });
    // Update magnifier
    if (e.touches) {
      setCropMagnifier({ x, y, clientX, clientY });
    }
  };

  const handleCropEnd = () => {
    setIsCropping(false);
    setCropMagnifier(null);
  };

  // Process crop and get cropped data URL
  const processCrop = async () => {
    if (!cropStart || !cropEnd || !cropImage) return null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = cropImage;

    await new Promise(r => img.onload = r);

    const displayImg = cropCanvasRef.current?.querySelector('img');
    if (!displayImg) return null;

    const scaleX = img.naturalWidth / displayImg.clientWidth;
    const scaleY = img.naturalHeight / displayImg.clientHeight;

    const x1 = Math.min(cropStart.x, cropEnd.x) * scaleX;
    const y1 = Math.min(cropStart.y, cropEnd.y) * scaleY;
    const w = Math.abs(cropEnd.x - cropStart.x) * scaleX;
    const h = Math.abs(cropEnd.y - cropStart.y) * scaleY;

    if (w < 10 || h < 10) {
      showToast('クロップ範囲が小さすぎます');
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, x1, y1, w, h, 0, 0, w, h);

    return { url: canvas.toDataURL('image/jpeg', 0.9), width: w, height: h };
  };

  // Apply crop - replaces original
  const applyCrop = async () => {
    const result = await processCrop();
    if (!result) return;

    const aspectRatio = result.width / result.height;
    const bh = baseSize;
    const bw = bh * aspectRatio;

    setItems(prev => {
      const updated = prev.map(i =>
        i.id === cropItemId
          ? { ...i, src: result.url, baseWidth: bw, baseHeight: bh, aspectRatio }
          : i
      );
      return packItemsTight(updated, canvasWidth);
    });

    closeCropModal();
    showToast('クロップを適用しました');
  };

  // Copy crop - keeps original
  const copyCrop = async () => {
    const result = await processCrop();
    if (!result) return;

    const aspectRatio = result.width / result.height;
    const bh = baseSize;
    const bw = bh * aspectRatio;

    const newItem = {
      id: Date.now(),
      type: 'image',
      src: result.url,
      x: 0,
      y: 0,
      baseWidth: bw,
      baseHeight: bh,
      scale: 1,
      aspectRatio
    };

    setItems(prev => packItemsTight([...prev, newItem], canvasWidth));
    closeCropModal();
    showToast('クロップをコピーしました');
  };

  const closeCropModal = () => {
    setShowCropModal(false);
    setCropImage(null);
    setCropItemId(null);
    setCropStart(null);
    setCropEnd(null);
  };

  // Long press to toggle pin
  const handleItemTouchStart = (e, item) => {
    const timer = setTimeout(() => {
      // Toggle pin status
      setItems(prev => {
        const updated = prev.map(i =>
          i.id === item.id ? { ...i, pinned: !i.pinned } : i
        );
        // Sort: pinned items first
        const pinned = updated.filter(i => i.pinned);
        const unpinned = updated.filter(i => !i.pinned);
        return packItemsTight([...pinned, ...unpinned], canvasWidth);
      });
      showToast(item.pinned ? '固定解除' : '固定しました');
    }, 800);
    setLongPressTimer(timer);
  };

  const handleItemTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleItemClick = (e, item) => {
    e.stopPropagation();
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    if (item.type === 'image') {
      openCropEditor(item.src, item.id);
    } else {
      setSelectedId(item.id);
    }
  };

  // Pull-to-shuffle handlers
  const handlePullStart = (e) => {
    if (mainContentRef.current && mainContentRef.current.scrollTop === 0) {
      setPullStartY(e.touches[0].clientY);
    }
  };

  const handlePullMove = (e) => {
    if (pullStartY !== null) {
      const diff = e.touches[0].clientY - pullStartY;
      if (diff > 50) {
        setIsPulling(true);
      }
    }
  };

  const handlePullEnd = () => {
    if (isPulling) {
      shuffleItems();
    }
    setPullStartY(null);
    setIsPulling(false);
  };

  const canvasHeight = items.length > 0
    ? Math.max(150, Math.max(...items.map(i => i.y + Math.floor((i.baseHeight || 100) * (i.scale || 1)))) + 8)
    : 150;

  const selectedItem = items.find(i => i.id === selectedId);

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      <header className="header">
        <div className="header-row-1">
          <button onClick={() => fileInputRef.current.click()} title="画像追加">📁</button>
          <button onClick={() => setShowTextModal(true)} title="テキスト">✏️</button>
          <button onClick={() => setShowSearchModal(true)} title="検索">🔍</button>
          <button onClick={shuffleItems} title="シャッフル">🎲</button>
          <button onClick={() => setEditMode(!editMode)} title="編集モード" className={editMode ? 'active' : ''}>✅</button>
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
        <div className="header-row-2">
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
          <button onClick={() => setShowSaveModal(true)} title="新規保存">💾</button>
          {currentSaveName && <button onClick={() => overwriteSave(false)} title="上書き保存">💾✓</button>}
          <button onClick={() => { setShowCloudModal(true); fetchCloudSaves(); }} title="クラウド同期">☁️</button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-row">
            <label>パスキー</label>
            <input
              type="password"
              value={syncPassword}
              onChange={e => saveSyncPassword(e.target.value)}
              placeholder="クラウド同期用..."
              style={{ width: '100px' }}
            />
            {syncPassword && <span style={{ color: '#22c55e', fontSize: '0.7rem' }}>✓同期ON</span>}
          </div>
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

      <div
        className="main-content"
        ref={mainContentRef}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
      >
        {isPulling && <div className="pull-indicator">⬇️ シャッフル</div>}
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
                className={`item ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''} ${item.pinned ? 'pinned' : ''}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: scaledWidth,
                  height: scaledHeight
                }}
                draggable
                onDragStart={(e) => handleItemDragStart(e, item, index)}
                onDragOver={(e) => handleItemDragOver(e, index)}
                onDragEnd={handleItemDragEnd}
                onClick={(e) => handleItemClick(e, item)}
                onTouchStart={(e) => handleItemTouchStart(e, item)}
                onTouchEnd={handleItemTouchEnd}
              >
                {item.pinned && <div className="pin-indicator">📌</div>}
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

      {/* Crop Modal */}
      {showCropModal && cropImage && (
        <div className="modal-overlay" onClick={closeCropModal}>
          <div className="crop-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={closeCropModal}>×</button>
            <h2>✂️ クロップ</h2>
            <p className="crop-hint">ドラッグで範囲を選択</p>
            <div
              className="crop-container"
              ref={cropCanvasRef}
              onMouseDown={handleCropStart}
              onMouseMove={handleCropMove}
              onMouseUp={handleCropEnd}
              onMouseLeave={handleCropEnd}
              onTouchStart={handleCropStart}
              onTouchMove={handleCropMove}
              onTouchEnd={handleCropEnd}
            >
              <img src={cropImage} alt="crop" draggable={false} />
              {cropStart && cropEnd && (
                <div
                  className="crop-selection"
                  style={{
                    left: Math.min(cropStart.x, cropEnd.x),
                    top: Math.min(cropStart.y, cropEnd.y),
                    width: Math.abs(cropEnd.x - cropStart.x),
                    height: Math.abs(cropEnd.y - cropStart.y)
                  }}
                />
              )}
            </div>
            <div className="crop-buttons">
              <button onClick={applyCrop} disabled={!cropStart || !cropEnd}>適用</button>
              <button onClick={copyCrop} disabled={!cropStart || !cropEnd}>コピー</button>
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="modal-overlay modal-overlay-top" onClick={() => setShowSaveModal(false)}>
          <div className="modal modal-top" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowSaveModal(false)}>×</button>
            <div style={{ height: '24px' }} />
            <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="保存名..." autoFocus />
            <button onClick={saveCollage}>保存</button>
          </div>
        </div>
      )}

      {/* Text Modal */}
      {showTextModal && (
        <div className="modal-overlay modal-overlay-top" onClick={() => setShowTextModal(false)}>
          <div className="modal modal-top" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowTextModal(false)}>×</button>
            <div style={{ height: '24px' }} />
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
        <div className="modal-overlay modal-overlay-top" onClick={() => setShowSearchModal(false)}>
          <div className="modal modal-top" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowSearchModal(false)}>×</button>
            <div style={{ height: '24px' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="検索ワード..."
              autoFocus
            />
            <div className="search-buttons">
              <button onClick={openGoogleImageSearch}>🔍 Google</button>
              <button onClick={openDuckDuckGoImageSearch}>🦆 DuckDuckGo</button>
            </div>
            <p className="search-note">ブラウザで画像を長押し保存→📁から追加</p>
          </div>
        </div>
      )}

      {/* Cloud Sync Modal */}
      {showCloudModal && (
        <div className="modal-overlay modal-overlay-top" onClick={() => setShowCloudModal(false)}>
          <div className="modal modal-top modal-wide" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowCloudModal(false)}>×</button>
            <div style={{ height: '24px' }} />
            <input
              type="password"
              value={syncPassword}
              onChange={e => saveSyncPassword(e.target.value)}
              placeholder="同期パスワード..."
              autoFocus
            />

            <div className="cloud-actions">
              <button
                onClick={() => downloadFromCloud(currentSaveName || 'default')}
                disabled={isSyncing || !syncPassword}
                className="cloud-btn"
              >
                {isSyncing ? '...' : '⬇️ クラウドから読み込み'}
              </button>
            </div>

            <div className="cloud-saves">
              <div className="cloud-saves-title">クラウド保存データ</div>
              {cloudSaves.length === 0 ? (
                <div className="cloud-empty">データなし</div>
              ) : (
                cloudSaves.map(s => (
                  <div key={s.name} className="cloud-save-item">
                    <span onClick={() => downloadFromCloud(s.name)}>{s.name}</span>
                    <button onClick={() => deleteCloudSave(s.name)}>×</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
