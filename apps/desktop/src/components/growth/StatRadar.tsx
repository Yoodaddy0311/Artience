import React from 'react';
import type { AgentStats } from '../../types/growth';

interface StatRadarProps {
    readonly stats: AgentStats;
    readonly size?: number;
    readonly showLabels?: boolean;
}

const STAT_KEYS: (keyof AgentStats)[] = [
    'coding',
    'analysis',
    'speed',
    'accuracy',
    'creativity',
    'teamwork',
];

const STAT_LABELS: Record<keyof AgentStats, string> = {
    coding: 'Coding',
    analysis: 'Analysis',
    speed: 'Speed',
    accuracy: 'Accuracy',
    creativity: 'Creativity',
    teamwork: 'Teamwork',
};

function getHexagonPoints(cx: number, cy: number, radius: number): string {
    return STAT_KEYS.map((_, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        return `${x},${y}`;
    }).join(' ');
}

function getStatPoints(
    cx: number,
    cy: number,
    radius: number,
    stats: AgentStats,
    maxStat: number,
): string {
    return STAT_KEYS.map((key, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const value = Math.min(stats[key], maxStat) / maxStat;
        const r = radius * value;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x},${y}`;
    }).join(' ');
}

function getLabelPosition(
    cx: number,
    cy: number,
    radius: number,
    index: number,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
    const angle = (Math.PI / 3) * index - Math.PI / 2;
    const x = cx + (radius + 16) * Math.cos(angle);
    const y = cy + (radius + 16) * Math.sin(angle);
    const anchor =
        Math.abs(Math.cos(angle)) < 0.1
            ? 'middle'
            : Math.cos(angle) > 0
              ? 'start'
              : 'end';
    return { x, y, anchor };
}

export const StatRadar: React.FC<StatRadarProps> = ({
    stats,
    size = 200,
    showLabels = true,
}) => {
    const padding = showLabels ? 40 : 10;
    const svgSize = size + padding * 2;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const maxRadius = size / 2;
    const maxStat = 100;

    const gridLevels = [0.33, 0.66, 1.0];

    return (
        <div
            className="inline-block border-2 border-black rounded-xl bg-white shadow-[4px_4px_0_0_#000] p-2"
            role="img"
            aria-label={`Stat radar: ${STAT_KEYS.map((k) => `${STAT_LABELS[k]} ${stats[k]}`).join(', ')}`}
        >
            <svg
                width={svgSize}
                height={svgSize}
                viewBox={`0 0 ${svgSize} ${svgSize}`}
            >
                {/* Grid hexagons */}
                {gridLevels.map((level) => (
                    <polygon
                        key={level}
                        points={getHexagonPoints(cx, cy, maxRadius * level)}
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="1.5"
                    />
                ))}

                {/* Axis lines */}
                {STAT_KEYS.map((_, i) => {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const x2 = cx + maxRadius * Math.cos(angle);
                    const y2 = cy + maxRadius * Math.sin(angle);
                    return (
                        <line
                            key={i}
                            x1={cx}
                            y1={cy}
                            x2={x2}
                            y2={y2}
                            stroke="#e5e7eb"
                            strokeWidth="1"
                        />
                    );
                })}

                {/* Stat polygon */}
                <polygon
                    points={getStatPoints(cx, cy, maxRadius, stats, maxStat)}
                    fill="rgba(59, 130, 246, 0.25)"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                />

                {/* Stat dots */}
                {STAT_KEYS.map((key, i) => {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const value = Math.min(stats[key], maxStat) / maxStat;
                    const r = maxRadius * value;
                    const x = cx + r * Math.cos(angle);
                    const y = cy + r * Math.sin(angle);
                    return (
                        <circle
                            key={key}
                            cx={x}
                            cy={y}
                            r="4"
                            fill="#3b82f6"
                            stroke="#000"
                            strokeWidth="1.5"
                        />
                    );
                })}

                {/* Labels */}
                {showLabels &&
                    STAT_KEYS.map((key, i) => {
                        const pos = getLabelPosition(cx, cy, maxRadius, i);
                        return (
                            <text
                                key={key}
                                x={pos.x}
                                y={pos.y}
                                textAnchor={pos.anchor}
                                dominantBaseline="central"
                                className="fill-black text-[11px] font-bold"
                                style={{
                                    fontFamily: "'Pretendard', sans-serif",
                                }}
                            >
                                {STAT_LABELS[key]} {stats[key]}
                            </text>
                        );
                    })}
            </svg>
        </div>
    );
};
