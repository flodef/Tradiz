'use client';

import { useState, useRef, useEffect } from 'react';
import { IconClock, IconChevronUp, IconChevronDown } from '@tabler/icons-react';

interface TimePickerProps {
    value: string; // "HH:MM"
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')); // 00, 05, 10, ... 55

export default function TimePicker({ value, onChange, disabled, className = '' }: TimePickerProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const hourColRef = useRef<HTMLDivElement>(null);
    const minuteColRef = useRef<HTMLDivElement>(null);

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
        // Defer to allow DOM to render
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

    const handleHourSelect = (h: string) => {
        onChange(`${h}:${selectedMinute}`);
    };

    const handleMinuteSelect = (m: string) => {
        onChange(`${selectedHour}:${m}`);
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-blue-400 dark:hover:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-20 justify-center cursor-pointer"
            >
                <IconClock size={14} className="text-gray-400" />
                <span className="tabular-nums font-medium">
                    {selectedHour}:{selectedMinute}
                </span>
            </button>

            {open && (
                <div className="absolute z-50 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex">
                        {/* Hours column */}
                        <div className="relative">
                            <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase text-center border-b border-gray-100 dark:border-gray-700">
                                Heure
                            </div>
                            <div ref={hourColRef} className="overflow-y-auto h-40 w-16 scrollbar-thin py-1">
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
                        </div>

                        {/* Separator */}
                        <div className="w-px bg-gray-200 dark:bg-gray-700" />

                        {/* Minutes column */}
                        <div className="relative">
                            <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase text-center border-b border-gray-100 dark:border-gray-700">
                                Min
                            </div>
                            <div ref={minuteColRef} className="overflow-y-auto h-40 w-16 scrollbar-thin py-1">
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
                        </div>
                    </div>

                    {/* Quick adjust buttons */}
                    <div className="flex border-t border-gray-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={() => {
                                const idx = HOURS.indexOf(selectedHour);
                                const next = HOURS[(idx - 1 + 24) % 24];
                                handleHourSelect(next);
                            }}
                            className="flex-1 flex items-center justify-center py-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                            <IconChevronUp size={14} />
                        </button>
                        <div className="w-px bg-gray-100 dark:bg-gray-700" />
                        <button
                            type="button"
                            onClick={() => {
                                const idx = HOURS.indexOf(selectedHour);
                                const next = HOURS[(idx + 1) % 24];
                                handleHourSelect(next);
                            }}
                            className="flex-1 flex items-center justify-center py-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                            <IconChevronDown size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
