'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useConfig } from '@/app/hooks/useConfig';

type NavItem = {
    id: string;
    href: string;
    label: string;
    icon: string;
    hidden?: boolean;
};

export default function TradizTopNav() {
    const [collapsed, setCollapsed] = useState(true);
    const { modeFonctionnement, isGrafanaAccessEnabled } = useConfig();

    const navItems = useMemo<NavItem[]>(
        () => [
            { id: 'cash_register', href: '/admin/kitchen/config/', label: 'Configuration', icon: '⚙' },
            { id: 'edit_menu', href: '/admin/edit_menu/', label: 'Edition menu', icon: '✎' },
            {
                id: 'kpi',
                href: '/stats',
                label: 'Statistiques',
                icon: '◔',
                hidden: !isGrafanaAccessEnabled,
            },
        ],
        [isGrafanaAccessEnabled]
    );

    if (modeFonctionnement !== 'lite') {
        return null;
    }

    return (
        <div
            id="nav"
            className="fixed top-3 left-3 z-50 flex items-center gap-3 rounded-2xl border border-black/10 bg-white/85 p-1.5 shadow-md backdrop-blur dark:border-white/10 dark:bg-black/45"
        >
            {!collapsed &&
                navItems
                    .filter((item) => !item.hidden)
                    .map((item) => (
                        <Link
                            id={item.id}
                            key={item.id}
                            href={item.href}
                            className="flex h-14 w-14 items-center justify-center rounded-xl text-4xl leading-none transition hover:bg-black/5 dark:hover:bg-white/10"
                            aria-label={item.label}
                            title={item.label}
                        >
                            <span className={`block ${item.icon === '◔' ? 'scale-[1.6]' : 'scale-125'}`} aria-hidden>
                                {item.icon}
                            </span>
                        </Link>
                    ))}
            <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="flex h-14 w-14 items-center justify-center rounded-xl text-4xl transition hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={collapsed ? 'Afficher la navigation' : 'Masquer la navigation'}
                title={collapsed ? 'Afficher la navigation' : 'Masquer la navigation'}
            >
                <span id="collapse_nav" className="block scale-125 leading-none" aria-hidden>
                    {collapsed ? '▶' : '◀'}
                </span>
            </button>
        </div>
    );
}
