export function measureText(text, fontSize, fontFamily = 'sans-serif') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${fontSize}px ${fontFamily}`;
    const metrics = context.measureText(text);

    // Use advanced metrics for tight bounding box
    // Fallback to width/fontSize if advanced metrics not available (older browsers)
    const ascent = metrics.actualBoundingBoxAscent ?? (fontSize * 0.8);
    const descent = metrics.actualBoundingBoxDescent ?? (fontSize * 0.2);
    const left = metrics.actualBoundingBoxLeft ?? 0;
    const right = metrics.actualBoundingBoxRight ?? metrics.width;

    // Calculate tight width and height
    // We add a tiny buffer (2px total) to ensure no pixel clipping at edges
    const width = Math.abs(left) + Math.abs(right) + 2;
    const height = ascent + descent + 2;

    return {
        width,
        height,
        ascent,
        left // Needed to offset the render position
    };
}
