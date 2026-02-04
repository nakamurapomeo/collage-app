export async function textToImageBlob(text, color, inputFontSize = 64) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Config
    const fontSize = 100; // Generate at high resolution
    const lineHeight = 1.2;
    const fontFamily = 'sans-serif';
    const padding = 20; // Temporary padding for rendering

    // Split lines
    const lines = text.split('\n');

    // 1. Measure text to set initial canvas size
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    let maxWidth = 0;
    lines.forEach(line => {
        const metrics = ctx.measureText(line);
        if (metrics.width > maxWidth) maxWidth = metrics.width;
    });

    // Resize canvas safely
    const totalHeight = lines.length * (fontSize * lineHeight);
    canvas.width = Math.ceil(maxWidth + padding * 2);
    canvas.height = Math.ceil(totalHeight + padding * 2);

    // 2. Draw Text
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    lines.forEach((line, i) => {
        const y = padding + (i * fontSize * lineHeight);
        // Draw fill
        ctx.fillText(line, padding, y);
    });

    // 3. Auto-Crop (Scan for bounding box)
    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    let found = false;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const alpha = data[(y * w + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) {
        // Return empty 1x1 if nothing drawn
        return new Promise(resolve => canvas.toBlob(resolve));
    }

    // Add a tiny padding to the crop (optional, e.g. 1px)
    const cropMargin = 2;
    minX = Math.max(0, minX - cropMargin);
    minY = Math.max(0, minY - cropMargin);
    maxX = Math.min(w, maxX + cropMargin);
    maxY = Math.min(h, maxY + cropMargin);

    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;

    // 4. Create Cropped Canvas
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    const croppedCtx = croppedCanvas.getContext('2d');
    croppedCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    // 5. Convert to Blob
    return new Promise(resolve => {
        croppedCanvas.toBlob(blob => {
            resolve(blob);
        }, 'image/png');
    });
}
