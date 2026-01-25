export const packItemsTight = (itemList, containerWidth, targetRowHeight = 200) => {
    const gutter = 0; // 隙間ゼロ！！！！！！！！
    const packed = [];
    let currentY = 0;

    let currentRow = [];
    let currentRowAspectSum = 0;

    for (const item of itemList) {
        const ratio = item.aspect_ratio || (item.width / item.height) || 1;
        currentRow.push({ ...item, ratio });
        currentRowAspectSum += ratio;

        const totalRelativeWidth = currentRowAspectSum * targetRowHeight;

        if (totalRelativeWidth >= containerWidth) {
            const rowHeight = containerWidth / currentRowAspectSum;

            let x = 0;
            for (let i = 0; i < currentRow.length; i++) {
                const rowItem = currentRow[i];
                let itemWidth = rowHeight * rowItem.ratio;

                // 行の最後の一枚を右端に吸着させる（隙間ゼロの肝）
                // if (i === currentRow.length - 1) {
                //    itemWidth = containerWidth - x;
                // }

                packed.push({
                    ...rowItem,
                    x: x,
                    y: currentY,
                    width: itemWidth,
                    height: rowHeight,
                    is_in_last_row: false
                });

                x += itemWidth;
            }

            currentY += rowHeight;
            currentRow = [];
            currentRowAspectSum = 0;
        }
    }

    // 最終行（Googleフォト風にジャスティファイせず左寄せ）
    if (currentRow.length > 0) {
        let x = 0;
        for (const rowItem of currentRow) {
            const itemWidth = targetRowHeight * rowItem.ratio;
            packed.push({
                ...rowItem,
                x: x,
                y: currentY,
                width: itemWidth,
                height: targetRowHeight,
                is_in_last_row: true
            });
            x += itemWidth;
        }
    }

    return packed;
};
