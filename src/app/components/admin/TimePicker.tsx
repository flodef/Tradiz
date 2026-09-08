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

type FocusCol = 'hour' | 'minute';

export default function TimePicker({ value, onChange, disabled, className = '' }: TimePickerProps) {
    const isMobile = useIsMobile();
    const [open, setOpen] = useState(false);
    const [focusCol, setFocusCol] = useState<FocusCol>('hour');
    const containerRef = useRef<HTMLDivElement>(null);
    const hourColRef = useRef<HTMLDivElement>(null);
    const minuteColRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    // Keyboard navigation — works from the input even when dropdown is closed
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) setOpen(true);
            if (focusCol === 'hour') scrollHourBy(-1);
            else scrollMinuteBy(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setOpen(true);
            if (focusCol === 'hour') scrollHourBy(1);
            else scrollMinuteBy(1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (!open) setOpen(true);
            setFocusCol('hour');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (!open) setOpen(true);
            setFocusCol('minute');
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!open) {
                setOpen(true);
                setFocusCol('hour');
            } else {
                setOpen(false);
            }
        }
    };

    const openDropdown = () => {
        if (disabled) return;
        setOpen(true);
        setFocusCol('hour');
    };

    return (
        <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
            <div
                tabIndex={disabled ? -1 : 0}
                className={`flex items-center gap-1 px-2.5 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-blue-400 dark:hover:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-20 ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
                onClick={() => !disabled && (isMobile ? openDropdown() : null)}
            >
                <span className="tabular-nums font-medium select-none">{selectedHour}</span>
                <span className="text-gray-400 select-none">:</span>
                <span className="tabular-nums font-medium select-none">{selectedMinute}</span>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && openDropdown()}
                    className="ml-auto text-gray-400 hover:text-blue-500 transition-colors cursor-pointer flex items-center"
                    title="Ouvrir le sélecteur"
                >
                    <IconClock size={14} />
                </button>
            </div>

            {open && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                    <div className="flex">
                        {/* Hours column */}
                        <div className="relative flex flex-col">
                            <button
                                type="button"
                                onClick={() => scrollHourBy(-1)}
                                className="flex items-center justify-center py-0.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer w-16 border-b border-gray-100 dark:border-gray-700"
                                title="Heure précédente"
                            >
                                <IconChevronUp size={14} />
                            </button>
                            <div
                                ref={hourColRef}
                                className={`overflow-y-auto h-36 w-16 scrollbar-none py-1 ${
                                    focusCol === 'hour' ? 'ring-2 ring-blue-500 ring-inset' : ''
                                }`}
                                onMouseEnter={() => setFocusCol('hour')}
                            >
                                {HOURS.map((h) => (
                                    <button
                                        key={h}
                                        type="button"
                                        data-value={h}
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
                                className="flex items-center justify-center py-0.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer w-16 border-b border-gray-100 dark:border-gray-700"
                                title="Minute précédente"
                            >
                                <IconChevronUp size={14} />
                            </button>
                            <div
                                ref={minuteColRef}
                                className={`overflow-y-auto h-36 w-16 scrollbar-none py-1 ${
                                    focusCol === 'minute' ? 'ring-2 ring-blue-500 ring-inset' : ''
                                }`}
                                onMouseEnter={() => setFocusCol('minute')}
                            >
                                {MINUTES.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        data-value={m}
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
