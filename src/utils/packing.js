export const packItemsTight = (itemList, containerWidth, targetRowHeight = 180) => {
    const gutter = 4; // 仕様書に基づき 4px に設定
    const packed = [];
    let currentY = 0;

    let currentRow = [];
    let currentRowAspectSum = 0;

    for (const item of itemList) {
        const ratio = item.aspect_ratio || (item.width / item.height) || 1;
        currentRow.push({ ...item, ratio });
        currentRowAspectSum += ratio;

        // 仕様書ステップ2&3: 各画像をtargetRowHeightに合わせたときの幅を計算し、コンテナ幅と比較
        const totalGuttersInRow = (currentRow.length - 1) * gutter;
        const totalRelativeWidth = currentRowAspectSum * targetRowHeight + totalGuttersInRow;

        if (totalRelativeWidth >= containerWidth) {
            // 仕様書ステップ4: 行全体の合計幅がコンテナ幅に一致するように高さをスケール調整
            const rowHeight = (containerWidth - totalGuttersInRow) / currentRowAspectSum;

            let x = 0;
            for (let i = 0; i < currentRow.length; i++) {
                const rowItem = currentRow[i];
                const itemWidth = rowHeight * rowItem.ratio;

                packed.push({
                    ...rowItem,
                    x: x,
                    y: currentY,
                    width: itemWidth,
                    height: rowHeight,
                    is_in_last_row: false
                });

                x += itemWidth + gutter;
            }

            currentY += rowHeight + gutter;
            currentRow = [];
            currentRowAspectSum = 0;
        }
    }

    // 最終行: F-Stopに則り、ジャスティファイせず targetRowHeight を維持して左寄せ
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
            x += itemWidth + gutter;
        }
    }

    return packed;
};
