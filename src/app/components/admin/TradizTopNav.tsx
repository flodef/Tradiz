'use client';

import Link from 'next/link';
import { ReactNode, useMemo, useState } from 'react';
import { useConfig } from '@/app/hooks/useConfig';
import { ChevronRightIcon } from '@/app/images/ChevronRightIcon';
import { ChevronLeftIcon } from '@/app/images/ChevronLeftIcon';
import { SettingsIcon } from '@/app/images/SettingsIcon';
import { PencilIcon } from '@/app/images/PencilIcon';
import { PieChartIcon } from '@/app/images/PieChartIcon';

type NavItem = {
    id: string;
    href: string;
    label: string;
    icon: ReactNode;
    hidden?: boolean;
};

export default function TradizTopNav() {
    const [collapsed, setCollapsed] = useState(true);
    const { isGrafanaAccessEnabled } = useConfig();

    const navItems = useMemo<NavItem[]>(
        () => [
            {
                id: 'cash_register',
                href: '/admin/kitchen/config/',
                label: 'Configuration',
                icon: <SettingsIcon className="h-7 w-7" />,
            },
            {
                id: 'edit_menu',
                href: '/admin/edit_menu/',
                label: 'Edition menu',
                icon: <PencilIcon className="h-7 w-7" />,
            },
            {
                id: 'kpi',
                href: '/stats',
                label: 'Statistiques',
                icon: <PieChartIcon className="h-7 w-7" />,
                hidden: !isGrafanaAccessEnabled,
            },
        ],
        [isGrafanaAccessEnabled]
    );

    return (
        <div
            id="nav"
            className="fixed top-3 left-3 z-50 flex items-center gap-2 rounded-2xl border border-black/10 bg-white/85 p-1 shadow-md backdrop-blur dark:border-white/10 dark:bg-black/45"
        >
            {!collapsed &&
                navItems
                    .filter((item) => !item.hidden)
                    .map((item) => (
                        <Link
                            id={item.id}
                            key={item.id}
                            href={item.href}
                            className="flex h-12 w-12 items-center justify-center rounded-xl transition hover:bg-black/5 dark:hover:bg-white/10"
                            aria-label={item.label}
                            title={item.label}
                        >
                            {item.icon}
                        </Link>
                    ))}
            <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="flex h-12 w-12 items-center justify-center rounded-xl text-3xl transition hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={collapsed ? 'Afficher la navigation' : 'Masquer la navigation'}
                title={collapsed ? 'Afficher la navigation' : 'Masquer la navigation'}
            >
                {collapsed ? (
                    <ChevronRightIcon className="h-6 w-6" aria-hidden />
                ) : (
                    <ChevronLeftIcon className="h-6 w-6" aria-hidden />
                )}
            </button>
        </div>
    );
}
