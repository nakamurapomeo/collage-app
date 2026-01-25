import React, { useState, useEffect, useRef } from 'react';

export function PullToRefresh({ onRefresh, children }) {
    const [startY, setStartY] = useState(0);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const containerRef = useRef(null);

    // Threshold to trigger refresh (px)
    const THRESHOLD = 50; // More sensitive
    const MAX_PULL = 100;

    const handleTouchStart = (e) => {
        // Only trigger if we are at the top of the scroll
        if (containerRef.current && containerRef.current.scrollTop === 0) {
            setStartY(e.touches[0].clientY);
        } else {
            setStartY(0);
        }
    };

    const handleTouchMove = (e) => {
        if (!startY) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        // If pulling down and at top
        if (diff > 0 && containerRef.current && containerRef.current.scrollTop <= 0) {
            // Add resistance
            const newDistance = Math.min(diff * 0.5, MAX_PULL);
            setPullDistance(newDistance);

            // Prevent default scroll behavior if we are effectively pulling to refresh
            // But be careful not to block normal scrolling up
            if (e.cancelable && diff > 10) {
                // e.preventDefault(); // Chrome treats touchmove as passive by default, so this might warn.
                // Rely on CSS overscroll-behavior: none for body/container
            }
        } else {
            setPullDistance(0);
        }
    };

    const handleTouchEnd = async () => {
        if (!startY) return;

        if (pullDistance > THRESHOLD) {
            setRefreshing(true);
            setPullDistance(60); // Hold position
            await onRefresh();
            setRefreshing(false);
        }

        setPullDistance(0);
        setStartY(0);
    };

    return (
        <div
            ref={containerRef}
            style={{
                height: '100%',
                overflowY: 'auto',
                position: 'relative',
                overscrollBehaviorY: 'contain' // Prevent browser refresh
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Refresh Indicator */}
            <div style={{
                height: pullDistance,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: refreshing ? 'height 0.2s' : 'height 0.2s ease-out',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 10,
                pointerEvents: 'none'
            }}>
                <div style={{
                    transform: `rotate(${pullDistance * 2}deg)`,
                    opacity: Math.min(pullDistance / THRESHOLD, 1),
                    fontSize: '2rem'
                }}>
                    {refreshing ? '🎲' : '🎲'}
                </div>
            </div>

            {/* Content */}
            <div style={{
                transition: 'transform 0.2s ease-out',
                transform: `translateY(${pullDistance}px)`
            }}>
                {children}
            </div>
        </div>
    );
}
