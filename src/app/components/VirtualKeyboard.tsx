'use client';

import { useState, useEffect } from 'react';
import { twMerge } from 'tailwind-merge';
import { IconBackspace, IconCheck, IconArrowLeft, IconArrowRight } from '@tabler/icons-react';

interface VirtualKeyboardProps {
    onKey: (key: string) => void;
    onBackspace: () => void;
    onEnter: () => void;
    onArrowLeft: () => void;
    onArrowRight: () => void;
    onTab: () => void;
    onTabBack: () => void;
    isNumeric?: boolean;
}

const LETTER_ROWS: string[][] = [
    ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'],
];

const NUMPAD: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SYMBOLS_9: string[] = ['+', '.', '-', '_', ',', "'", '/', '!', '?'];
const SYMBOL_FOR_0 = ':';

const keyBtn =
    'flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 active:bg-gray-400 dark:active:bg-gray-600 transition-colors text-lg font-medium select-none cursor-pointer';

const validateBtn =
    'flex items-center justify-center rounded-lg bg-green-500 text-white hover:bg-green-600 active:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 dark:active:bg-green-700 transition-colors select-none cursor-pointer';

export default function VirtualKeyboard({
    onKey,
    onBackspace,
    onEnter,
    onArrowLeft,
    onArrowRight,
    onTab,
    onTabBack,
    isNumeric = false,
}: VirtualKeyboardProps) {
    const [shift, setShift] = useState(false);
    // Symbols shown by default in text mode (user can toggle to numbers)
    const [showSymbols, setShowSymbols] = useState(true);

    // Reset to symbols when switching to a text input
    useEffect(() => {
        if (!isNumeric) {
            setShowSymbols(true);
            setShift(false);
        }
    }, [isNumeric]);

    const handleKey = (k: string) => {
        if (shift) {
            onKey(k.toUpperCase());
            setShift(false);
        } else {
            onKey(k);
        }
    };

    // Numeric mode: only digits + decimal point, no letters, no symbol toggle
    if (isNumeric) {
        return (
            <div
                className="fixed bottom-0 left-0 right-0 z-110 bg-white dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-700 shadow-2xl p-2 select-none"
                onMouseDown={(e) => e.preventDefault()}
            >
                <div className="max-w-5xl mx-auto flex gap-1.5 items-stretch justify-center">
                    {/* 3x3 numpad */}
                    <div className="grid grid-cols-3 gap-1.5">
                        {NUMPAD.map((k) => (
                            <button key={k} onClick={() => handleKey(k)} className={`${keyBtn} w-11 h-11`}>
                                {k}
                            </button>
                        ))}
                    </div>

                    {/* 0, <, > column */}
                    <div className="flex flex-col gap-1.5">
                        <button onClick={() => handleKey('0')} className={`${keyBtn} w-11 h-11`}>
                            0
                        </button>
                        <button onClick={onArrowLeft} className={`${keyBtn} w-11 h-11`}>
                            <IconArrowLeft size={18} />
                        </button>
                        <button onClick={onArrowRight} className={`${keyBtn} w-11 h-11`}>
                            <IconArrowRight size={18} />
                        </button>
                    </div>

                    {/* Decimal, Tab, Validate column */}
                    <div className="flex flex-col gap-1.5">
                        <button onClick={() => handleKey('.')} className={`${keyBtn} px-4 h-11`}>
                            .
                        </button>
                        <button onClick={onTab} className={`${keyBtn} px-4 h-11`}>
                            Tab ⇥
                        </button>
                        <button onClick={onEnter} className={`${validateBtn} px-4 h-11`}>
                            <IconCheck size={22} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Text mode: letters + symbols (with toggle to numbers)
    const rightChars = showSymbols ? SYMBOLS_9 : NUMPAD;
    const zeroChar = showSymbols ? SYMBOL_FOR_0 : '0';

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-110 bg-white dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-700 shadow-2xl p-2 select-none"
            onMouseDown={(e) => e.preventDefault()}
        >
            <div className="max-w-5xl mx-auto flex gap-3 items-stretch">
                {/* Letters section - 3 rows only */}
                <div className="flex-1 space-y-1.5">
                    {/* Row 1 */}
                    <div className="flex justify-center gap-1.5">
                        {LETTER_ROWS[0].map((k) => (
                            <button key={k} onClick={() => handleKey(k)} className={`${keyBtn} w-11 h-11`}>
                                {shift ? k.toUpperCase() : k}
                            </button>
                        ))}
                    </div>
                    {/* Row 2 */}
                    <div className="flex justify-center gap-1.5">
                        {LETTER_ROWS[1].map((k) => (
                            <button key={k} onClick={() => handleKey(k)} className={`${keyBtn} w-11 h-11`}>
                                {shift ? k.toUpperCase() : k}
                            </button>
                        ))}
                    </div>
                    {/* Row 3: MAJ + w x c + Space + v b n + Backspace */}
                    <div className="flex justify-center gap-1.5">
                        <button
                            onClick={() => setShift(!shift)}
                            className={twMerge(
                                keyBtn,
                                'w-11 h-11',
                                shift && 'bg-blue-500 text-white hover:bg-blue-600 dark:hover:bg-blue-700'
                            )}
                        >
                            Maj
                        </button>
                        {['w', 'x', 'c'].map((k) => (
                            <button key={k} onClick={() => handleKey(k)} className={`${keyBtn} w-11 h-11`}>
                                {shift ? k.toUpperCase() : k}
                            </button>
                        ))}
                        <button
                            onClick={() => handleKey(' ')}
                            className={`${keyBtn} h-11`}
                            style={{ width: 'calc(2 * 2.75rem + 0.375rem)' }}
                        >
                            Espace
                        </button>
                        {['v', 'b', 'n'].map((k) => (
                            <button key={k} onClick={() => handleKey(k)} className={`${keyBtn} w-11 h-11`}>
                                {shift ? k.toUpperCase() : k}
                            </button>
                        ))}
                        <button onClick={onBackspace} className={`${keyBtn} w-11 h-11`}>
                            <IconBackspace size={22} />
                        </button>
                    </div>
                </div>

                {/* Right section: 3x3 numpad | 0/arrows column | symbol/tab/validate column */}
                <div className="flex gap-1.5">
                    {/* 3x3 grid */}
                    <div className="grid grid-cols-3 gap-1.5">
                        {rightChars.map((k) => (
                            <button key={k} onClick={() => handleKey(k)} className={`${keyBtn} w-11 h-11`}>
                                {shift ? k.toUpperCase() : k}
                            </button>
                        ))}
                    </div>

                    {/* 0, <, > column */}
                    <div className="flex flex-col gap-1.5">
                        <button onClick={() => handleKey(zeroChar)} className={`${keyBtn} w-11 h-11`}>
                            {shift ? zeroChar.toUpperCase() : zeroChar}
                        </button>
                        <button onClick={onArrowLeft} className={`${keyBtn} w-11 h-11`}>
                            <IconArrowLeft size={18} />
                        </button>
                        <button onClick={onArrowRight} className={`${keyBtn} w-11 h-11`}>
                            <IconArrowRight size={18} />
                        </button>
                    </div>

                    {/* Symbol, Tab, Validate column (larger) */}
                    <div className="flex flex-col gap-1.5">
                        <button onClick={() => setShowSymbols(!showSymbols)} className={`${keyBtn} px-4 h-11`}>
                            {showSymbols ? '123' : '+.!?'}
                        </button>
                        <button onClick={showSymbols ? onTabBack : onTab} className={`${keyBtn} px-4 h-11`}>
                            {showSymbols ? '⇤ Tab' : 'Tab ⇥'}
                        </button>
                        <button onClick={onEnter} className={`${validateBtn} px-4 h-11`}>
                            <IconCheck size={22} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
