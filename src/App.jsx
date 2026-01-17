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

const safeEncode = (str) => {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    console.warn("Encoding failed", e);
    return str;
  }
};

const CHUNK_SIZE = 9 * 1024 * 1024; // 9MB chunks (Safe margin)

const sha256 = async (str) => {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const asyncPool = async (poolLimit, array, iteratorFn) => {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
};


// Upload a single chunk with Retry Logic
const cloudUploadSingle = async (name, blob, password, retries = 3) => {
  const formData = new FormData();
  formData.append('file', blob, name);
  formData.append('name', name);

  let lastError;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min

    try {
      const res = await fetch(`${SYNC_API_URL}/api/sync/upload`, {
        method: 'POST',
        headers: { 'X-Sync-Password': safeEncode(password) },
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        // ignore json parse error if not ok
      }

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status} ${data.error || text}`);
      }

      if (data.error) throw new Error(data.error);

      return data;
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn(`Upload attempt ${i + 1} failed for ${name}:`, e);
      lastError = e;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Backoff
    }
  }
  throw lastError;
};

// Download a single chunk/file with Retry Logic
const cloudDownloadSingle = async (name, password, retries = 3) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min

    try {
      const res = await fetch(`${SYNC_API_URL}/api/sync/download?name=${encodeURIComponent(name)}`, {
        headers: { 'X-Sync-Password': safeEncode(password) },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 404) return null; // Not found is not an error
        const text = await res.text();
        throw new Error(`Download failed: ${res.status} ${text}`);
      }

      return await res.blob();
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn(`Download attempt ${i + 1} failed for ${name}:`, e);
      lastError = e;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
};

// Batch Upload (Multiple files in one request)
const cloudUploadBatch = async (files, password) => {
  const formData = new FormData();
  files.forEach(({ name, blob }) => {
    formData.append(name, blob);
  });

  const res = await fetch(`${SYNC_API_URL}/api/sync/batch/upload`, {
    method: 'POST',
    headers: { 'X-Sync-Password': safeEncode(password) },
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Batch upload failed: ${res.status}`);
  }
  return await res.json();
};

// Batch Download (Request specific files, receive ZIP)
const cloudDownloadBatch = async (filenames, password) => {
  const res = await fetch(`${SYNC_API_URL}/api/sync/batch/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Password': safeEncode(password)
    },
    body: JSON.stringify({ names: filenames })
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Batch download failed: ${res.status}`);
  return await res.blob();
};

// Cloud Upload - Full Zip (Chunked)
const cloudUpload = async (backupData, password, onProgress) => {
  console.log('Starting cloudUpload (Full Zip + Chunking)...');

  // 1. Create Zip
  const zip = new JSZip();
  const metaSets = [];

  let totalImages = 0;
  for (const set of backupData.sets) {
    if (set.items) totalImages += set.items.filter(i => i.type === 'image' && i.src.startsWith('data:')).length;
  }

  let processedImages = 0;

  for (const set of backupData.sets) {
    const setFolder = zip.folder(set.id.toString());
    const setMetaItems = [];

    if (set.items) {
      for (const item of set.items) {
        if (item.type === 'image' && item.src && item.src.startsWith('data:')) {
          const parts = item.src.split(',');
          let ext = 'png';
          if (item.src.includes('image/jpeg')) ext = 'jpg';
          else if (item.src.includes('image/gif')) ext = 'gif';
          else if (item.src.includes('image/webp')) ext = 'webp';

          const filename = `${item.id}.${ext}`;
          const base64Data = parts.length > 1 ? parts[1] : parts[0];

          setFolder.file(filename, base64Data, { base64: true });
          setMetaItems.push({ ...item, src: `zip:${set.id}/${filename}` });

          processedImages++;
          if (onProgress) onProgress(processedImages, totalImages * 2); // 0-50%
        } else {
          setMetaItems.push(item);
        }
      }
    }

    metaSets.push({ ...set, items: setMetaItems });
  }

  zip.file('backup.json', JSON.stringify({ ...backupData, sets: metaSets }));
  const fullZipBlob = await zip.generateAsync({ type: 'blob' });

  // 2. Chunking Logic
  console.log(`Zip size: ${fullZipBlob.size} bytes. Chunk size: ${CHUNK_SIZE}`);
  const totalChunks = Math.ceil(fullZipBlob.size / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fullZipBlob.size);
    const chunkBlob = fullZipBlob.slice(start, end);
    const chunkName = `backup.zip.${i}`;

    console.log(`Uploading chunk ${i}/${totalChunks}: ${chunkName} (${chunkBlob.size} bytes)`);
    await cloudUploadSingle(chunkName, chunkBlob, password);

    if (onProgress) onProgress(totalImages + ((i + 1) / totalChunks * totalImages), totalImages * 2); // 50-100%
  }

  // Upload Manifest
  const manifest = {
    totalChunks: totalChunks,
    totalSize: fullZipBlob.size,
    updatedAt: Date.now()
  };
  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  await cloudUploadSingle('backup.info', manifestBlob, password);

  console.log('Upload complete.');
  return { success: true };
};

// Cloud Download - Full Zip (Chunked)
const cloudDownload = async (name, password, onProgress) => {
  console.log('Downloading Chunked Zip...');

  // 1. Get Manifest
  const manifestBlob = await cloudDownloadSingle('backup.info', password);
  let totalChunks = 0;

  if (manifestBlob) {
    try {
      const m = JSON.parse(await manifestBlob.text());
      totalChunks = m.totalChunks;
      console.log(`Manifest found: ${totalChunks} chunks.`);
    } catch (e) { console.warn('Manifest parse error', e); }
  }

  let combinedBlobParts = [];

  if (totalChunks > 0) {
    // Download known chunks
    for (let i = 0; i < totalChunks; i++) {
      const chunkName = `backup.zip.${i}`;
      const chunk = await cloudDownloadSingle(chunkName, password);
      if (!chunk) throw new Error(`Missing chunk ${i}`);
      combinedBlobParts.push(chunk);
      if (onProgress) onProgress(i + 1, totalChunks);
    }
  } else {
    // Try legacy single `backup.zip`
    const legacy = await cloudDownloadSingle('backup.zip', password);
    if (legacy) {
      console.log('Found legacy single backup.zip');
      combinedBlobParts.push(legacy);
    } else {
      // Probe
      let i = 0;
      while (true) {
        const chunk = await cloudDownloadSingle(`backup.zip.${i}`, password);
        if (!chunk) break;
        combinedBlobParts.push(chunk);
        i++;
      }
    }
  }

  if (combinedBlobParts.length === 0) return null;

  const fullZipBlob = new Blob(combinedBlobParts);
  console.log(`Combined Zip Size: ${fullZipBlob.size}`);

  const zip = await JSZip.loadAsync(fullZipBlob);
  const jsonStr = await zip.file('backup.json').async('string');
  const backup = JSON.parse(jsonStr);

  const restoredSets = [];

  for (const set of backup.sets) {
    const restoredItems = [];
    if (set.items) {
      for (const item of set.items) {
        if (item.type === 'image' && item.src && item.src.startsWith('zip:')) {
          const path = item.src.replace('zip:', '');
          const file = zip.file(path);
          if (file) {
            const b64 = await file.async('base64');
            let mime = 'image/png';
            if (path.endsWith('.jpg')) mime = 'image/jpeg';
            else if (path.endsWith('.gif')) mime = 'image/gif';
            else if (path.endsWith('.webp')) mime = 'image/webp';

            restoredItems.push({ ...item, src: `data:${mime};base64,${b64}` });
          } else {
            restoredItems.push({ ...item, src: '' });
          }
        } else {
          restoredItems.push(item);
        }
      }
    }
    restoredSets.push({ ...set, items: restoredItems });
  }

  return new Blob([JSON.stringify({ ...backup, sets: restoredSets })], { type: 'application/json' });
};

const cloudList = async (password, prefix = '') => {
  let allSaves = [];
  let cursor = null;
  let truncated = true;

  while (truncated) {
    let url = `${SYNC_API_URL}/api/sync/list` + (prefix ? `?prefix=${encodeURIComponent(prefix)}` : '');
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const res = await fetch(url, {
      headers: { 'X-Sync-Password': safeEncode(password) }
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `List failed: ${res.status}`);
    }

    if (data.saves) {
      allSaves = allSaves.concat(data.saves);
    }

    truncated = data.truncated;
    cursor = data.cursor;
  }

  return { saves: allSaves };
};

const cloudDelete = async (name, password) => {
  const res = await fetch(`${SYNC_API_URL}/api/sync/delete?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { 'X-Sync-Password': safeEncode(password) }
  });
  if (!res.ok) throw new Error('Delete failed');
  return true;
};

// Clean up old backup chunks to save space
const cleanupOldBackups = async (currentChunks, password) => {
  // Deprecated: Differential sync handles cleanup differently (or we need a manual GC)
  // For now, we just ensure we don't leave old chunked backups from previous version.
  try {
    const list = await cloudList(password);

    // Cleanup old 'backup_chunk_' files if we are not using them anymore
    // Since we now use 'backup' (single file) and 'images/...', anything starting with 'backup_' might be old chunks.
    const chunks = list.saves.filter(s => s.name.startsWith('backup_chunk_') || s.name === 'backup_meta');

    if (chunks.length > 0) {
      console.log('Cleaning up legacy backup files:', chunks.length);
      await Promise.all(chunks.map(f => cloudDelete(f.name, password)));
    }

    // TODO: Implement GC for unused images (images that are not referenced by 'backup')
    // This requires downloading 'backup', parsing, getting used hashes, and diffing with 'images/' list.
    // Intentionally skipped for now to avoid accidental data loss during dev.
  } catch (e) {
    console.warn('Cleanup warning:', e);
  }
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
  console.log("App Updated v2026-01-14-10 (Progress)");
  /* State */
  const [collageSets, setCollageSets] = useState([]);
  const [currentSetId, setCurrentSetId] = useState(null);
  const [currentView, setCurrentView] = useState('main'); // 'main' | 'settings'

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [canvasWidth, setCanvasWidth] = useState(window.innerWidth - 16);

  // Use a ref to access current canvas ref in event listener
  const canvasRefInner = useRef(null);

  useEffect(() => {
    canvasRefInner.current = canvasRef.current;
  }, []);
  const [bgColor, setBgColor] = useState('#1a1a2e');
  const [baseSize, setBaseSize] = useState(100);
  const [isDarkMode, setIsDarkMode] = useState(true); // Added missing state
  const [isGrayscale, setIsGrayscale] = useState(false);


  // UI State
  const [toast, setToast] = useState('');
  const [showSettings, setShowSettings] = useState(false); // Kept for partial compat, but will use currentView
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState(24);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]); // Unused?
  const [isSearching, setIsSearching] = useState(false); // Unused?

  // UI Visibility Settings
  const [uiVisibility, setUiVisibility] = useState(() => {
    try {
      const saved = localStorage.getItem('uiVisibility');
      return saved ? JSON.parse(saved) : {
        camera: true, text: true, search: true, edit: true, shuffle: true, cloud: true
      };
    } catch {
      return { camera: true, text: true, search: true, edit: true, shuffle: true, cloud: true };
    }
  });

  // Modals
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const [cropItemId, setCropItemId] = useState(null);
  const [cropStart, setCropStart] = useState(null);
  const [cropEnd, setCropEnd] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropMagnifier, setCropMagnifier] = useState(null);
  const [cropScale, setCropScale] = useState(1); // Crop Zoom
  const [cropTranslate, setCropTranslate] = useState({ x: 0, y: 0 }); // Crop Panning
  const [cropLink, setCropLink] = useState(''); // Link
  const [randomInterval, setRandomInterval] = useState(300);

  // Refs
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const mainContentRef = useRef(null);
  const randomTimerRef = useRef(null); // Timer for random loop

  const [showCloudModal, setShowCloudModal] = useState(false); // Can be removed later
  const [showNewSetModal, setShowNewSetModal] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [showSetDropdown, setShowSetDropdown] = useState(false);
  const [renameInput, setRenameInput] = useState(''); // For renaming
  const [showMoveSetModal, setShowMoveSetModal] = useState(false); // New: Move items modal
  const [moveTargetSetId, setMoveTargetSetId] = useState(''); // Target set ID
  const [selectedMergeIds, setSelectedMergeIds] = useState([]); // Merge Selection
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('collagePresets') || '[]'); }
    catch { return []; }
  });

  // Smart Sync State
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Number(localStorage.getItem('lastSyncedAt') || 0));
  const [localUpdatedAt, setLocalUpdatedAt] = useState(() => Number(localStorage.getItem('localUpdatedAt') || Date.now()));
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState(0);



  // Touch/Gesture
  const longPressTimerRef = useRef(null);
  const swipeStartRef = useRef(null); // For horizontal swipe detection
  const lastPinchCenterRef = useRef(null); // For crop panning
  const [swipeOffset, setSwipeOffset] = useState(0); // Visual swipe feedback
  const [pullStartY, setPullStartY] = useState(null);
  const [isPulling, setIsPulling] = useState(false);
  const [isScaling, setIsScaling] = useState(false); // Added missing state
  // Pinch Zoom
  const [pinchStartDist, setPinchStartDist] = useState(null);
  const [pinchStartBaseSize, setPinchStartBaseSize] = useState(100);
  const [cropHistory, setCropHistory] = useState([]); // History for crop navigation

  // Sync
  const [syncPassword, setSyncPassword] = useState(() => localStorage.getItem('syncPassword') || '');
  const [userId, setUserId] = useState(() => localStorage.getItem('userId') || '');
  // const [tempPassword, setTempPassword] = useState(''); // Removed, merge with syncPassword or local state?
  // Actually, user wants 'Text' input that persists.
  // We can just use syncPassword directly and save on change.

  const [isSynced, setIsSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0); // 0-100

  // Cloud List State
  const [cloudSaves, setCloudSaves] = useState([]);

  // Moved Helper & Effect to avoid TDZ (ReferenceError)
  const getCloudKey = () => `${userId}_${syncPassword}`;

  // Check cloud status on mount & interval
  useEffect(() => {
    const checkCloud = async () => {
      if (!userId || !syncPassword) return;
      try {
        const list = await cloudList(getCloudKey());
        // Check for backup_meta (chunked) or backup (single)
        const backup = list.saves.find(s => s.name === 'backup_meta') || list.saves.find(s => s.name === 'backup');
        if (backup) {
          const uploaded = new Date(backup.uploaded).getTime();
          setCloudUpdatedAt(uploaded);
        }
      } catch (e) {
        // Silent fail for background check
        console.warn('Background cloud check:', e);
      }
    };
    checkCloud();
    const interval = setInterval(checkCloud, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [userId, syncPassword]);


  // Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  // Refs
  const fileInputRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  // Helper: Pack Items (Hoisted)
  const packItemsTight = useCallback((itemList, containerWidth, targetSize = baseSize) => {
    if (!itemList || itemList.length === 0) return [];

    const targetRowHeight = targetSize;
    const packed = [];
    let currentY = 0;
    let rowItems = [];
    let rowAspectSum = 0;

    const finalizeRow = (items, aspectSum, y, isLastRow = false) => {
      if (items.length === 0) return;
      let rowHeight = containerWidth / aspectSum;
      if (isLastRow && rowHeight > targetRowHeight * 1.5) {
        rowHeight = targetRowHeight;
      }
      let x = 0;
      for (const item of items) {
        const aspectRatio = item.aspectRatio || ((item.baseWidth || 100) / (item.baseHeight || 100));
        const itemWidth = Math.floor(rowHeight * aspectRatio);
        const itemHeight = Math.floor(rowHeight);
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
      rowItems.push(item);
      rowAspectSum += aspectRatio;
      const potentialHeight = containerWidth / rowAspectSum;
      if (potentialHeight <= targetRowHeight) {
        const rowHeight = finalizeRow(rowItems, rowAspectSum, currentY);
        currentY += rowHeight;
        rowItems = [];
        rowAspectSum = 0;
      }
    }
    if (rowItems.length > 0) {
      const rowHeight = finalizeRow(rowItems, rowAspectSum, currentY, true);
      currentY += rowHeight;
    }
    return packed;
  }, [baseSize]);

  // Pack Current Items
  const packItems = useCallback(() => {
    setItems(prev => packItemsTight(prev, canvasWidth));
    showToast('再配置しました');
  }, [canvasWidth, packItemsTight]);

  // Initialization - Load from IndexedDB (full data) with localStorage as fallback (metadata)
  useEffect(() => {
    const init = async () => {
      try {
        // Load Sets metadata from localStorage
        const storedSets = localStorage.getItem('collageSets');
        if (storedSets) {
          const parsed = JSON.parse(storedSets);
          const sets = Array.isArray(parsed) ? parsed : [];
          setCollageSets(sets);

          // Load active set
          const lastSetId = localStorage.getItem('currentSetId');
          let activeSet = null;
          if (lastSetId) activeSet = sets.find(s => s.id == lastSetId);
          if (!activeSet && sets.length > 0) activeSet = sets[0];

          if (activeSet) {
            setCurrentSetId(activeSet.id);
            setBgColor(activeSet.bgColor || '#1a1a2e');
            const bSize = activeSet.baseSize || 100;
            setBaseSize(bSize);

            // Try to load full data from IndexedDB
            try {
              const dbData = await loadFromDB(activeSet.id);
              if (dbData && dbData.items) {
                setItems(packItemsTight(dbData.items, window.innerWidth - 16, bSize));
              } else {
                // Fall back to localStorage items (may not have image data)
                setItems(packItemsTight(activeSet.items || [], window.innerWidth - 16, bSize));
              }
            } catch (e) {
              console.warn('IndexedDB load failed, using localStorage:', e);
              setItems(packItemsTight(activeSet.items || [], window.innerWidth - 16, bSize));
            }
          } else {
            // Create default set if none
            const defaultSet = { id: Date.now(), name: 'マイコラージュ', items: [], bgColor: '#1a1a2e', baseSize: 100 };
            setCollageSets([defaultSet]);
            setCurrentSetId(defaultSet.id);
          }
        } else {
          // New user -> Default set
          const defaultSet = { id: Date.now(), name: 'マイコラージュ', items: [], bgColor: '#1a1a2e', baseSize: 100 };
          setCollageSets([defaultSet]);
          setCurrentSetId(defaultSet.id);
          try {
            localStorage.setItem('collageSets', JSON.stringify([defaultSet]));
          } catch (e) {
            console.warn('localStorage init failed:', e);
          }
        }

        // Sync check
        const storedPwd = localStorage.getItem('syncPassword');
        if (storedPwd) {
          setSyncPassword(storedPwd);
          setIsSynced(true);
        }
      } catch (e) {
        console.error("Init Error", e);
      }
    };
    init();

    const handleResize = () => setCanvasWidth(window.innerWidth - 16);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update password persistence immediately
  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setSyncPassword(val);
    localStorage.setItem('syncPassword', val);
  };

  // Update userId persistence immediately
  const handleUserIdChange = (e) => {
    const val = e.target.value;
    setUserId(val);
    localStorage.setItem('userId', val);
  };

  // ========== DRAG AND DROP - COMPLETE REWRITE ==========
  // Using document-level event listeners to ensure browser default is always prevented

  const processDroppedFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const newItems = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      try {
        const dataUrl = await readFileAsDataURL(file);
        const dims = await getImageDimensions(dataUrl);
        const aspectRatio = dims.width / dims.height;
        const baseHeight = baseSize;
        const baseWidth = baseHeight * aspectRatio;

        newItems.push({
          id: Date.now() + i + Math.random(),
          type: 'image',
          src: dataUrl,
          x: 0,
          y: 0,
          baseWidth,
          baseHeight,
          scale: 1,
          aspectRatio
        });
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    }

    if (newItems.length > 0) {
      if (currentSetId === 'merged') {
        // Merge Mode: Add to "未整理"
        let unorg = collageSets.find(s => s.name === '未整理');
        if (!unorg) {
          const newId = Date.now();
          unorg = { id: newId, name: '未整理', items: [], bgColor: '#1a1a2e', baseSize: 100, updatedAt: Date.now() };
          setCollageSets(prev => [...prev, unorg]);
          await saveToDB(newId, unorg);
        }

        // Save to Unorganized DB
        const unorgData = await loadFromDB(unorg.id) || unorg;
        const updatedItems = [...(unorgData.items || []), ...newItems];
        await saveToDB(unorg.id, { ...unorgData, items: updatedItems });

        showToast(`「未整理」セットに追加しました (${newItems.length}枚)`);

        // Update Display
        setItems(prev => packItemsTight([...prev, ...newItems], canvasWidth));
      } else {
        setItems(prev => packItemsTight([...prev, ...newItems], canvasWidth));
        showToast(`${newItems.length}枚の画像を追加しました`);
      }
    }
  }, [baseSize, canvasWidth, packItemsTight]);

  // Document-level drag and drop handlers
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processDroppedFiles(e.dataTransfer.files);
      }
    };

    // Add listeners to document
    document.addEventListener('dragenter', handleDragEnter, true);
    document.addEventListener('dragover', handleDragOver, true);
    document.addEventListener('dragleave', handleDragLeave, true);
    document.addEventListener('drop', handleDrop, true);

    // Paste handler
    const handlePaste = (e) => {
      // Ignore if typing in input/textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        processDroppedFiles(e.clipboardData.files);
      }
    };
    document.addEventListener('paste', handlePaste);

    // Cleanup
    return () => {
      document.removeEventListener('dragenter', handleDragEnter, true);
      document.removeEventListener('dragover', handleDragOver, true);
      document.removeEventListener('dragleave', handleDragLeave, true);
      document.removeEventListener('drop', handleDrop, true);
      document.removeEventListener('paste', handlePaste);
    };
  }, [processDroppedFiles]);
  // ========== END DRAG AND DROP ==========

  // Handle file input - Parallel Processing
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    // Process all files in parallel
    const results = await Promise.allSettled(files.map(async (file) => {
      // Strict Validation
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        throw new Error('Unsupported File Type');
      }

      const dataUrl = await readFileAsDataURL(file);
      const dims = await getImageDimensions(dataUrl);

      if (dims.width < 5 || dims.height < 5) {
        throw new Error('Invalid dimensions');
      }

      const aspectRatio = dims.width / dims.height;
      const baseHeight = baseSize;
      const baseWidth = baseHeight * aspectRatio;

      return {
        id: Date.now() + Math.random(),
        type: 'image',
        src: dataUrl,
        x: 0,
        y: 0,
        baseWidth,
        baseHeight,
        scale: 1,
        aspectRatio
      };
    }));

    const newItems = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => a.id - b.id);

    const errors = results.filter(r => r.status === 'rejected').length;

    if (newItems.length > 0) {
      setItems(prev => packItemsTight([...prev, ...newItems], canvasWidth));
      showToast(`${newItems.length}枚の画像を追加しました${errors > 0 ? ` (${errors}枚失敗)` : ''}`);
    } else if (errors > 0) {
      showToast('画像の追加に失敗しました');
    }
    e.target.value = '';
  };

  // Button Paste
  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        if (!item.types.some(type => type.startsWith('image/'))) continue;
        const blob = await item.getType(item.types.find(type => type.startsWith('image/')));
        files.push(new File([blob], "pasted-image.png", { type: blob.type }));
      }
      if (files.length > 0) {
        processDroppedFiles(files);
      } else {
        showToast('画像が見つかりませんでした');
      }
    } catch (err) {
      console.error(err);
      showToast('クリップボードの読み取りに失敗しました (権限が必要です)');
    }
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

  /* Set Management */
  const createNewSet = async (name) => {
    const newSet = {
      id: Date.now(),
      name: name || '新規セット',
      items: [],
      bgColor: '#1a1a2e',
      baseSize: 100,
      updatedAt: Date.now()
    };

    // Explicitly save current set state before switching
    if (currentSetId) {
      const currentData = { items, bgColor, baseSize };
      await saveToDB(currentSetId, currentData);
      setCollageSets(prev => prev.map(s => s.id === currentSetId ? { ...s, items, bgColor, baseSize, updatedAt: Date.now() } : s));
    }

    // Save new set to IndexedDB
    await saveToDB(newSet.id, { items: [], bgColor: newSet.bgColor, baseSize: newSet.baseSize });

    setCollageSets(prev => {
      const next = [...prev, newSet];
      try {
        localStorage.setItem('collageSets', JSON.stringify(next));
      } catch (e) {
        console.warn('localStorage save failed:', e.message);
      }
      return next;
    });

    // Switch to new
    setCurrentSetId(newSet.id);
    setItems([]);
    setBgColor('#1a1a2e');
    setBaseSize(100);
    localStorage.setItem('currentSetId', newSet.id);

    setNewSetName(''); // Reset input
    setShowNewSetModal(false);
    setShowSetDropdown(false);
    showToast('新しいセットを作成しました');
  };

  const switchSet = async (id) => {
    if (id == currentSetId) return; // Loose equality for number/string id

    // 1. Save current set to IndexedDB (Async fire-and-forget for speed)
    if (currentSetId) {
      saveToDB(currentSetId, { items, bgColor, baseSize }).catch(e => console.warn('Background save failed:', e));


      // Update metadata in state/localStorage
      setCollageSets(prev => {
        const next = prev.map(s => s.id === currentSetId ?
          {
            ...s,
            items: items.map(i => ({ ...i, src: (i.type === 'image' && i.src.startsWith('data:')) ? '[STORED]' : i.src })),
            bgColor,
            baseSize,
            updatedAt: Date.now()
          }
          : s);

        try {
          localStorage.setItem('collageSets', JSON.stringify(next));
        } catch (e) {
          console.warn('localStorage save failed (quota exceeded?), proceeding with in-memory state:', e);
          // showToast('注意: ローカルストレージ容量不足（動作に影響なし）');
        }
        return next;
      });
    }

    const target = collageSets.find(s => s.id == id);
    if (target) {
      // 2. Load target set from IndexedDB
      try {
        const dbData = await loadFromDB(target.id);

        let newItems = [];
        let newBg = target.bgColor || '#1a1a2e';
        let newBase = target.baseSize || 100;

        if (dbData) {
          newItems = dbData.items || [];
          newBg = dbData.bgColor || newBg;
          newBase = dbData.baseSize || newBase;
        } else {
          // Fallback to state data if DB is empty
          newItems = target.items || [];
        }

        // Apply
        setItems(packItemsTight(newItems, canvasWidth, newBase));
        setBgColor(newBg);
        setBaseSize(newBase);
        setCurrentSetId(target.id);
        localStorage.setItem('currentSetId', target.id);
        setShowSetDropdown(false);
        // showToast removed per request

      } catch (e) {
        console.error('Switch set failed:', e);
        showToast('セットの読み込みに失敗しました');
      }
    }
  };

  const deleteSet = async (id) => {
    if (!confirm('このセットを削除しますか？クラウドからも削除されます。')) return;

    const target = collageSets.find(s => s.id == id);
    const textName = target ? target.name : id;

    const remaining = collageSets.filter(s => s.id != id);
    setCollageSets(remaining);
    localStorage.setItem('collageSets', JSON.stringify(remaining));

    // Cloud delete
    if (isSynced && syncPassword) {
      try {
        await cloudDelete(`set_${id}`, syncPassword);
      } catch (e) {
        console.error("Cloud delete failed", e);
      }
    }

    // If deleted current
    if (id == currentSetId) {
      if (remaining.length > 0) {
        switchSet(remaining[0].id);
      } else {
        createNewSet('マイコラージュ');
      }
    }
    showToast('セットを削除しました');
  };

  const renameSet = (name) => {
    if (!name.trim()) return;
    setCollageSets(prev => {
      const next = prev.map(s => s.id == currentSetId ? { ...s, name: name, updatedAt: Date.now() } : s);
      localStorage.setItem('collageSets', JSON.stringify(next));
      return next;
    });
    showToast('セット名を変更しました');
  };

  const moveSet = (fromIdx, toIdx) => {
    setCollageSets(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      localStorage.setItem('collageSets', JSON.stringify(next));
      return next;
    });
  };

  // Preset management (Saved Combinations)
  const savePreset = () => {
    if (selectedMergeIds.length < 2) {
      showToast('複数のセットを選択してください');
      return;
    }
    const name = prompt('この組み合わせ（プリセット）の名前を入力:');
    if (!name) return;

    const preset = {
      id: 'preset_' + Date.now(),
      name,
      setIds: [...selectedMergeIds], // Save the list of set IDs
      bgColor: bgColor, // Optional: save current bg/size
      baseSize: baseSize,
      savedAt: Date.now()
    };

    // Check for duplicate names? Nah, just add.
    const newPresets = [...presets, preset];
    setPresets(newPresets);
    localStorage.setItem('collagePresets', JSON.stringify(newPresets));
    showToast(`プリセット "${name}" を保存しました`);
  };

  const loadPreset = (preset) => {
    // Restore the combination
    const existingIds = preset.setIds.filter(id => collageSets.find(s => s.id == id));
    if (existingIds.length === 0) {
      showToast('プリセットに含まれるセットが見つかりません');
      return;
    }

    setSelectedMergeIds(existingIds);
    // Switch to merged view
    setCurrentSetId('merged');
    const mergedData = getMergedItems(existingIds);
    setItems(packItemsTight(mergedData, canvasWidth));

    if (preset.bgColor) setBgColor(preset.bgColor);
    if (preset.baseSize) setBaseSize(preset.baseSize);

    setShowSetDropdown(false);
    showToast(`プリセット "${preset.name}" を読み込みました`);
  };

  const deletePreset = (presetId) => {
    const newPresets = presets.filter(p => p.id !== presetId);
    setPresets(newPresets);
    localStorage.setItem('collagePresets', JSON.stringify(newPresets));
    showToast('プリセットを削除しました');
  };

  /* Cloud Sync Logic */
  const createZipBlob = async (targetItems, targetBg, targetBase, setName = '') => {
    const zip = new JSZip();
    const data = { name: setName, items: [], bgColor: targetBg, baseSize: targetBase };

    for (const item of targetItems) {
      if (item.type === 'image' && item.src.startsWith('data:')) {
        const ext = item.src.includes('gif') ? 'gif' : 'jpg';
        // handle base64
        const parts = item.src.split(',');
        if (parts.length > 1) {
          zip.file(`images/${item.id}.${ext}`, parts[1], { base64: true });
          data.items.push({ ...item, src: `images/${item.id}.${ext}` });
        } else {
          // Fallback for weird urls?
          data.items.push(item);
        }
      } else {
        data.items.push(item);
      }
    }

    zip.file('data.json', JSON.stringify(data, null, 2));
    return await zip.generateAsync({ type: 'blob' });
  };

  const unpackZipToSet = async (blob, id) => {
    const zip = await JSZip.loadAsync(blob);
    const json = await zip.file('data.json').async('string');
    const data = JSON.parse(json);

    const restoredItems = [];
    for (const item of data.items) {
      if (item.type === 'image' && item.src.startsWith('images/')) {
        const file = zip.file(item.src);
        if (file) {
          const b64 = await file.async('base64');
          const ext = item.src.includes('gif') ? 'gif' : 'jpeg';
          restoredItems.push({ ...item, src: `data:image/${ext};base64,${b64}` });
        } else {
          restoredItems.push(item);
        }
      } else {
        restoredItems.push(item);
      }
    }
    return {
      id: id, // numeric or string?
      name: data.name || `Set ${id}`, // Name might be lost if not in json? We should store name in json
      items: restoredItems,
      bgColor: data.bgColor,
      baseSize: data.baseSize
    };
  };

  // ========== SIMPLIFIED CLOUD SYNC ==========
  // Single unified backup approach
  // Requires userId + syncPassword combination

  // Save ALL data to cloud as single backup
  const saveToCloud = async () => {
    if (!userId) { showToast('IDを入力してください'); return; }
    if (!syncPassword) { showToast('キーを入力してください'); return; }

    // Smart Sync: Conflict Check
    if (cloudUpdatedAt > lastSyncedAt && cloudUpdatedAt > 0) {
      if (!confirm('⚠️ クラウド上に新しいデータがあります！\n本当に上書きしますか？')) {
        return;
      }
    }

    setIsSyncing(true);
    showToast('データを収集中...');
    try {
      // Collect ALL sets with full data
      const allSetsData = [];
      for (const set of collageSets) {
        let setData;
        if (set.id == currentSetId && currentSetId !== 'merged') {
          setData = { id: set.id, name: set.name, items, bgColor, baseSize };
        } else {
          const dbData = await loadFromDB(set.id);
          setData = dbData ? { id: set.id, name: set.name, ...dbData } : { id: set.id, name: set.name, items: [], bgColor: '#1a1a2e', baseSize: 100 };
        }
        allSetsData.push(setData);
      }

      // Create unified backup
      const backup = {
        version: 2,
        timestamp: Date.now(),
        currentSetId: currentSetId !== 'merged' ? currentSetId : (collageSets[0]?.id || null),
        sets: allSetsData
      };

      // Upload (Differential)
      showToast('アップロード中...');
      setSyncProgress(0);
      await cloudUpload(backup, getCloudKey(), (current, total) => {
        const pct = (current / total) * 100;
        setSyncProgress(pct);
        // showToast(`アップロード中 ${Math.round(pct)}%...`); // Optional: reduce toast spam
      });

      // Cleanup old chunks (legacy)
      await cleanupOldBackups(null, getCloudKey());

      showToast('クラウドに保存しました ✓');

      // Update Sync Timestamp
      const now = Date.now();
      localStorage.setItem('lastSyncedAt', now);
      setLastSyncedAt(now);
      localStorage.setItem('localUpdatedAt', now); // Reset local diff
      setLocalUpdatedAt(now);
      setCloudUpdatedAt(now);
    } catch (e) {
      console.error('Cloud save failed:', e);
      showToast('保存エラー: ' + e.message);
    }
    setIsSyncing(false);
  };

  // Load unified backup from cloud
  const loadFromCloud = async () => {
    if (!userId) { showToast('IDを入力してください'); return; }
    if (!syncPassword) { showToast('キーを入力してください'); return; }

    setIsSyncing(true);
    showToast('ダウンロード中...');
    try {
      // Download backup file (returns restored JSON Blob)
      setSyncProgress(0);
      const blob = await cloudDownload('backup', getCloudKey(), (current, total) => {
        const pct = (current / total) * 100;
        setSyncProgress(pct);
      });
      if (!blob) {
        showToast('クラウドにデータがありません');
        setIsSyncing(false);
        return;
      }

      const backup = JSON.parse(await blob.text());

      // Validate structure
      if (!backup.sets || !Array.isArray(backup.sets)) {
        throw new Error('バックアップ形式が不正です');
      }

      const restoredSets = backup.sets;

      // Apply restored data
      setCollageSets(restoredSets.map(s => ({ id: s.id, name: s.name })));

      // Save all to IndexedDB
      for (const setData of restoredSets) {
        await saveToDB(setData.id, { items: setData.items, bgColor: setData.bgColor, baseSize: setData.baseSize });
      }

      // Load first set or restored current
      const targetSetId = backup.currentSetId || restoredSets[0]?.id;
      const targetSet = restoredSets.find(s => s.id == targetSetId) || restoredSets[0];

      if (targetSet) {
        setCurrentSetId(targetSet.id);
        setItems(packItemsTight(targetSet.items || [], canvasWidth, targetSet.baseSize || 100));
        setBgColor(targetSet.bgColor || '#1a1a2e');
        setBaseSize(targetSet.baseSize || 100);
      }

      showToast(`復元完了: ${restoredSets.length}セット`);

      // Update Sync Timestamp
      const now = Date.now();
      localStorage.setItem('lastSyncedAt', now);
      setLastSyncedAt(now);
      localStorage.setItem('localUpdatedAt', now); // Reset local diff
      setLocalUpdatedAt(now);

    } catch (e) {
      console.error('Cloud load failed:', e);
      showToast('読み込みエラー: ' + e.message);
    }
    setIsSyncing(false);
  };
  // ========== END CLOUD SYNC ==========

  // Auto-save Effect - Local only (IndexedDB + localStorage metadata)
  useEffect(() => {
    if (!currentSetId) return;

    const saveData = async () => {
      try {
        // 1. Save full data to IndexedDB (can handle large images)
        await saveToDB(currentSetId, { items, bgColor, baseSize });

        // 2. Save only metadata (without image src) to localStorage for quick loading
        const metaItems = items.map(item => ({
          ...item,
          src: item.type === 'image' ? '[STORED_IN_INDEXEDDB]' : item.src
        }));
        const metadata = { id: currentSetId, items: metaItems, bgColor, baseSize, updatedAt: Date.now() };

        // Update collageSets state with metadata only
        setCollageSets(prev => {
          const next = prev.map(s => s.id == currentSetId ? { ...metadata, name: s.name } : s);
          try {
            localStorage.setItem('collageSets', JSON.stringify(next));
          } catch (e) {
            console.warn('localStorage save failed, using IndexedDB only:', e.message);
          }
          return next;
        });
      } catch (e) {
        console.error('Save failed:', e);
      }

      // Update Local Timestamp
      const now = Date.now();
      localStorage.setItem('localUpdatedAt', now);
      setLocalUpdatedAt(now);
    };

    saveData();
  }, [items, bgColor, baseSize, currentSetId]);

  // Update rename input when set changes
  useEffect(() => {
    const current = collageSets.find(s => s.id == currentSetId);
    if (current) setRenameInput(current.name);
  }, [currentSetId, collageSets]);

  /* Utility */
  const handleClearAll = () => {
    if (confirm('現在のセットをクリアしますか？')) {
      setItems([]);
    }
  };

  const handlePackItems = () => {
    setItems(prev => packItemsTight(prev, canvasWidth));
    showToast('再配置しました');
  };

  /* Export/Import helpers (Client side zip) */
  const exportZip = async () => {
    try {
      const blob = await createZipBlob(items, bgColor, baseSize);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use current set name
      const setName = collageSets.find(s => s.id == currentSetId)?.name || 'collage';
      a.download = `${setName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Zipをエクスポートしました');
    } catch (e) {
      console.error(e);
      showToast('エクスポート失敗');
    }
  };

  const importZip = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      // Import as NEW set
      const setObj = await unpackZipToSet(file, Date.now());
      const newName = setObj.name || file.name.replace(/\.zip$/i, '');
      const newSet = { ...setObj, name: newName, updatedAt: Date.now() };

      setCollageSets(prev => {
        const next = [...prev, newSet];
        localStorage.setItem('collageSets', JSON.stringify(next));
        return next;
      });
      switchSet(newSet.id);
      showToast('セットをインポートしました');
    } catch (e) {
      console.error(e);
      showToast('インポート失敗 (有効なバックアップではありません)');
    }
    e.target.value = '';
  };

  const searchGoogle = () => {
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`, '_blank');
    setShowSearchModal(false);
  };

  const searchDuckDuckGo = () => {
    window.open(`https://duckduckgo.com/?iax=images&ia=images&q=${encodeURIComponent(searchQuery)}`, '_blank');
    setShowSearchModal(false);
  };

  // Crop functions - direct open
  const openCropEditor = (src, itemId) => {
    const item = items.find(i => i.id === itemId);
    setCropLink(item ? (item.link || '') : '');
    setCropImage(src);
    setCropItemId(itemId);
    setCropStart(null);
    setCropEnd(null);
    setCropHistory([]); // Reset history on fresh open
    setCropScale(1);
    setCropTranslate({ x: 0, y: 0 });
    setShowCropModal(true);
  };

  const handleCropStart = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Resize Logic (Skip if multi-touch)
    if (cropStart && cropEnd && (!e.touches || e.touches.length === 1)) {
      const x1 = Math.min(cropStart.x, cropEnd.x);
      const y1 = Math.min(cropStart.y, cropEnd.y);
      const x2 = Math.max(cropStart.x, cropEnd.x);
      const y2 = Math.max(cropStart.y, cropEnd.y);
      const touchR = 30; // 30px hit radius

      const dist = (ax, ay) => Math.hypot(ax - x, ay - y);

      let newStart = null;
      if (dist(x1, y1) < touchR) newStart = { x: x2, y: y2 }; // TL -> Fix BR
      else if (dist(x2, y1) < touchR) newStart = { x: x1, y: y2 }; // TR -> Fix BL
      else if (dist(x1, y2) < touchR) newStart = { x: x2, y: y1 }; // BL -> Fix TR
      else if (dist(x2, y2) < touchR) newStart = { x: x1, y: y1 }; // BR -> Fix TL

      if (newStart) {
        setCropStart(newStart);
        setCropEnd({ x, y });
        setIsCropping(true);
        return;
      }
    }

    setCropStart({ x, y });
    setCropEnd({ x, y });
    setIsCropping(true);
    // Show magnifier on mobile
    if (e.touches) {
      if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        const midX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
        const midY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
        setPinchStartDist(dist);
        setPinchStartBaseSize(cropScale);
        lastPinchCenterRef.current = { x: midX, y: midY };
        setIsCropping(false); // Disable crop rect while zooming
        return;
      }
      setCropMagnifier({ x, y, clientX, clientY });
    }
  };

  const handleCropMove = (e) => {
    if (e.touches && e.touches.length === 2 && pinchStartDist) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      const midX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
      const midY = (e.touches[0].pageY + e.touches[1].pageY) / 2;

      // Zoom
      const scale = dist / pinchStartDist;
      setCropScale(Math.max(0.5, Math.min(5, pinchStartBaseSize * scale)));

      // Pan
      if (lastPinchCenterRef.current) {
        const dx = midX - lastPinchCenterRef.current.x;
        const dy = midY - lastPinchCenterRef.current.y;
        setCropTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      }
      lastPinchCenterRef.current = { x: midX, y: midY };
      return;
    }

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

  const handleCropEnd = (e) => {
    // Check for tap (minimal movement) on edges to switch image
    if (isCropping && cropStart && cropEnd) {
      const dist = Math.sqrt(Math.pow(cropEnd.x - cropStart.x, 2) + Math.pow(cropEnd.y - cropStart.y, 2));
      if (dist < 10) {
        // It's a tap
        const rect = cropCanvasRef.current?.getBoundingClientRect();
        if (rect) {
          const width = rect.width;
          const x = cropStart.x;
          // Tap on Left 20% or Right 20% -> Random Next
          /* Edge tap disabled as per user request
          if (x < width * 0.2 || x > width * 0.8) {
            openRandomNext();
            setCropStart(null);
            setCropEnd(null);
          }
          */
        }
      }
    }

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

  // Random Next Image in Crop Modal
  const openRandomNext = () => {
    const imageItems = items.filter(i => i.type === 'image' && i.id !== cropItemId);
    if (imageItems.length === 0) {
      showToast('他の画像がありません');
      return;
    }
    // Save current to history before switching
    setCropHistory(prev => [...prev, cropItemId]);

    const randomItem = imageItems[Math.floor(Math.random() * imageItems.length)];
    // Set state directly to avoid clearing history (openCropEditor clears it)
    setCropImage(randomItem.src);
    setCropItemId(randomItem.id);
    setCropStart(null);
    setCropEnd(null);
    // history is preserved
  };

  const openPrevCrop = () => {
    if (cropHistory.length === 0) return;
    const prevId = cropHistory[cropHistory.length - 1];
    const prevItem = items.find(i => i.id === prevId);
    if (prevItem) {
      setCropImage(prevItem.src);
      setCropItemId(prevItem.id);
      setCropStart(null);
      setCropEnd(null);
      setCropHistory(prev => prev.slice(0, -1));
    } else {
      showToast('画像が見つかりません');
      setCropHistory(prev => prev.slice(0, -1));
    }
  };

  // Move item from Crop Modal
  const moveCurrentCropItem = () => {
    closeCropModal();
    setSelectedItems([cropItemId]);
    setMoveTargetSetId('');
    setShowMoveSetModal(true);
  };

  const deleteCurrentCropItem = () => {
    // Immediate delete, no confirm
    deleteItem(cropItemId);
    // Clean history
    setCropHistory(prev => prev.filter(id => id !== cropItemId));
    // Always close
    closeCropModal();
  };

  // Toggle pin for current crop item
  const toggleCropItemPin = () => {
    if (!cropItemId) return;
    setItems(prev => {
      const updated = prev.map(i =>
        i.id === cropItemId ? { ...i, pinned: !i.pinned } : i
      );
      const pinned = updated.filter(i => i.pinned);
      const unpinned = updated.filter(i => !i.pinned);
      return packItemsTight([...pinned, ...unpinned], canvasWidth);
    });
    const currentItem = items.find(i => i.id === cropItemId);
    showToast(currentItem?.pinned ? '固定解除' : '固定しました');
  };

  const editCropLink = async () => {
    let initialValue = cropLink;
    try {
      // Auto-paste from clipboard
      const text = await navigator.clipboard.readText();
      if (text) initialValue = text;
    } catch (e) {
      // Clipboard access might be denied or not available
      console.log('Clipboard read failed:', e);
    }

    const url = window.prompt("リンクURLを入力してください", initialValue);
    if (url !== null) {
      setCropLink(url);
      if (cropItemId) {
        setItems(prev => prev.map(i => i.id === cropItemId ? { ...i, link: url } : i));
        showToast('リンクを保存しました');
      }
    }
  };

  const openCropLink = () => {
    if (cropLink) window.open(cropLink, '_blank');
  };

  const startRandomLoop = () => {
    if (randomTimerRef.current) return;
    openRandomNext();
    randomTimerRef.current = setInterval(openRandomNext, randomInterval);
  };

  const stopRandomLoop = () => {
    if (randomTimerRef.current) {
      clearInterval(randomTimerRef.current);
      randomTimerRef.current = null;
    }
  };

  // Touch handlers (no more long-press pinning)
  const handleItemTouchStart = () => { };
  const handleItemTouchMove = () => { };
  const handleItemTouchEnd = () => { };

  // Mouse handlers (no more long-press pinning)
  const handleItemMouseDown = () => { };
  const handleItemMouseUp = () => { };

  const handleItemClick = (e, item) => {
    e.stopPropagation();
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      return; // Prevent click after long press
    }

    // Edit mode: toggle selection
    if (editMode) {
      setSelectedItems(prev =>
        prev.includes(item.id)
          ? prev.filter(id => id !== item.id)
          : [...prev, item.id]
      );
      return;
    }

    // Fixed check removed as per user request

    if (item.type === 'image') {
      openCropEditor(item.src, item.id);
    } else {
      setSelectedId(item.id);
    }
  };

  // Delete selected items (edit mode)
  const deleteSelectedItems = () => {
    if (selectedItems.length === 0) return;
    if (!confirm(`${selectedItems.length}個のアイテムを削除しますか？`)) return;
    setItems(prev => packItemsTight(prev.filter(i => !selectedItems.includes(i.id)), canvasWidth));
    setSelectedItems([]);
    showToast(`${selectedItems.length}個削除しました`);
  };

  // Toggle pin for selected items
  const togglePinSelectedItems = () => {
    if (selectedItems.length === 0) return;

    setItems(prev => {
      // Check if all selected are pinned
      const selectedObjs = prev.filter(i => selectedItems.includes(i.id));
      const allPinned = selectedObjs.every(i => i.pinned);
      const newPinnedState = !allPinned;

      const updated = prev.map(i =>
        selectedItems.includes(i.id) ? { ...i, pinned: newPinnedState } : i
      );

      // Sort: pinned items first
      const pinned = updated.filter(i => i.pinned);
      const unpinned = updated.filter(i => !i.pinned);
      return packItemsTight([...pinned, ...unpinned], canvasWidth);
    });

    showToast('固定状態を変更しました');
    setSelectedItems([]);
    setEditMode(false);
  };

  // Move items to another set
  const openMoveModal = () => {
    if (selectedItems.length === 0) return;
    setMoveTargetSetId('');
    setShowMoveSetModal(true);
  };

  // Bulk Zip Download
  const downloadAllImagesZip = async () => {
    try {
      showToast('ZIP作成中...お待ちください');
      const zip = new JSZip();

      for (const set of collageSets) {
        const folder = zip.folder(set.name || `Set ${set.id}`);
        const data = await loadFromDB(set.id);
        const itemsToSave = data ? data.items : [];

        let imgCount = 0;
        for (const item of itemsToSave) {
          if (item.type === 'image') {
            // item.src should be dataURL
            const base64 = item.src.split(',')[1];
            if (base64) {
              // Detect extension
              let ext = 'png';
              if (item.src.includes('image/jpeg')) ext = 'jpg';
              else if (item.src.includes('image/gif')) ext = 'gif';
              else if (item.src.includes('image/webp')) ext = 'webp';

              folder.file(`image_${++imgCount}.${ext}`, base64, { base64: true });
            }
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "all_collages_images.zip";
      a.click();
      URL.revokeObjectURL(url);
      showToast('ダウンロード開始しました');
    } catch (e) {
      console.error(e);
      showToast('ZIP作成に失敗しました');
    }
  };

  // Merge Logic
  const toggleMergeSelect = (id) => {
    setSelectedMergeIds(prev =>
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const showMergedSets = async () => {
    if (selectedMergeIds.length === 0) return;
    showToast('セットを結合して表示中 (保存不可)');

    let allItems = [];
    for (const id of selectedMergeIds) {
      const data = await loadFromDB(id);
      if (data && data.items) allItems.push(...data.items);
    }
    setItems(allItems);
    setCurrentSetId('merged'); // Special ID
    setShowSetDropdown(false);
  };

  const moveItemsToSet = async () => {
    if (!moveTargetSetId) return;

    // Get items to move
    const itemsToMove = items.filter(i => selectedItems.includes(i.id));

    try {
      // Load target set
      const targetSet = collageSets.find(s => s.id == moveTargetSetId);
      if (!targetSet) throw new Error('Target set not found');

      const dbData = await loadFromDB(targetSet.id);
      let targetItems = targetSet.items || [];
      if (dbData && dbData.items) targetItems = dbData.items;

      // Add to target
      const updatedTargetItems = [...targetItems, ...itemsToMove];

      // Save target set
      await saveToDB(targetSet.id, {
        items: updatedTargetItems,
        bgColor: dbData?.bgColor || targetSet.bgColor,
        baseSize: dbData?.baseSize || targetSet.baseSize
      });

      // Update metadata (with placeholders)
      setCollageSets(prev => prev.map(s => s.id == moveTargetSetId ?
        { ...s, items: updatedTargetItems.map(i => ({ ...i, src: (i.type === 'image' && i.src.startsWith('data:')) ? '[STORED]' : i.src })), updatedAt: Date.now() }
        : s));

      // Remove from current set
      setItems(prev => packItemsTight(prev.filter(i => !selectedItems.includes(i.id)), canvasWidth));

      showToast(`${itemsToMove.length}個のアイテムを移動しました`);
      setSelectedItems([]);
      setEditMode(false);
      setShowMoveSetModal(false);

    } catch (e) {
      console.error('Move failed:', e);
      showToast('移動に失敗しました: ' + e.message);
    }
  };

  // Exit edit mode
  const exitEditMode = () => {
    setEditMode(false);
    setSelectedItems([]);
  };

  // Combined Touch Handlers (Pull & Pinch)
  const handleMainTouchStart = (e) => {
    if (e.touches.length === 2) {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      setPinchStartDist(dist);
      setPinchStartBaseSize(baseSize);
      setPullStartY(null);
      setIsPulling(false);
      swipeStartRef.current = null;
    } else if (e.touches.length === 1) {
      // Record start position for swipe detection
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setSwipeOffset(0); // Reset visual offset
      // Pull to shuffle logic
      if (mainContentRef.current && mainContentRef.current.scrollTop === 0) {
        setPullStartY(e.touches[0].clientY);
      }

      // Smart Preload Neighbors for "Photos-like" swipe
      const navList = [
        ...presets.map(p => ({ type: 'preset', id: p.id, data: p, name: p.name })),
        ...collageSets.map(s => ({ type: 'set', id: s.id, data: s, name: s.name }))
      ];
      let currentIdx = -1;
      if (currentSetId === 'merged') {
        const sortedMerge = [...selectedMergeIds].sort().join(',');
        currentIdx = navList.findIndex(item => item.type === 'preset' && [...item.data.setIds].sort().join(',') === sortedMerge);
      } else {
        currentIdx = navList.findIndex(item => item.type === 'set' && item.id == currentSetId);
      }
      // Fallback
      if (currentIdx === -1 && collageSets.length > 0) currentIdx = presets.length;

      // Load Prev
      if (currentIdx > 0) {
        const prev = navList[currentIdx - 1];
        if (prev.type === 'preset') {
          // Preset logic: need to load sets and merge? Presets are specialized.
          // For now just background color or simple indicator
          setPrevSetData({ items: [], bgColor: '#333', name: prev.name, isPreset: true });
        } else {
          loadFromDB(prev.id).then(data => {
            if (data) setPrevSetData(data);
            else setPrevSetData({ items: [], bgColor: prev.data.bgColor, name: prev.name });
          });
        }
      } else {
        setPrevSetData(null);
      }

      // Load Next
      if (currentIdx < navList.length - 1) {
        const next = navList[currentIdx + 1];
        if (next.type === 'preset') {
          setNextSetData({ items: [], bgColor: '#333', name: next.name, isPreset: true });
        } else {
          loadFromDB(next.id).then(data => {
            if (data) setNextSetData(data);
            else setNextSetData({ items: [], bgColor: next.data.bgColor, name: next.name });
          });
        }
      } else {
        setNextSetData(null);
      }

    }
  };

  const handleMainTouchMove = (e) => {
    // Reinforce: Clear timer on any 2-finger interaction
    if (e.touches.length > 1 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (e.touches.length === 2 && pinchStartDist) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      const scale = dist / pinchStartDist;
      const newSize = Math.max(50, Math.min(300, pinchStartBaseSize * scale));
      setBaseSize(newSize);
      setItems(prev => packItemsTight(prev, canvasWidth, newSize));
    } else if (e.touches.length === 1 && pullStartY !== null) {
      const diff = e.touches[0].clientY - pullStartY;
      // Strict check: Only pull if BOTH window and container are at very top
      const pageScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const containerScrollTop = mainContentRef.current ? mainContentRef.current.scrollTop : 0;

      if (pageScrollTop === 0 && containerScrollTop === 0) {
        if (diff > 50) {
          setIsPulling(true);
        }
      }
    }

    // Visual Swipe Feedback
    if (swipeStartRef.current && e.touches.length === 1) {
      const diffX = e.touches[0].clientX - swipeStartRef.current.x;
      // Only move if horizontal-ish
      if (Math.abs(diffX) > 10) {
        // setSwipeOffset(diffX); // Disabled as per user request
      }
    }
  };

  const handleMainTouchEnd = (e) => {
    setPinchStartDist(null);
    if (isPulling) {
      shuffleItems();
    }
    setPullStartY(null);
    setIsPulling(false);

    // Horizontal swipe detection for set switching
    if (swipeStartRef.current && e.changedTouches?.length === 1) {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - swipeStartRef.current.x;
      const diffY = endY - swipeStartRef.current.y;

      // Only trigger if horizontal movement is dominant and significant
      if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {

        // Animate out
        // const screenW = window.innerWidth;
        // setSwipeOffset(diffX < 0 ? -screenW : screenW);

        // Wait for animation then switch
        setTimeout(() => {
          // Unified Navigation List: [Presets] -> [Sets]
          const navList = [
            ...presets.map(p => ({ type: 'preset', id: p.id, data: p, name: p.name })),
            ...collageSets.map(s => ({ type: 'set', id: s.id, data: s, name: s.name }))
          ];

          let currentIdx = -1;
          if (currentSetId === 'merged') {
            // Match current merge selection to a preset
            const sortedMerge = [...selectedMergeIds].sort().join(',');
            currentIdx = navList.findIndex(item =>
              item.type === 'preset' && [...item.data.setIds].sort().join(',') === sortedMerge
            );
          } else {
            currentIdx = navList.findIndex(item => item.type === 'set' && item.id == currentSetId);
          }

          // Fallback: if unknown state, assume start of regular sets
          if (currentIdx === -1 && collageSets.length > 0) {
            currentIdx = presets.length;
          }

          let nextIdx = currentIdx;
          if (diffX < 0) { // Swipe Left -> Next
            nextIdx++;
          } else { // Swipe Right -> Prev
            nextIdx--;
          }

          if (nextIdx >= 0 && nextIdx < navList.length) {
            const target = navList[nextIdx];

            // Simple Switch
            if (target.type === 'preset') {
              loadPreset(target.data);
            } else {
              switchSet(target.id);
            }
            // setSwipeOffset(0);

          } else {
            // Bounce back if no next set
            // setSwipeOffset(0);
          }
        }, 200); // Wait for exit animation

        return; // Early return to let timeout handle execution
      }
    }
    // Reset if no swipe or cancelled
    setSwipeOffset(0);
    swipeStartRef.current = null;
  };

  const canvasHeight = items.length > 0
    ? Math.max(150, Math.max(...items.map(i => i.y + Math.floor((i.baseHeight || 100) * (i.scale || 1)))) + 8)
    : 150;

  const selectedItem = items.find(i => i.id === selectedId);

  // Copy Image to Clipboard (Original Quality)
  const handleCopyImage = async (src) => {
    if (!src || !src.startsWith('data:image')) {
      showToast('画像が見つかりません');
      return;
    }
    try {
      const base64 = src.split(',')[1];
      const mime = src.split(';')[0].split(':')[1];
      const res = await fetch(src);
      const blob = await res.blob();

      const item = new ClipboardItem({ [mime]: blob });
      await navigator.clipboard.write([item]);
      showToast('画像をコピーしました');
    } catch (e) {
      console.error('Copy failed:', e);
      showToast('コピーに失敗しました');
    }
  };

  return (
    <div className={`app ${isDarkMode ? 'dark' : ''} ${isGrayscale ? 'grayscale-mode' : ''}`}>
      {isSyncing && (
        <div className="progress-overlay">
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${syncProgress}%` }}></div>
            <div className="progress-text">{Math.round(syncProgress)}%</div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && <div className="toast">{toast}</div>}

      {/* Global Drop Overlay */}
      {isDragging && (
        <div
          className="drop-overlay"
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleDrop(e);
          }}
        >
          <div className="drop-message">
            📂 ここにファイルをドロップ
          </div>
        </div>
      )}

      {currentView === 'settings' ? (
        <div className="settings-page">
          <div className="settings-header">
            <button onClick={() => setCurrentView('main')} className="back-btn">← 戻る</button>
            <h2>設定</h2>
          </div>

          <div className="settings-content">
            <div className="settings-section">
              <h3>☁️ クラウド同期</h3>
              <p className="settings-desc">ID＋キーの組み合わせで、クラウドに保存/読み込みできます。</p>
              <div className="settings-row">
                <input
                  type="text"
                  value={userId}
                  onChange={handleUserIdChange}
                  placeholder="ユーザーID"
                  className="password-input"
                  style={{ marginBottom: '8px' }}
                />
              </div>
              <div className="settings-row">
                <input
                  type="text"
                  value={syncPassword}
                  onChange={handlePasswordChange}
                  placeholder="キー（パスワード）"
                  className="password-input"
                />
              </div>
              <div className="settings-row" style={{ marginTop: '12px', gap: '8px' }}>
                <button onClick={saveToCloud} className="sync-btn" disabled={isSyncing || !userId || !syncPassword}>
                  {isSyncing ? '通信中...' : '📤 クラウドに保存'}
                </button>
                <button onClick={loadFromCloud} className="sync-btn" disabled={isSyncing || !userId || !syncPassword}>
                  {isSyncing ? '通信中...' : '📥 クラウドから読み込み'}
                </button>
              </div>
              {userId && syncPassword && <p className="sync-status-ok">✓ ID: {userId.substring(0, 5)}... / キー: ***</p>}
            </div>

            <div className="settings-section">
              <h3>⚡ ランダム切り替え設定</h3>
              <p className="settings-desc">長押し時の切り替え間隔: {randomInterval}ms</p>
              <div className="settings-row">
                <input
                  type="range" min="100" max="1000" step="50"
                  value={randomInterval}
                  onChange={e => setRandomInterval(+e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>🎨 表示モード</h3>
              <div className="settings-row">
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isGrayscale}
                    onChange={e => setIsGrayscale(e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  グレースケールモード
                </label>
              </div>
            </div>

            {/* UI Visibility Settings */}
            <div className="settings-section">
              <h3>👁️ 表示設定</h3>
              <div className="settings-row" style={{ flexWrap: 'wrap' }}>
                {Object.keys(uiVisibility).map(key => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', marginRight: '12px', cursor: 'pointer', padding: '4px 0' }}>
                    <input
                      type="checkbox"
                      checked={uiVisibility[key]}
                      onChange={e => {
                        const next = { ...uiVisibility, [key]: e.target.checked };
                        setUiVisibility(next);
                        localStorage.setItem('uiVisibility', JSON.stringify(next));
                      }}
                      style={{ marginRight: '6px' }}
                    />
                    {key === 'camera' ? '📷 画像追加' :
                      key === 'text' ? 'Aa テキスト' :
                        key === 'search' ? '🔍 検索' :
                          key === 'edit' ? '✅ 選択' :
                            key === 'shuffle' ? '🎲 シャッフル' :
                              key === 'cloud' ? '☁️ クラウド' : key}
                  </label>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <h3>🛠️ 現在のセット設定</h3>
              <div className="settings-row">
                <label>セット名</label>
                <input
                  type="text"
                  value={renameInput}
                  onChange={e => setRenameInput(e.target.value)}
                  onBlur={() => renameSet(renameInput)}
                  className="password-input"
                />
              </div>
              <div className="settings-row">
                <label>基本サイズ</label>
                <input type="range" min="50" max="200" value={baseSize} onChange={e => setBaseSize(+e.target.value)} />
                <span>{baseSize}px</span>
              </div>
              <div className="settings-row">
                <label>背景色</label>
                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} />
              </div>
              <div className="settings-actions">
                <button onClick={handlePackItems}>📦 配置などの整理</button>
                <button onClick={handleClearAll} className="btn-danger">🗑️ 全て再セット</button>
                <button onClick={() => deleteSet(currentSetId)} className="btn-danger">❌ このセットを削除</button>
              </div>
            </div>

            <div className="settings-section">
              <h3>📁 データ管理</h3>
              <button onClick={downloadAllImagesZip}>📦 全セットの画像をZIPでダウンロード</button>
              <button onClick={exportZip}>📤 現在のセットをZIP出力</button>
              <label className="file-btn">
                📥 ZIP読込
                <input type="file" accept=".zip" onChange={importZip} style={{ display: 'none' }} />
              </label>
            </div>


          </div>
        </div>
      ) : (
        <>
          {/* Main Header */}
          <header className="header">
            <div className="header-left">
              <h1 className="app-title">{collageSets.find(s => s.id == currentSetId)?.name || 'Collage'}</h1>
              <button onClick={() => setCurrentView('settings')} className="settings-btn" title="設定">⚙️</button>
            </div>
            <div className="header-right">
              {/* Smart Sync Indicators */}
              {(cloudUpdatedAt > lastSyncedAt && cloudUpdatedAt > 0) && (
                <button
                  className="status-indicator update"
                  onClick={loadFromCloud}
                  title="クラウドに新しいデータがあります"
                  style={{ background: '#ffe600', color: '#000', fontWeight: 'bold', animation: 'pulse 2s infinite' }}
                >
                  📥 更新あり
                </button>
              )}
              {(localUpdatedAt > lastSyncedAt && lastSyncedAt > 0) && (
                <span
                  className="status-indicator unsaved"
                  title="変更がクラウドに保存されていません"
                  style={{ color: '#aaa', fontSize: '0.8rem', marginRight: '8px' }}
                >
                  ☁️ 未保存
                </span>
              )}

              <button onClick={pasteFromClipboard} title="貼り付け">📋</button>
              {uiVisibility.camera && <button onClick={() => fileInputRef.current.click()} title="画像追加">📷</button>}
              {uiVisibility.text && <button onClick={() => setShowTextModal(true)} title="テキスト">Aa</button>}
              {uiVisibility.search && <button onClick={() => setShowSearchModal(true)} title="検索">🔍</button>}
              {uiVisibility.edit && <button onClick={() => setEditMode(!editMode)} className={editMode ? 'active' : ''} title="選択モード">✅</button>}
              {uiVisibility.shuffle && <button onClick={shuffleItems} title="シャッフル">🎲</button>}
              {uiVisibility.cloud && <button onClick={saveToCloud} disabled={isSyncing || !userId || !syncPassword} title="クラウドに保存">📤</button>}
              {/* Spacer for safety */}
              <span style={{ width: '12px', display: 'inline-block' }}></span>
              {uiVisibility.cloud && <button onClick={loadFromCloud} disabled={isSyncing || !userId || !syncPassword} title="クラウドから読み込み">📥</button>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.gif"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </header>

          {/* Edit Mode Bar */}
          {editMode && (
            <div className="edit-mode-bar">
              <span>{selectedItems.length}個選択</span>
              <button onClick={togglePinSelectedItems} disabled={selectedItems.length === 0}>📌 固定/解除</button>
              <button onClick={openMoveModal} disabled={selectedItems.length === 0}>➡️ 移動</button>
              <button onClick={deleteSelectedItems} disabled={selectedItems.length === 0} className="btn-danger">🗑️ 削除</button>
              <button onClick={exitEditMode}>完了</button>
            </div>
          )}

          {/* Move Set Modal */}
          {showMoveSetModal && (
            <div className="modal-overlay" onClick={() => setShowMoveSetModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <h3>移動先のセットを選択</h3>
                <div className="set-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {collageSets.filter(s => s.id != currentSetId).map(s => (
                    <div
                      key={s.id}
                      onClick={() => setMoveTargetSetId(s.id)}
                      className={`dropdown-item ${moveTargetSetId === s.id ? 'active' : ''}`}
                    >
                      {s.name}
                    </div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button onClick={moveItemsToSet} disabled={!moveTargetSetId}>移動</button>
                  <button onClick={() => setShowMoveSetModal(false)} className="secondary">キャンセル</button>
                </div>
              </div>
            </div>
          )}

          {/* Main Canvas Area */}
          <div
            className="main-content"
            ref={mainContentRef}
            onTouchStart={handleMainTouchStart}
            onTouchMove={handleMainTouchMove}
            onTouchEnd={handleMainTouchEnd}
            style={{
              // transform: `translateX(${swipeOffset}px)`, // Disabled
              // transition: isSyncing ? 'none' : (swipeStartRef.current ? 'none' : 'transform 0.3s ease-out')
            }}
          >
            {isPulling && <div className="pull-indicator" style={{ opacity: 0.6, fontSize: '3rem' }}>🔀</div>}


            <div
              ref={canvasRef}
              className={`canvas ${isDragging ? 'dragging' : ''}`}
              style={{ width: canvasWidth, minHeight: canvasHeight, backgroundColor: bgColor }}
              onClick={() => setSelectedId(null)}
            >
              {items.length === 0 && (
                <div className="empty-hint">
                  画像を追加してください
                </div>
              )}
              {items.map((item, index) => {
                const scaledWidth = Math.floor((item.baseWidth || 100) * (item.scale || 1));
                const scaledHeight = Math.floor((item.baseHeight || 100) * (item.scale || 1));
                const isSelected = selectedId === item.id;
                const isDragOver = dragOverIndex === index;
                const isEditSelected = editMode && selectedItems.includes(item.id);

                return (
                  <div
                    key={item.id}
                    className={`item ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''} ${item.pinned ? 'pinned' : ''} ${isEditSelected ? 'edit-selected' : ''}`}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: scaledWidth,
                      height: scaledHeight,
                      border: item.link ? '2px solid cyan' : undefined
                    }}
                    draggable
                    onDragStart={(e) => handleItemDragStart(e, item, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDragEnd={handleItemDragEnd}
                    onClick={(e) => handleItemClick(e, item)}
                    onTouchStart={(e) => handleItemTouchStart(e, item)}
                    onTouchMove={handleItemTouchMove}
                    onTouchEnd={handleItemTouchEnd}
                    onTouchCancel={handleItemTouchEnd}
                    onMouseDown={(e) => handleItemMouseDown(e, item)}
                    onMouseUp={handleItemMouseUp}
                    onMouseLeave={handleItemMouseUp}
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

            {/* Floating Controls */}
            {selectedItem && (
              <div
                className="floating-controls"
                onMouseDown={() => setIsScaling(true)}
                onMouseUp={() => setIsScaling(false)}
                onTouchStart={() => setIsScaling(true)}
                onTouchEnd={() => setIsScaling(false)}
              >
                <div className="scale-controls">
                  <span>倍率</span>
                  <input
                    type="range"
                    min="0.3"
                    max="3"
                    step="0.1"
                    value={selectedItem.scale || 1}
                    onChange={e => updateScale(selectedId, +e.target.value)}
                  />
                  <span>{(selectedItem.scale || 1).toFixed(1)}x</span>
                </div>
                <button onClick={() => handleCopyImage(selectedItem.src)} className="copy-btn" title="画像をコピー" style={{ marginRight: '8px' }}>📋</button>
                <button onClick={() => deleteItem(selectedId)} className="delete-btn">×</button>
              </div>
            )}

            {/* Space for bottom bar */}
            <div style={{ height: '60px' }}></div>
          </div>

          {/* Bottom Bar - Persistent */}
          <div className="bottom-bar">
            <div className="set-selector-wrapper">
              <button className="set-selector-btn" onClick={() => setShowSetDropdown(!showSetDropdown)}>
                📁 {collageSets.find(s => s.id == currentSetId)?.name || '選択...'} ▼
              </button>
              {showSetDropdown && (
                <>
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }} onClick={() => setShowSetDropdown(false)} />
                  <div className="set-dropdown-menu" style={{ zIndex: 100 }}>
                    {/* Presets Section */}
                    {presets.length > 0 && (
                      <>
                        <div className="dropdown-header"><span>📚 プリセット</span></div>
                        <div className="dropdown-list" style={{ maxHeight: '150px' }}>
                          {presets.map(p => (
                            <div key={p.id} className="dropdown-item">
                              <span
                                onClick={() => loadPreset(p)}
                                style={{ flex: 1, cursor: 'pointer', color: '#ffd700' }} // Gold color
                              >
                                {p.name}
                              </span>
                              <button onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }} style={{ padding: '2px 6px', fontSize: '0.7rem' }}>🗑️</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }}></div>
                      </>
                    )}

                    <div className="dropdown-header">
                      <span>📁 コラージュセット</span>
                    </div>
                    {/* Inline rename */}
                    <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <input
                        type="text"
                        value={renameInput}
                        onChange={e => setRenameInput(e.target.value)}
                        onBlur={() => renameSet(renameInput)}
                        onKeyDown={e => e.key === 'Enter' && renameSet(renameInput)}
                        placeholder="セット名を変更"
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: 'none', fontSize: '0.9rem' }}
                      />
                    </div>
                    <div className="dropdown-list">
                      {collageSets.map((s, idx) => (
                        <div key={s.id} className={`dropdown-item ${s.id == currentSetId ? 'active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedMergeIds.includes(s.id)}
                            onClick={e => { e.stopPropagation(); toggleMergeSelect(s.id); }}
                            onChange={() => { }}
                            style={{ marginRight: '8px' }}
                          />
                          <span onClick={() => switchSet(s.id)} style={{ flex: 1, cursor: 'pointer' }}>{s.name}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {idx > 0 && (
                              <button onClick={(e) => { e.stopPropagation(); moveSet(idx, idx - 1); }} style={{ padding: '2px 6px', fontSize: '0.7rem' }}>↑</button>
                            )}
                            {idx < collageSets.length - 1 && (
                              <button onClick={(e) => { e.stopPropagation(); moveSet(idx, idx + 1); }} style={{ padding: '2px 6px', fontSize: '0.7rem' }}>↓</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedMergeIds.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={showMergedSets} className="secondary" style={{ flex: 2, borderRadius: 0 }}>
                          選択した {selectedMergeIds.length} つを表示
                        </button>
                        <button onClick={savePreset} className="secondary" style={{ flex: 1, borderRadius: 0, background: '#4a4a6a' }} title="プリセットとして保存">
                          💾
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
              <button className="add-set-btn" onClick={() => setShowNewSetModal(true)}>＋ 新規作成</button>
            </div>
          </div>
        </>
      )
      }

      {/* Modals */}
      {
        showNewSetModal && (
          <div className="modal-overlay" onClick={() => setShowNewSetModal(false)}>
            <div className="search-style-modal" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={newSetName}
                onChange={e => setNewSetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newSetName && createNewSet(newSetName)}
                placeholder="新しいセット名を入力"
                autoFocus
              />
              <button onClick={() => newSetName && createNewSet(newSetName)} disabled={!newSetName}>作成</button>
              <button onClick={() => setShowNewSetModal(false)} className="secondary">×</button>
            </div>
          </div>
        )
      }

      {
        showCropModal && (
          <>
            {cropHistory.length > 0 && (
              <button
                className="floating-prev-btn"
                onClick={openPrevCrop}
                title="前の画像"
              >↩️ 前へ</button>
            )}
            <button
              className="floating-next-btn"
              onMouseDown={startRandomLoop}
              onMouseUp={stopRandomLoop}
              onMouseLeave={stopRandomLoop}
              onTouchStart={(e) => { e.preventDefault(); startRandomLoop(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopRandomLoop(); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
              style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
              title="次の画像をランダム表示 (長押しで連続)"
            >🎲 次へ</button>
          </>
        )
      }

      {
        showCropModal && cropImage && (
          <div className="modal-overlay" onClick={closeCropModal}>
            <div className="crop-modal" onClick={e => e.stopPropagation()}>
              <button
                className="pin-btn"
                onClick={toggleCropItemPin}
                style={{ position: 'absolute', top: '-60px', left: '0', zIndex: 10, fontSize: '1.5rem', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}
                title="固定/解除"
              >
                {items.find(i => i.id === cropItemId)?.pinned ? '📌' : '⚪'}
              </button>
              <button className="close-btn" onClick={closeCropModal}>×</button>
              title="画像をコピー"
              style={{
                position: 'absolute', top: '8px', right: '60px',
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '50%',
                width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: 10, fontSize: '13px'
              }}
              >
              📋
            </button>
            {/* Link input removed */}
            <div className="crop-container" ref={cropCanvasRef}
              onMouseDown={handleCropStart} onMouseMove={handleCropMove} onMouseUp={handleCropEnd}
              onTouchStart={handleCropStart} onTouchMove={handleCropMove} onTouchEnd={handleCropEnd}
            >
              <img src={cropImage} alt="crop" draggable={false} style={{ transform: `translate(${cropTranslate.x}px, ${cropTranslate.y}px) scale(${cropScale})`, transformOrigin: 'center' }} />
              {cropLink && (
                <button
                  onClick={(e) => { e.stopPropagation(); openCropLink(); }}
                  style={{
                    position: 'absolute', bottom: '10px', right: '10px', zIndex: 20,
                    background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%',
                    width: '50px', height: '50px', fontSize: '1.3rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="リンクを開く"
                >
                  🔗
                </button>
              )}
              {cropStart && cropEnd && (
                <div className="crop-selection" style={{
                  left: Math.min(cropStart.x, cropEnd.x), top: Math.min(cropStart.y, cropEnd.y),
                  width: Math.abs(cropEnd.x - cropStart.x), height: Math.abs(cropEnd.y - cropStart.y)
                }}>
                  <div style={{ position: 'absolute', top: -10, left: -10, width: 20, height: 20, borderTop: '4px solid white', borderLeft: '4px solid white' }} />
                  <div style={{ position: 'absolute', top: -10, right: -10, width: 20, height: 20, borderTop: '4px solid white', borderRight: '4px solid white' }} />
                  <div style={{ position: 'absolute', bottom: -10, left: -10, width: 20, height: 20, borderBottom: '4px solid white', borderLeft: '4px solid white' }} />
                  <div style={{ position: 'absolute', bottom: -10, right: -10, width: 20, height: 20, borderBottom: '4px solid white', borderRight: '4px solid white' }} />
                </div>
              )}
            </div>
            <div className="crop-buttons">
              <button onClick={editCropLink} title="リンク設定">🔗</button>
              <button onClick={applyCrop} disabled={!cropStart || !cropEnd} title="適用" style={{ fontSize: '1.5rem', padding: '8px 24px' }}>✅</button>
              <button onClick={copyCrop} disabled={!cropStart || !cropEnd} title="コピー">📋</button>
              <button onClick={deleteCurrentCropItem} className="btn-danger" title="削除">🗑️</button>
              <button onClick={moveCurrentCropItem} className="secondary" title="移動">➡️</button>
            </div>
          </div>
          </div>
  )
}

{
  showTextModal && (
    <div className="modal-overlay modal-overlay-top" onClick={() => setShowTextModal(false)}>
      <div className="modal modal-top" onClick={e => e.stopPropagation()}>
        {/* No Close Button */}
        <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="テキスト..." autoFocus />
        <div className="modal-row">
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} />
          <input type="range" min="10" max="60" value={textSize} onChange={e => setTextSize(+e.target.value)} />
        </div>
        <button onClick={addText}>追加</button>
      </div>
    </div>
  )
}

{
  showSearchModal && (
    <div className="modal-overlay modal-overlay-top" onClick={() => setShowSearchModal(false)}>
      <div className="modal modal-top" onClick={e => e.stopPropagation()}>
        {/* No Close Button */}
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="画像検索..." autoFocus />
        <div className="search-buttons">
          <button onClick={searchGoogle}>🔍 Google</button>
          <button onClick={searchDuckDuckGo}>🦆 DuckDuckGo</button>
        </div>
        <p className="search-note">長押しで保存して追加してください</p>
      </div>
    </div>
  )
}

{/* PC Zoom Slider */ }
{
  !('ontouchstart' in window) && (
    <div className="zoom-slider-container">
      <span style={{ fontSize: '1.2rem' }}>🔍</span>
      <input
        type="range"
        min="50"
        max="300"
        value={baseSize}
        onChange={e => {
          const newSize = +e.target.value;
          setBaseSize(newSize);
          setItems(prev => packItemsTight(prev, canvasWidth, newSize));
        }}
      />
    </div>
  )
}
    </div >
  );
}


// Last updated: 2026-01-14 08:51
// Helper Component for Swipe Preview
export default App;
