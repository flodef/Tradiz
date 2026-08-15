'use client';

import { useEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { COLOR_OPTIONS, colorToHex, normalizeColorName } from '@/app/utils/colors';

interface ColorSwatchPickerProps {
    color: string;
    onChange: (color: string) => void;
    isReadOnly?: boolean;
}

export default function ColorSwatchPicker({ color, onChange, isReadOnly = false }: ColorSwatchPickerProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const normalized = normalizeColorName(color);
    const currentHex = colorToHex(color);

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

    if (isReadOnly) {
        return (
            <div className="flex items-center justify-center">
                {currentHex ? (
                    <div
                        className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600"
                        style={{ backgroundColor: currentHex }}
                    />
                ) : (
                    <span className="text-gray-400 text-sm">—</span>
                )}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={twMerge(
                    'flex items-center justify-center w-7 h-7 rounded border transition-colors cursor-pointer',
                    currentHex
                        ? 'border-gray-300 dark:border-gray-600'
                        : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                style={currentHex ? { backgroundColor: currentHex } : undefined}
                title={normalized || 'Aucune couleur'}
            >
                {!currentHex && <span className="text-gray-400 text-xs">—</span>}
            </button>
            {open && (
                <div className="absolute z-50 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                    <div className="grid grid-cols-3 gap-1.5">
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                            }}
                            className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                            title="Aucune couleur"
                        >
                            <span className="text-gray-400 text-xs">—</span>
                        </button>
                        {COLOR_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={twMerge(
                                    'w-7 h-7 rounded border transition-transform hover:scale-110',
                                    normalized === opt.value
                                        ? 'ring-2 ring-blue-500 border-blue-500'
                                        : 'border-gray-300 dark:border-gray-600'
                                )}
                                style={{ backgroundColor: opt.hex }}
                                title={opt.value}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
