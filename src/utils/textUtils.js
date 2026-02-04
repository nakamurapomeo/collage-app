export function measureText(text, fontSize, fontFamily = 'sans-serif') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${fontSize}px ${fontFamily}`;
    const metrics = context.measureText(text);
    return {
        width: metrics.width,
        // Using a rough multiplier for height as exact bounding box can be tricky with different browsers/fonts
        // 1.2 is a standard comfortable line-height, but for "tight" fit 1.1 might be better.
        // We will coordinate this with the CSS line-height.
        height: fontSize * 1.1
    };
}
