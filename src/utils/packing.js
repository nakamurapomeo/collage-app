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

    let currentRow = [];
    let currentRowAspect = 0;

    for (const item of itemList) {
        const ratio = item.aspect_ratio || (item.width / item.height) || 1;
        currentRow.push({ ...item, ratio });
        currentRowAspect += ratio;

        // Calculate potential height if we were to fit this row to the container width
        const potentialHeight = containerWidth / currentRowAspect;

        // If the height drops below targetRowHeight, this row is "full enough"
        if (potentialHeight <= targetRowHeight) {
            const rowHeight = potentialHeight;
            let x = 0;

            for (let i = 0; i < currentRow.length; i++) {
                const rowItem = currentRow[i];
                let itemWidth = rowHeight * rowItem.ratio;

                // Snap last item to right edge to prevent 1px black gaps
                if (i === currentRow.length - 1) {
                    itemWidth = containerWidth - x;
                }

                packed.push({
                    ...rowItem,
                    x: x,
                    y: currentY,
                    width: itemWidth,
                    height: rowHeight
                });
                x += itemWidth;
            }

            currentY += rowHeight;
            currentRow = [];
            currentRowAspect = 0;
        }
    }

    // Finalize the last row (Left aligned, using targetRowHeight)
    if (currentRow.length > 0) {
        let x = 0;
        for (const rowItem of currentRow) {
            const itemWidth = targetRowHeight * rowItem.ratio;
            packed.push({
                ...rowItem,
                x: x,
                y: currentY,
                width: itemWidth,
                height: targetRowHeight
            });
            x += itemWidth;
        }
    }

    return packed;
};
