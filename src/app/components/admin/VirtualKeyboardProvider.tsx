'use client';

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import VirtualKeyboard from '../VirtualKeyboard';

interface VirtualKeyboardContextValue {
    registerInput: (input: HTMLInputElement, onChange: (value: string) => void) => void;
    unregisterInput: (input: HTMLInputElement) => void;
    registerEnterHandler: (handler: (() => void) | null) => void;
}

const VirtualKeyboardContext = createContext<VirtualKeyboardContextValue | null>(null);

export function useVirtualKeyboardContext() {
    return useContext(VirtualKeyboardContext);
}

interface ActiveInput {
    element: HTMLInputElement;
    onChange: (value: string) => void;
    isNumeric: boolean;
}

export function VirtualKeyboardProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
    const [activeInput, setActiveInput] = useState<ActiveInput | null>(null);
    const activeInputRef = useRef<ActiveInput | null>(null);
    const isTabbingRef = useRef(false);
    const enterHandlerRef = useRef<(() => void) | null>(null);

    const registerInput = useCallback(
        (input: HTMLInputElement, onChange: (value: string) => void) => {
            if (!enabled) return;
            // Detect numeric inputs: inputMode="decimal" or type="number" or type="tel"
            const isNumeric =
                input.inputMode === 'decimal' ||
                input.inputMode === 'numeric' ||
                input.type === 'number' ||
                input.type === 'tel';
            const active: ActiveInput = { element: input, onChange, isNumeric };
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
            enterHandlerRef.current = null;
        }
    }, []);

    const registerEnterHandler = useCallback((handler: (() => void) | null) => {
        enterHandlerRef.current = handler;
    }, []);

    const handleKey = useCallback((key: string) => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const newValue = el.value.slice(0, start) + key + el.value.slice(end);
        el.value = newValue;
        const newPos = start + key.length;
        el.setSelectionRange(newPos, newPos);
        active.onChange(newValue);
    }, []);

    const handleBackspace = useCallback(() => {
        const active = activeInputRef.current;
        if (!active) return;
        const el = active.element;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        let newValue: string;
        let newPos: number;
        if (start !== end) {
            newValue = el.value.slice(0, start) + el.value.slice(end);
            newPos = start;
        } else if (start === 0) {
            return;
        } else {
            newValue = el.value.slice(0, start - 1) + el.value.slice(start);
            newPos = start - 1;
        }
        el.value = newValue;
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
        // First try the registered Enter handler (e.g. search popup select-first).
        // This is more reliable than dispatching a synthetic keydown event, which
        // React's event system may not pick up correctly.
        if (enterHandlerRef.current) {
            const handler = enterHandlerRef.current;
            enterHandlerRef.current = null;
            handler();
            // Dismiss the keyboard like the fallback path does, otherwise "valider"
            // leaves it open when the handler is a no-op (e.g. empty search results).
            active.element.blur();
            setActiveInput(null);
            activeInputRef.current = null;
            return;
        }
        // Fallback: dispatch a synthetic Enter keydown so the input's onKeyDown
        // handler runs (e.g. form submit, etc.)
        const el = active.element;
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
        });
        const notPrevented = el.dispatchEvent(enterEvent);
        if (notPrevented) {
            el.dispatchEvent(
                new KeyboardEvent('keyup', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                })
            );
        }
        el.blur();
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
        <VirtualKeyboardContext.Provider value={{ registerInput, unregisterInput, registerEnterHandler }}>
            {children}
            {enabled && activeInput && (
                <VirtualKeyboard
                    isNumeric={activeInput.isNumeric}
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
