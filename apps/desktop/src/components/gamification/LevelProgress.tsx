import React from "react"

export function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(" ");
}

// Level titles
const LEVEL_TITLES: Record<number, string> = {
    1: "입문자",
    2: "학습자",
    3: "수험생",
    4: "우등생",
    5: "전문가",
    6: "마스터",
    7: "그랜드마스터",
    8: "레전드",
    9: "챔피언",
    10: "엘리트",
    12: "알 수 없음",
}

// Level colors (Neo-Brutalist Style)
const LEVEL_COLORS: Record<number, { bg: string; text: string; segment: string }> = {
    1: { bg: "bg-gray-100", text: "text-gray-800", segment: "bg-gray-500" },
    2: { bg: "bg-[#bbf7d0]", text: "text-green-800", segment: "bg-[#22c55e]" },
    3: { bg: "bg-[#bfdbfe]", text: "text-blue-800", segment: "bg-[#3b82f6]" },
    4: { bg: "bg-[#e0e7ff]", text: "text-indigo-800", segment: "bg-[#6366f1]" },
    5: { bg: "bg-[#f3e8ff]", text: "text-purple-800", segment: "bg-[#a855f7]" },
    6: { bg: "bg-[#fce7f3]", text: "text-pink-800", segment: "bg-[#ec4899]" },
    7: { bg: "bg-[#fee2e2]", text: "text-red-800", segment: "bg-[#ef4444]" },
    8: { bg: "bg-[#ffedd5]", text: "text-orange-800", segment: "bg-[#f97316]" },
    9: { bg: "bg-[#fef3c7]", text: "text-amber-800", segment: "bg-[#f59e0b]" },
    10: { bg: "bg-[#fef08a]", text: "text-yellow-800", segment: "bg-[#eab308]" },
    12: { bg: "bg-gray-100", text: "text-[#18181b]", segment: "bg-[#64748b]" }, // Match the screenshot
}

interface LevelProgressProps {
    level: number
    levelTitle?: string
    levelProgress: number
    pointsToNextLevel: number
    totalPoints: number
    className?: string
    size?: "sm" | "md" | "lg"
    showDetails?: boolean
}

export function LevelProgress({
    level,
    levelTitle,
    levelProgress,
    pointsToNextLevel,
    totalPoints,
    className,
    size = "md",
    showDetails = true,
}: LevelProgressProps) {
    const title = levelTitle || LEVEL_TITLES[level] || "알 수 없음"
    const colors = LEVEL_COLORS[level] || LEVEL_COLORS[12]
    const totalForLevel = levelProgress + pointsToNextLevel
    const progressPercent = totalForLevel > 0 ? (levelProgress / totalForLevel) * 100 : 0

    const sizeClasses = {
        sm: {
            container: "gap-2",
            badge: "text-xs px-2 py-0.5",
            level: "text-sm",
            barContainer: "h-3",
            segments: 10,
            details: "text-xs",
        },
        md: {
            container: "gap-3",
            badge: "text-sm px-3 py-1",
            level: "text-base",
            barContainer: "h-5",
            segments: 15,
            details: "text-sm",
        },
        lg: {
            container: "gap-4",
            badge: "text-base px-4 py-1.5",
            level: "text-lg",
            barContainer: "h-8",
            segments: 20,
            details: "text-base",
        },
    }

    const classes = sizeClasses[size]
    const activeSegments = Math.round((progressPercent / 100) * classes.segments)

    return (
        <div className={cn("flex flex-col group", classes.container, className)}>
            <style>{`
        @keyframes shimmerLevel {
            0% { transform: translateX(-150%) skewX(-15deg); }
            100% { transform: translateX(200%) skewX(-15deg); }
        }
        .level-progress-shimmer {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 50%;
            background: linear-gradient(
                to right,
                rgba(255,255,255,0) 0%,
                rgba(255,255,255,0.4) 50%,
                rgba(255,255,255,0) 100%
            );
            animation: shimmerLevel 2.5s infinite;
            pointer-events: none;
            z-index: 10;
        }
      `}</style>

            {/* Level Badge and Title */}
            <div className="flex items-center justify-between pointer-events-auto">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "rounded-lg font-black border-2 border-black",
                            classes.badge,
                            colors.bg,
                            colors.text,
                            "shadow-[2px_2px_0px_#18181b]"
                        )}
                    >
                        Lv.{level}
                    </span>
                    <span className={cn("font-black tracking-tight", classes.level)} style={{ WebkitTextStroke: "0.2px #18181b" }}>{title}</span>
                </div>

                {showDetails && (
                    <span className={cn("font-bold tabular-nums text-gray-500", classes.details)}>
                        총 {totalPoints.toLocaleString()}pt
                    </span>
                )}
            </div>

            {/* Progress Bar (Neo-Brutalist Segmented) */}
            <div className="space-y-1.5 pointer-events-auto">
                <div
                    className={cn(
                        "w-full bg-white border-[3px] border-black rounded-lg flex overflow-hidden relative shadow-[3px_3px_0px_#18181b]",
                        classes.barContainer
                    )}
                >
                    {Array.from({ length: classes.segments }).map((_, i) => {
                        const isActive = i < activeSegments;
                        return (
                            <div
                                key={i}
                                className={cn(
                                    "flex-1 border-r border-black/20 last:border-0 transition-colors duration-300",
                                    isActive ? colors.segment : "bg-transparent"
                                )}
                            />
                        )
                    })}

                    {/* Shimmer Effect over active parts */}
                    {activeSegments > 0 && <div className="level-progress-shimmer" />}
                </div>

                {showDetails && (
                    <div className="flex justify-between mt-2">
                        <span className={cn("font-bold text-[#475569]", classes.details)}>
                            EXP {levelProgress.toLocaleString()} / {totalForLevel.toLocaleString()}
                        </span>
                        <span className={cn("font-bold text-black", classes.details)}>
                            다음 레벨까지 {pointsToNextLevel.toLocaleString()}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
