import { useRef, useState, useEffect } from 'react';
import { TimelineLayout, TimelineBar } from '../../services/TimelineService';

interface TimelineArrowsProps {
    layout: TimelineLayout;
}

const BAR_HEIGHT = 32;
const BAR_TOP_MARGIN = 10;
const BAR_GAP = 8;
const ARROW_COLOR = '#9ca3af';

export const TimelineArrows = ({ layout }: TimelineArrowsProps) => {
    const containerRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // 1. Calculate absolute positions for all bars
    const barPositions = new Map<string, { x: number; y: number; w: number; h: number }>();

    let currentY = 0;
    layout.rows.forEach(row => {
        row.bars.forEach(bar => {
            // TaskBar logic: top = marginTop + bar.laneIndex * (height + gap)
            const barTop = currentY + BAR_TOP_MARGIN + bar.laneIndex * (BAR_HEIGHT + BAR_GAP);

            // Calculate X and Width in pixels
            // bar.leftPct is percentage
            const x = (bar.leftPct / 100) * width;
            const w = (bar.widthPct / 100) * width;

            barPositions.set(bar.bar_key, {
                x,
                y: barTop,
                w,
                h: BAR_HEIGHT
            });
        });
        currentY += row.height;
    });

    // 2. Generate paths for dependencies
    const renderArrows = () => {
        const paths: JSX.Element[] = [];

        layout.rows.forEach(row => {
            row.bars.forEach(bar => {
                if (!bar.dependencies || bar.dependencies.length === 0) return;

                const targetPos = barPositions.get(bar.bar_key);
                if (!targetPos) return;

                const targetX = targetPos.x;
                const targetY = targetPos.y + targetPos.h / 2;

                bar.dependencies.forEach(depKey => {
                    const sourcePos = barPositions.get(depKey);
                    if (!sourcePos) return;

                    const sourceX = sourcePos.x + sourcePos.w;
                    const sourceY = sourcePos.y + sourcePos.h / 2;

                    // Draw curve
                    // M sourceX sourceY
                    // C c1x c1y, c2x c2y, targetX targetY

                    const curvature = 20;
                    const c1x = sourceX + curvature;
                    const c1y = sourceY;
                    const c2x = targetX - curvature;
                    const c2y = targetY;

                    const d = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;

                    paths.push(
                        <path
                            key={`${depKey}->${bar.bar_key}`}
                            d={d}
                            stroke={ARROW_COLOR}
                            strokeWidth="1.5"
                            fill="none"
                            markerEnd="url(#arrowhead)"
                        />
                    );
                });
            });
        });

        return paths;
    };

    return (
        <svg
            ref={containerRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
        >
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill={ARROW_COLOR} />
                </marker>
            </defs>
            {width > 0 && renderArrows()}
        </svg>
    );
};
