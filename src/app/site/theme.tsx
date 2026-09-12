'use client';

import { useEffect, useState } from 'react';
import { IconSun, IconMoon, IconDeviceDesktop, IconDeviceTablet, IconDeviceMobile } from '@tabler/icons-react';

export type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme() {
    const [mode, setMode] = useState<ThemeMode>('system');
    const [resolved, setResolved] = useState<'light' | 'dark'>('light');
    const [ready, setReady] = useState(false);

    // Load theme from localStorage on mount.
    // Set mode, resolved, and ready in the same batch to prevent a flash:
    // the apply-class effect (below) would otherwise run with the default
    // `resolved = 'light'` before `mode` is loaded, removing `site-dark`.
    useEffect(() => {
        const stored = localStorage.getItem('site-theme');
        const validModes: ThemeMode[] = ['light', 'dark', 'system'];
        const initialMode = stored && validModes.includes(stored as ThemeMode) ? (stored as ThemeMode) : 'system';
        let initialResolved: 'light' | 'dark';
        if (initialMode === 'dark') {
            initialResolved = 'dark';
        } else if (initialMode === 'light') {
            initialResolved = 'light';
        } else {
            initialResolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        setMode(initialMode);
        setResolved(initialResolved);
        setReady(true);
    }, []);

    useEffect(() => {
        // Skip until the initial theme has been loaded from localStorage.
        // Otherwise this runs on mount with the default `mode = 'system'`
        // and overrides `resolved` before the first useEffect sets it.
        if (!ready) return;
        if (mode === 'system') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const apply = () => setResolved(mq.matches ? 'dark' : 'light');
            apply();
            mq.addEventListener('change', apply);
            return () => mq.removeEventListener('change', apply);
        } else {
            setResolved(mode);
        }
    }, [mode, ready]);

    useEffect(() => {
        if (!ready) return;
        const root = document.documentElement;
        if (resolved === 'dark') root.classList.add('site-dark');
        else root.classList.remove('site-dark');
        if (mode === 'system') localStorage.removeItem('site-theme');
        else localStorage.setItem('site-theme', mode);
    }, [resolved, mode, ready]);

    const set = (m: ThemeMode) => setMode(m);
    return { mode, resolved, set, ready };
}

export function ThemeToggle({
    mode,
    set,
    ready = true,
}: {
    mode: ThemeMode;
    set: (m: ThemeMode) => void;
    ready?: boolean;
}) {
    const options: { value: ThemeMode; icon: typeof IconSun; label: string }[] = [
        { value: 'light', icon: IconSun, label: 'Clair' },
        { value: 'dark', icon: IconMoon, label: 'Sombre' },
    ];
    // While the theme is loading from localStorage, don't highlight any option
    // to avoid a flash from "system" to the actual selection.
    const activeMode = ready ? mode : null;
    return (
        <div
            className="inline-flex items-center gap-0.5 rounded-full p-0.5 bg-site-surface-hover border border-site-border shrink-0"
            role="radiogroup"
            aria-label="Thème"
        >
            <button
                type="button"
                onClick={() => set('system')}
                title="Système"
                aria-label="Système"
                aria-checked={activeMode === 'system'}
                aria-disabled={!ready}
                role="radio"
                className={`rounded-full flex items-center justify-center transition-all p-1.5 cursor-pointer ${activeMode === 'system' ? 'bg-orange-500 text-white shadow-sm' : 'text-site-text-muted hover:text-site-text'}`}
            >
                <IconDeviceDesktop size={16} className="hidden lg:block" />
                <IconDeviceTablet size={16} className="hidden md:block lg:hidden" />
                <IconDeviceMobile size={16} className="block md:hidden" />
            </button>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => set(opt.value)}
                    title={opt.label}
                    aria-label={opt.label}
                    aria-checked={activeMode === opt.value}
                    aria-disabled={!ready}
                    role="radio"
                    className={`rounded-full flex items-center justify-center transition-all p-1.5 cursor-pointer ${activeMode === opt.value ? 'bg-orange-500 text-white shadow-sm' : 'text-site-text-muted hover:text-site-text'}`}
                >
                    <opt.icon size={16} />
                </button>
            ))}
        </div>
    );
}
