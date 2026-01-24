export const packItemsTight = (itemList, containerWidth, targetRowHeight = 100) => {
    // Separate pinned and unpinned items
    const pinned = itemList.filter(i => i.pinned);
    const unpinned = itemList.filter(i => !i.pinned);

    // Pinned items stay where they are (or should they be packed separately? original code packed ALL but usually pinned means fixed position)
    // The original code passed EVERYTHING into the loop, implying "pinned" might just be a visual state OR the user expects them to stay.
    // Looking at the legacy code:
    /*
        const pinned = updated.filter(i => i.pinned);
        const unpinned = updated.filter(i => !i.pinned);
        return packItemsTight([...pinned, ...unpinned], canvasWidth);
    */
    // It seems it packs pinned items FIRST, then unpinned items.
    // So the order in the array determines the packing order.

    // We will follow the same logic: Input list is already sorted/filtered if needed.

    const packed = [];
    let currentY = 0;
    let rowItems = [];
    let rowAspectSum = 0;

    const finalizeRow = (items, aspectSum, y, isLastRow = false) => {
        if (items.length === 0) return 0;
        let rowHeight = containerWidth / aspectSum;
        if (isLastRow && rowHeight > targetRowHeight * 1.5) {
            rowHeight = targetRowHeight;
        }
        let x = 0;
        for (const item of items) {
            const aspectRatio = item.aspect_ratio || ((item.width || 100) / (item.height || 100));
            // Recalculate dimensions based on row height
            const itemWidth = Math.floor(rowHeight * aspectRatio);
            const itemHeight = Math.floor(rowHeight);

            packed.push({
                ...item,
                x: Math.floor(x),
                y: Math.floor(y),
                // We update the dimensions to fit the packing
                width: itemWidth,
                height: itemHeight,
                // We might store 'base' dimensions if we want to retain original quality scale
                // but for this app, width/height updates are fine.
            });
            x += itemWidth;
        }
        return Math.floor(rowHeight);
    };

    for (const item of itemList) {
        const aspectRatio = item.aspect_ratio || ((item.width || 100) / (item.height || 100));
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
};
