'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const normalized = normalizeColorName(color);
    const currentHex = colorToHex(color);

    // The dropdown is portaled to document.body — inside scrollable/clipped
    // admin containers an absolutely-positioned dropdown would render under
    // the parent control. Position is computed from the trigger's rect and
    // flips above the button when there isn't enough room below.
    const updatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const estHeight = 150; // 3-col grid, ~4 rows of 28px swatches + padding
        const estWidth = 120;
        const spaceBelow = window.innerHeight - rect.bottom;
        const flip = spaceBelow < estHeight && rect.top > estHeight;
        setDropdownStyle({
            position: 'fixed',
            top: flip ? undefined : rect.bottom + 4,
            bottom: flip ? window.innerHeight - rect.top + 4 : undefined,
            left: Math.min(rect.left, window.innerWidth - estWidth - 8),
        });
    }, []);

    // Recompute on open and on scroll/resize while open.
    useLayoutEffect(() => {
        if (!open) return;
        updatePosition();
        const handler = () => updatePosition();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [open, updatePosition]);

    // Close on outside click (checks both the trigger and the portal dropdown).
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            setOpen(false);
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
                ref={buttonRef}
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
            {open &&
                createPortal(
                    <div
                        ref={dropdownRef}
                        style={dropdownStyle}
                        className="z-9999 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-max"
                    >
                        <div className="grid grid-cols-3 gap-1.5">
                            <button
                                type="button"
                                onClick={() => {
                                    onChange('');
                                    setOpen(false);
                                }}
                                className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer"
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
                                        'w-7 h-7 rounded border transition-transform hover:scale-110 cursor-pointer',
                                        normalized === opt.value
                                            ? 'ring-2 ring-blue-500 border-blue-500'
                                            : 'border-gray-300 dark:border-gray-600'
                                    )}
                                    style={{ backgroundColor: opt.hex }}
                                    title={opt.value}
                                />
                            ))}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
