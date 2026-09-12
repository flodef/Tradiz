import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export function useLocalStorage<T>(key: string, defaultState: T): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(defaultState);
    const isFirstRenderRef = useRef(true);
    // Hold the latest value in a ref so the read effect can compare against it
    // without depending on `value` (which would re-run it on every change).
    const valueRef = useRef(value);
    valueRef.current = value;

    // Read from localStorage on mount and when key changes.
    // This runs only on the client (useEffect doesn't run on the server),
    // so it fixes the SSR issue where the useState initializer couldn't
    // access localStorage.
    useEffect(() => {
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored) as T;
                // Only update if different to avoid unnecessary re-renders
                if (JSON.stringify(parsed) !== JSON.stringify(valueRef.current)) {
                    setValue(parsed);
                }
            }
        } catch (error) {
            if (typeof window !== 'undefined') {
                console.error(error);
            }
        }
    }, [key]);

    // Write to localStorage on state change (skip first render to avoid
    // overwriting saved data with the default value before the read effect runs)
    useEffect(() => {
        if (!key) {
            console.warn('useLocalStorage: key is not defined');
            return;
        }

        if (isFirstRenderRef.current) {
            isFirstRenderRef.current = false;
            return;
        }
        try {
            if (value === undefined) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (error) {
            if (typeof window !== 'undefined') {
                console.error(error);
            }
        }
    }, [value, key]);

    return [value, setValue];
}
