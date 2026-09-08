'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { IconClock, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { useIsMobile } from '@/app/utils/mobile';

interface TimePickerProps {
    value: string; // "HH:MM"
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')); // 00, 05, 10, ... 55

type Segment = 'hour' | 'minute';

export default function TimePicker({ value, onChange, disabled, className = '' }: TimePickerProps) {
    const isMobile = useIsMobile();
    const [open, setOpen] = useState(false);
    const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hourColRef = useRef<HTMLDivElement>(null);
    const minuteColRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLDivElement>(null);
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [hours, minutes] = value.split(':');
    const selectedHour = hours || '09';
    const selectedMinute = minutes || '00';

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    // Scroll to selected values when opening
    useEffect(() => {
        if (!open) return;
        const scrollSelectedIntoView = (col: React.RefObject<HTMLDivElement | null>, val: string) => {
            if (!col.current) return;
            const el = col.current.querySelector(`[data-value="${val}"]`) as HTMLElement | null;
            if (el) {
                el.scrollIntoView({ block: 'center' });
            }
        };
        requestAnimationFrame(() => {
            scrollSelectedIntoView(hourColRef, selectedHour);
            scrollSelectedIntoView(minuteColRef, selectedMinute);
        });
    }, [open, selectedHour, selectedMinute]);

    // Attach non-passive wheel listeners so preventDefault works (React onWheel is passive)
    useEffect(() => {
        if (!open) return;
        const cols = [hourColRef.current, minuteColRef.current].filter(Boolean) as HTMLDivElement[];
        const handlers: ((e: WheelEvent) => void)[] = [];
        for (const col of cols) {
            const handler = (e: WheelEvent) => {
                e.preventDefault();
                col.scrollTop += e.deltaY;
            };
            col.addEventListener('wheel', handler, { passive: false });
            handlers.push(handler);
        }
        return () => {
            for (let i = 0; i < cols.length; i++) {
                cols[i].removeEventListener('wheel', handlers[i]);
            }
        };
    }, [open]);

    const handleHourSelect = useCallback(
        (h: string) => {
            onChange(`${h}:${selectedMinute}`);
        },
        [onChange, selectedMinute]
    );

    const handleMinuteSelect = useCallback(
        (m: string) => {
            onChange(`${selectedHour}:${m}`);
        },
        [onChange, selectedHour]
    );

    const scrollHourBy = (delta: number) => {
        const idx = HOURS.indexOf(selectedHour);
        const next = HOURS[(idx + delta + 24) % 24];
        handleHourSelect(next);
    };

    const scrollMinuteBy = (delta: number) => {
        const idx = MINUTES.indexOf(selectedMinute);
        const next = MINUTES[(idx + delta + 12) % 12];
        handleMinuteSelect(next);
    };

    // Keyboard navigation — native input-like behavior
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeSegment === 'hour') scrollHourBy(-1);
            else if (activeSegment === 'minute') scrollMinuteBy(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeSegment === 'hour') scrollHourBy(1);
            else if (activeSegment === 'minute') scrollMinuteBy(1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setActiveSegment('hour');
        } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
            e.preventDefault();
            setActiveSegment('minute');
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setActiveSegment(null);
            inputRef.current?.blur();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open) {
                setOpen(false);
            } else {
                setOpen(true);
                setActiveSegment(activeSegment ?? 'hour');
            }
        }
    };

    const selectSegment = (seg: Segment) => {
        if (disabled) return;
        setActiveSegment(seg);
        inputRef.current?.focus();
    };

    const toggleDropdown = () => {
        if (disabled) return;
        setOpen((o) => !o);
        if (!activeSegment) setActiveSegment('hour');
    };

    const openDropdown = () => {
        if (disabled) return;
        setOpen(true);
        if (!activeSegment) setActiveSegment('hour');
    };

    const segmentClass = (seg: Segment) => {
        const isActive = activeSegment === seg;
        return `tabular-nums font-medium select-none rounded px-0.5 ${
            isActive
                ? 'bg-blue-500 text-white'
                : 'text-gray-900 dark:text-gray-100 hover:bg-blue-100 dark:hover:bg-blue-900/30'
        } ${disabled ? '' : 'cursor-pointer'}`;
    };

    return (
        <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
            {/* Input — behaves like native <input type="time"> */}
            <div
                ref={inputRef}
                tabIndex={disabled ? -1 : 0}
                onClick={() => {
                    if (disabled) return;
                    if (isMobile) {
                        openDropdown();
                    } else if (!activeSegment) {
                        setActiveSegment('hour');
                    }
                }}
                onFocus={() => {
                    if (blurTimeoutRef.current) {
                        clearTimeout(blurTimeoutRef.current);
                        blurTimeoutRef.current = null;
                    }
                    if (!disabled && !activeSegment) setActiveSegment('hour');
                }}
                onBlur={() => {
                    // Delay to allow clicking inside dropdown
                    blurTimeoutRef.current = setTimeout(() => {
                        if (
                            containerRef.current &&
                            document.activeElement &&
                            !containerRef.current.contains(document.activeElement)
                        ) {
                            setActiveSegment(null);
                        }
                        blurTimeoutRef.current = null;
                    }, 150);
                }}
                className={`flex items-center gap-0.5 px-2.5 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-blue-400 dark:hover:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-colors min-w-20 ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'
                }`}
            >
                <span
                    className={segmentClass('hour')}
                    onClick={(e) => {
                        e.stopPropagation();
                        selectSegment('hour');
                    }}
                >
                    {selectedHour}
                </span>
                <span className="text-gray-400 select-none">:</span>
                <span
                    className={segmentClass('minute')}
                    onClick={(e) => {
                        e.stopPropagation();
                        selectSegment('minute');
                    }}
                >
                    {selectedMinute}
                </span>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleDropdown();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    className="ml-auto text-gray-400 hover:text-blue-500 transition-colors cursor-pointer flex items-center"
                    title="Ouvrir le sélecteur"
                >
                    <IconClock size={14} />
                </button>
            </div>

            {open && (
                <div className="absolute z-50 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex">
                        {/* Hours column */}
                        <div className="relative flex flex-col">
                            <button
                                type="button"
                                onClick={() => scrollHourBy(-1)}
                                onMouseDown={(e) => e.preventDefault()}
                                className="flex items-center justify-center py-0.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer w-16 border-b border-gray-100 dark:border-gray-700"
                                title="Heure précédente"
                            >
                                <IconChevronUp size={14} />
                            </button>
                            <div
                                ref={hourColRef}
                                className={`overflow-y-auto h-36 w-16 scrollbar-none ${
                                    activeSegment === 'hour' ? 'ring-2 ring-blue-500 ring-inset' : ''
                                }`}
                                onMouseEnter={() => setActiveSegment('hour')}
                            >
                                {HOURS.map((h) => (
                                    <button
                                        key={h}
                                        type="button"
                                        data-value={h}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleHourSelect(h)}
                                        className={`block w-full text-center py-1 text-sm tabular-nums transition-colors cursor-pointer ${
                                            h === selectedHour
                                                ? 'bg-blue-500 text-white font-semibold'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                                        }`}
                                    >
                                        {h}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => scrollHourBy(1)}
                                onMouseDown={(e) => e.preventDefault()}
                                className="flex items-center justify-center py-0.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer w-16 border-t border-gray-100 dark:border-gray-700"
                                title="Heure suivante"
                            >
                                <IconChevronDown size={14} />
                            </button>
                        </div>

                        {/* Separator */}
                        <div className="w-px bg-gray-200 dark:bg-gray-700" />

                        {/* Minutes column */}
                        <div className="relative flex flex-col">
                            <button
                                type="button"
                                onClick={() => scrollMinuteBy(-1)}
                                onMouseDown={(e) => e.preventDefault()}
                                className="flex items-center justify-center py-0.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer w-16 border-b border-gray-100 dark:border-gray-700"
                                title="Minute précédente"
                            >
                                <IconChevronUp size={14} />
                            </button>
                            <div
                                ref={minuteColRef}
                                className={`overflow-y-auto h-36 w-16 scrollbar-none ${
                                    activeSegment === 'minute' ? 'ring-2 ring-blue-500 ring-inset' : ''
                                }`}
                                onMouseEnter={() => setActiveSegment('minute')}
                            >
                                {MINUTES.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        data-value={m}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleMinuteSelect(m)}
                                        className={`block w-full text-center py-1 text-sm tabular-nums transition-colors cursor-pointer ${
                                            m === selectedMinute
                                                ? 'bg-blue-500 text-white font-semibold'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                                        }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => scrollMinuteBy(1)}
                                onMouseDown={(e) => e.preventDefault()}
                                className="flex items-center justify-center py-0.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer w-16 border-t border-gray-100 dark:border-gray-700"
                                title="Minute suivante"
                            >
                                <IconChevronDown size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
