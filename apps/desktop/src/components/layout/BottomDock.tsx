import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Teammate } from './MainLayout';
import { assetPath } from '../../lib/assetPath';

export const BottomDock: React.FC<{ team: Teammate[], selectedId: string | null, onSelect: (id: string | null) => void }> = ({ team, selectedId, onSelect }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }, []);

    useEffect(() => {
        checkScroll();
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', checkScroll, { passive: true });
        const observer = new ResizeObserver(checkScroll);
        observer.observe(el);
        return () => {
            el.removeEventListener('scroll', checkScroll);
            observer.disconnect();
        };
    }, [checkScroll, team.length]);

    const scroll = (direction: 'left' | 'right') => {
        const el = scrollRef.current;
        if (!el) return;
        const scrollAmount = 240;
        el.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth',
        });
    };

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-[90vw]">
            <div className="bg-white px-3 py-3 rounded-lg shadow-[4px_4px_0_0_#000] border-2 border-black flex items-center gap-2">
                {/* Left Arrow */}
                {canScrollLeft && (
                    <button
                        onClick={() => scroll('left')}
                        aria-label="Scroll agents left"
                        className="flex-shrink-0 w-9 h-9 flex items-center justify-center border-2 border-black rounded-lg bg-white hover:bg-gray-100 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                        <ChevronLeft className="w-5 h-5 text-black" strokeWidth={3} />
                    </button>
                )}

                {/* Scrollable Agent Container */}
                <div
                    ref={scrollRef}
                    className="flex items-center gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {team.map(agent => {
                        const isSelected = agent.id === selectedId;
                        return (
                            <button
                                key={agent.id}
                                onClick={() => onSelect(isSelected ? null : agent.id)}
                                aria-label={`${agent.name} (${agent.role}), ${agent.status === 'working' ? 'working' : 'resting'}`}
                                aria-pressed={isSelected}
                                className={`relative group transition-transform snap-start flex-shrink-0 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 rounded-lg ${isSelected ? '-translate-y-3' : 'hover:-translate-y-1'}`}
                            >
                                <img
                                    src={assetPath(agent.avatarUrl)}
                                    alt={agent.name}
                                    className={`w-14 h-14 rounded-lg border-2 border-black transition-all ${isSelected
                                        ? 'shadow-[3px_3px_0_0_#000] bg-yellow-200'
                                        : 'bg-white shadow-[2px_2px_0_0_#000]'
                                        }`}
                                />
                                {/* Status Dot */}
                                <div
                                    className={`absolute -top-1 -right-1 w-4 h-4 border-2 border-black rounded-full ${agent.status === 'working' ? 'bg-green-400' : 'bg-amber-300'}`}
                                    aria-hidden="true"
                                />

                                {/* Tooltip */}
                                <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-black text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border-2 border-black shadow-[2px_2px_0_0_#000]">
                                    {agent.name} ({agent.role})
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Right Arrow */}
                {canScrollRight && (
                    <button
                        onClick={() => scroll('right')}
                        aria-label="Scroll agents right"
                        className="flex-shrink-0 w-9 h-9 flex items-center justify-center border-2 border-black rounded-lg bg-white hover:bg-gray-100 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                        <ChevronRight className="w-5 h-5 text-black" strokeWidth={3} />
                    </button>
                )}
            </div>
        </div>
    );
};
