'use client';

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import VirtualKeyboard from '../VirtualKeyboard';

interface VirtualKeyboardContextValue {
    registerInput: (input: HTMLInputElement, onChange: (value: string) => void) => void;
    unregisterInput: (input: HTMLInputElement) => void;
}

const VirtualKeyboardContext = createContext<VirtualKeyboardContextValue | null>(null);

export function useVirtualKeyboardContext() {
    return useContext(VirtualKeyboardContext);
}

interface ActiveInput {
    element: HTMLInputElement;
    onChange: (value: string) => void;
    // For number inputs, selectionStart/selectionEnd return null and
    // el.value may be normalized by the browser (e.g. "3." → "").
    // We track the raw value and cursor position ourselves.
    trackedValue: string;
    cursorPos: number;
    hasSelection: boolean;
}

export function VirtualKeyboardProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
    const [activeInput, setActiveInput] = useState<ActiveInput | null>(null);
    const activeInputRef = useRef<ActiveInput | null>(null);
    const isTabbingRef = useRef(false);

    const registerInput = useCallback(
        (input: HTMLInputElement, onChange: (value: string) => void) => {
            if (!enabled) return;
            const isNumber = input.type === 'number';
            let trackedValue = input.value;
            let cursorPos: number;
            let hasSelection: boolean;
            if (isNumber) {
                // Detect selection by temporarily switching to text
                input.type = 'text';
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;
                input.type = 'number';
                trackedValue = input.value;
                cursorPos = end;
                hasSelection = start !== end;
            } else {
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;
                cursorPos = end;
                hasSelection = start !== end;
            }
            const active: ActiveInput = { element: input, onChange, trackedValue, cursorPos, hasSelection };
            activeInputRef.current = active;
            setActiveInput(active);
            // Scroll input into view above the keyboard
            setTimeout(() => {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        },
        [enabled]
    );

    const unregisterInput = useCallback((input: HTMLInputElement) => {
        if (isTabbingRef.current) {
            isTabbingRef.current = false;
            return;
        }
        if (activeInputRef.current?.element === input) {
            activeInputRef.current = null;
            setActiveInput(null);
        }
    }, []);

    const handleKey = useCallback((key: string) => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const isNumber = el.type === 'number';
        let currentValue: string;
        let start: number;
        let end: number;
        if (isNumber) {
            currentValue = active.trackedValue;
            if (active.hasSelection) {
                start = 0;
                end = currentValue.length;
            } else {
                start = active.cursorPos;
                end = active.cursorPos;
            }
        } else {
            currentValue = el.value;
            start = el.selectionStart ?? currentValue.length;
            end = el.selectionEnd ?? currentValue.length;
        }
        const newValue = currentValue.slice(0, start) + key + currentValue.slice(end);
        const newPos = start + key.length;
        if (isNumber) {
            el.type = 'text';
            el.value = newValue;
            el.type = 'number';
        } else {
            el.value = newValue;
            el.setSelectionRange(newPos, newPos);
        }
        active.trackedValue = newValue;
        active.cursorPos = newPos;
        active.hasSelection = false;
        active.onChange(newValue);
    }, []);

    const handleBackspace = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const isNumber = el.type === 'number';
        let currentValue: string;
        let start: number;
        let end: number;
        if (isNumber) {
            currentValue = active.trackedValue;
            if (active.hasSelection) {
                start = 0;
                end = currentValue.length;
            } else {
                start = active.cursorPos;
                end = active.cursorPos;
            }
        } else {
            currentValue = el.value;
            start = el.selectionStart ?? currentValue.length;
            end = el.selectionEnd ?? currentValue.length;
        }
        let newValue: string;
        let newPos: number;
        if (start !== end) {
            newValue = currentValue.slice(0, start) + currentValue.slice(end);
            newPos = start;
        } else if (start === 0) {
            return;
        } else {
            newValue = currentValue.slice(0, start - 1) + currentValue.slice(start);
            newPos = start - 1;
        }
        if (isNumber) {
            el.type = 'text';
            el.value = newValue;
            el.type = 'number';
        } else {
            el.value = newValue;
            el.setSelectionRange(newPos, newPos);
        }
        active.trackedValue = newValue;
        active.cursorPos = newPos;
        active.hasSelection = false;
        active.onChange(newValue);
    }, []);

    const handleArrowLeft = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const isNumber = el.type === 'number';
        if (isNumber) {
            active.cursorPos = Math.max(0, active.cursorPos - 1);
            active.hasSelection = false;
        } else {
            const pos = Math.max(0, (el.selectionStart ?? el.value.length) - 1);
            el.setSelectionRange(pos, pos);
        }
        el.focus();
    }, []);

    const handleArrowRight = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const isNumber = el.type === 'number';
        if (isNumber) {
            active.cursorPos = Math.min(active.trackedValue.length, active.cursorPos + 1);
            active.hasSelection = false;
        } else {
            const pos = Math.min(el.value.length, (el.selectionStart ?? el.value.length) + 1);
            el.setSelectionRange(pos, pos);
        }
        el.focus();
    }, []);

    const handleEnter = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        active.element.blur();
        setActiveInput(null);
        activeInputRef.current = null;
    }, []);

    const handleTab = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const focusable = Array.from(
            document.querySelectorAll<HTMLInputElement>(
                'input:not([disabled]):not([readonly]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])'
            )
        ).filter((e) => e.offsetParent !== null);
        const idx = focusable.indexOf(el);
        const next = focusable[idx + 1];
        if (next && next.tagName === 'INPUT') {
            isTabbingRef.current = true;
            next.focus();
        } else if (next) {
            isTabbingRef.current = true;
            next.focus();
        } else {
            el.blur();
            setActiveInput(null);
            activeInputRef.current = null;
        }
    }, []);

    const handleTabBack = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const focusable = Array.from(
            document.querySelectorAll<HTMLInputElement>(
                'input:not([disabled]):not([readonly]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])'
            )
        ).filter((e) => e.offsetParent !== null);
        const idx = focusable.indexOf(el);
        const prev = focusable[idx - 1];
        if (prev && prev.tagName === 'INPUT') {
            isTabbingRef.current = true;
            prev.focus();
        } else if (prev) {
            isTabbingRef.current = true;
            prev.focus();
        } else {
            el.blur();
            setActiveInput(null);
            activeInputRef.current = null;
        }
    }, []);

    return (
        <VirtualKeyboardContext.Provider value={{ registerInput, unregisterInput }}>
            {children}
            {enabled && activeInput && (
                <VirtualKeyboard
                    onKey={handleKey}
                    onBackspace={handleBackspace}
                    onEnter={handleEnter}
                    onArrowLeft={handleArrowLeft}
                    onArrowRight={handleArrowRight}
                    onTab={handleTab}
                    onTabBack={handleTabBack}
                />
            )}
        </VirtualKeyboardContext.Provider>
    );
}
