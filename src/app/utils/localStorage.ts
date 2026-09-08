import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export function useLocalStorage<T>(key: string, defaultState: T): [T, Dispatch<SetStateAction<T>>] {
    const state = useState<T>(defaultState);
    const isFirstRenderRef = useRef(true);

    // Read from localStorage on mount and when key changes.
    // This runs only on the client (useEffect doesn't run on the server),
    // so it fixes the SSR issue where the useState initializer couldn't
    // access localStorage.
    useEffect(() => {
        try {
            const value = localStorage.getItem(key);
            if (value) {
                const parsed = JSON.parse(value) as T;
                // Only update if different to avoid unnecessary re-renders
                if (JSON.stringify(parsed) !== JSON.stringify(state[0])) {
                    state[1](parsed);
                }
            }
        } catch (error) {
            if (typeof window !== 'undefined') {
                console.error(error);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            if (state[0] === undefined) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(state[0]));
            }
        } catch (error) {
            if (typeof window !== 'undefined') {
                console.error(error);
            }
        }
    }, [state[0], key]);

    return state;
}
