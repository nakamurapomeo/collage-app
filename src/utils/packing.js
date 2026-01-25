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

    // Optimized finalizeRow for Justified Layout
    const finalizeRow = (items, aspectSum, y, isLastRow = false) => {
        if (items.length === 0) return 0;
        let rowHeight = containerWidth / aspectSum;

        // Last row handling: if it's too tall (few items), cap it at targetRowHeight
        if (isLastRow && rowHeight > targetRowHeight * 1.5) {
            rowHeight = targetRowHeight;
            // Align left effectively (width < containerWidth)
        }

        let x = 0;
        for (const item of items) {
            const aspectRatio = item.aspect_ratio || (item.width / item.height) || 1;
            // Calculate precise dimensions
            const itemWidth = rowHeight * aspectRatio;
            const itemHeight = rowHeight;

            packed.push({
                ...item,
                x: x,
                y: y,
                width: itemWidth,
                height: itemHeight,
            });
            x += itemWidth;
        }
        return rowHeight;
    };

    // Main packing loop with lookahead logic
    let buffer = [];
    let bufferAspect = 0;

    for (const item of itemList) {
        const aspectRatio = item.aspect_ratio || (item.width / item.height) || 1;

        buffer.push(item);
        bufferAspect += aspectRatio;

        const currentHeight = containerWidth / bufferAspect;

        // If including this item makes height smaller than target, we have a decision point.
        if (currentHeight < targetRowHeight) {
            // Compare current state (with new item) vs previous state (without new item)
            // We want to be closer to targetRowHeight.

            const prevAspect = bufferAspect - aspectRatio;
            const prevHeight = containerWidth / prevAspect;

            if (Math.abs(currentHeight - targetRowHeight) > Math.abs(prevHeight - targetRowHeight)) {
                // Previous state was better (closer to target).
                // So we should have broken the line BEFORE this item.
                const itemToDefer = buffer.pop();

                const rowHeight = finalizeRow(buffer, prevAspect, currentY);
                currentY += rowHeight;

                // Start new row with the deferred item
                buffer = [itemToDefer];
                bufferAspect = aspectRatio;
            } else {
                // Current state is better (even though it's smaller, it's closer to target than the previous huge height).
                // Or maybe it's just accepted. 
                // Since adding MORE items will only make it smaller (further from target), 
                // we should finalize NOW. We've found the local optimum.

                const rowHeight = finalizeRow(buffer, bufferAspect, currentY);
                currentY += rowHeight;
                buffer = [];
                bufferAspect = 0;
            }
        }
    }

    // Finalize remaining items (last row)
    if (buffer.length > 0) {
        // Last row special flag
        const rowHeight = finalizeRow(buffer, bufferAspect, currentY, true);
        currentY += rowHeight;
    }

    return packed;
};
