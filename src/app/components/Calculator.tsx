'use client';

import { FC, MouseEventHandler, useCallback, useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { useIsMobileDevice } from '../utils/mobile';

interface CalculatorProps {
    onUseResult?: (value: number) => void;
    initialValue?: number;
}

type CalcButton = {
    label: string;
    value: string;
    className?: string;
    colspan?: number;
};

const CalcButton: FC<{ button: CalcButton; onClick: () => void }> = ({ button, onClick }) => {
    const isMobileDevice = useIsMobileDevice();
    const handleClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            onClick();
        },
        [onClick]
    );

    return (
        <div
            className={twMerge(
                'h-14 relative flex justify-center items-center font-semibold text-2xl',
                'border-2 rounded-xl',
                'border-secondary-light dark:border-secondary-dark shadow-md',
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark',
                'active:text-popup-dark dark:active:text-popup-light',
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : '',
                button.className || '',
                button.colspan === 2 ? 'col-span-2' : ''
            )}
            onClick={handleClick}
            onContextMenu={handleClick}
        >
            {button.label}
        </div>
    );
};

const roundResult = (value: number): number => parseFloat(value.toFixed(10));

export const Calculator: FC<CalculatorProps> = ({ onUseResult, initialValue = 0 }) => {
    const isMobileDevice = useIsMobileDevice();
    const [display, setDisplay] = useState(initialValue.toShortFixed());
    const [previousValue, setPreviousValue] = useState<number | null>(null);
    const [operation, setOperation] = useState<string | null>(null);
    const [resetOnNextInput, setResetOnNextInput] = useState(false);

    // Update display when initialValue changes
    useEffect(() => {
        setDisplay(initialValue.toShortFixed());
        setPreviousValue(null);
        setOperation(null);
        setResetOnNextInput(false);
    }, [initialValue]);

    const handleNumber = useCallback(
        (num: string) => {
            if (resetOnNextInput) {
                setDisplay(num);
                setResetOnNextInput(false);
            } else {
                setDisplay((prev) => (prev === '0' ? num : prev + num));
            }
        },
        [resetOnNextInput]
    );

    const handleDecimal = useCallback(() => {
        if (resetOnNextInput) {
            setDisplay('0.');
            setResetOnNextInput(false);
        } else if (!display.includes('.')) {
            setDisplay((prev) => prev + '.');
        }
    }, [display, resetOnNextInput]);

    const handleOperation = useCallback(
        (op: string) => {
            const current = parseFloat(display);

            if (previousValue !== null && operation && !resetOnNextInput) {
                // Calculate previous operation first
                let result = previousValue;
                switch (operation) {
                    case '+':
                        result = previousValue + current;
                        break;
                    case '-':
                        result = previousValue - current;
                        break;
                    case '×':
                        result = previousValue * current;
                        break;
                    case '÷':
                        result = current !== 0 ? previousValue / current : previousValue;
                        break;
                }
                result = roundResult(result);
                setDisplay(result.toShortFixed());
                setPreviousValue(result);
            } else {
                setPreviousValue(current);
            }

            setOperation(op);
            setResetOnNextInput(true);
        },
        [display, previousValue, operation, resetOnNextInput]
    );

    const handleEquals = useCallback(() => {
        if (previousValue === null || operation === null) return;

        const current = parseFloat(display);
        let result = previousValue;

        switch (operation) {
            case '+':
                result = previousValue + current;
                break;
            case '-':
                result = previousValue - current;
                break;
            case '×':
                result = previousValue * current;
                break;
            case '÷':
                result = current !== 0 ? previousValue / current : previousValue;
                break;
        }

        result = roundResult(result);
        setDisplay(result.toShortFixed());
        setPreviousValue(null);
        setOperation(null);
        setResetOnNextInput(true);
    }, [display, previousValue, operation]);

    const handleClear = useCallback(() => {
        setDisplay('0');
        setPreviousValue(null);
        setOperation(null);
        setResetOnNextInput(false);
    }, []);

    const handleBackspace = useCallback(() => {
        if (resetOnNextInput) {
            handleClear();
        } else {
            setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
        }
    }, [resetOnNextInput, handleClear]);

    const handleUseResult = useCallback(() => {
        const value = parseFloat(display);
        if (!isNaN(value) && onUseResult) {
            onUseResult(value);
        }
    }, [display, onUseResult]);

    const buttons: CalcButton[][] = [
        [
            { label: '7', value: '7' },
            { label: '8', value: '8' },
            { label: '9', value: '9' },
            { label: '÷', value: 'divide', className: 'bg-blue-500/20 dark:bg-blue-500/30' },
        ],
        [
            { label: '4', value: '4' },
            { label: '5', value: '5' },
            { label: '6', value: '6' },
            { label: '×', value: 'multiply', className: 'bg-blue-500/20 dark:bg-blue-500/30' },
        ],
        [
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '-', value: 'subtract', className: 'bg-blue-500/20 dark:bg-blue-500/30' },
        ],
        [
            { label: '0', value: '0' },
            { label: '00', value: '00' },
            { label: '.', value: 'decimal' },
            { label: '+', value: 'add', className: 'bg-blue-500/20 dark:bg-blue-500/30' },
        ],
        [
            { label: 'C', value: 'clear', className: 'bg-red-500/20 dark:bg-red-500/30' },
            { label: '←', value: 'backspace' },
            { label: '=', value: 'equals', colspan: 2, className: 'bg-green-500/20 dark:bg-green-500/30' },
        ],
    ];

    const handleButtonClick = useCallback(
        (button: CalcButton) => {
            switch (button.value) {
                case 'clear':
                    handleClear();
                    break;
                case 'backspace':
                    handleBackspace();
                    break;
                case 'decimal':
                    handleDecimal();
                    break;
                case 'add':
                case 'subtract':
                case 'multiply':
                case 'divide':
                    handleOperation(button.label);
                    break;
                case 'equals':
                    handleEquals();
                    break;
                default:
                    handleNumber(button.label);
            }
        },
        [handleClear, handleBackspace, handleDecimal, handleOperation, handleEquals, handleNumber]
    );

    return (
        <div
            className="w-full max-w-md mx-auto p-4"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
        >
            {/* Display */}
            <div className="mb-4 p-4 bg-secondary-light dark:bg-secondary-dark rounded-xl">
                <div className="text-right">
                    {operation && previousValue !== null && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {previousValue} {operation}
                        </div>
                    )}
                    <div className="text-3xl font-bold break-all">{display}</div>
                </div>
            </div>

            {/* Buttons Grid */}
            <div className="grid grid-cols-4 gap-2 mb-4">
                {buttons.map((row, rowIndex) =>
                    row.map((button, btnIndex) => (
                        <CalcButton
                            key={`${rowIndex}-${btnIndex}`}
                            button={button}
                            onClick={() => handleButtonClick(button)}
                        />
                    ))
                )}
            </div>

            {/* Use Result Button */}
            {onUseResult && (
                <button
                    onClick={handleUseResult}
                    className={twMerge(
                        'w-full h-12 rounded-xl font-semibold text-lg',
                        'bg-green-500 dark:bg-green-600',
                        'text-white',
                        'active:bg-green-600 dark:active:bg-green-700',
                        !isMobileDevice ? 'hover:bg-green-600 dark:hover:bg-green-700 cursor-pointer' : ''
                    )}
                >
                    Utiliser le résultat
                </button>
            )}
        </div>
    );
};
