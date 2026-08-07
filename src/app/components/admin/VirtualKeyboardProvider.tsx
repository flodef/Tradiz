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
}

export function VirtualKeyboardProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
    const [activeInput, setActiveInput] = useState<ActiveInput | null>(null);
    const activeInputRef = useRef<ActiveInput | null>(null);
    const isTabbingRef = useRef(false);

    const registerInput = useCallback(
        (input: HTMLInputElement, onChange: (value: string) => void) => {
            if (!enabled) return;
            const active = { element: input, onChange };
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
        const pos = el.selectionStart ?? el.value.length;
        const newValue = el.value.slice(0, pos) + key + el.value.slice(pos);
        // type=number inputs silently reject values like '3.' — temporarily
        // switch to text to set the raw value, then restore the type.
        if (el.type === 'number') {
            el.type = 'text';
            el.value = newValue;
            el.type = 'number';
        } else {
            el.value = newValue;
        }
        const newPos = pos + key.length;
        el.setSelectionRange(newPos, newPos);
        active.onChange(newValue);
    }, []);

    const handleBackspace = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const pos = el.selectionStart ?? el.value.length;
        if (pos === 0) return;
        const newValue = el.value.slice(0, pos - 1) + el.value.slice(pos);
        if (el.type === 'number') {
            el.type = 'text';
            el.value = newValue;
            el.type = 'number';
        } else {
            el.value = newValue;
        }
        const newPos = pos - 1;
        el.setSelectionRange(newPos, newPos);
        active.onChange(newValue);
    }, []);

    const handleArrowLeft = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const pos = Math.max(0, (el.selectionStart ?? el.value.length) - 1);
        el.setSelectionRange(pos, pos);
        el.focus();
    }, []);

    const handleArrowRight = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const pos = Math.min(el.value.length, (el.selectionStart ?? el.value.length) + 1);
        el.setSelectionRange(pos, pos);
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
