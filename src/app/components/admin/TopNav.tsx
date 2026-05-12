'use client';

import { useConfig } from '@/app/hooks/useConfig';
import { usePopup } from '@/app/hooks/usePopup';
import { useUserRole } from '@/app/hooks/useUserRole';
import { IconChevronLeft, IconChevronRight, IconPencil, IconChartPie, IconSettings } from '@tabler/icons-react';
import { USE_DIGICARTE } from '@/app/utils/constants';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';

type NavItem = {
    id: string;
    href: string;
    label: string;
    icon: ReactNode;
    hidden?: boolean;
};

interface TopNavProps {
    inline?: boolean;
    className?: string;
    onCollapsedChange?: (collapsed: boolean) => void;
    hasChanges?: boolean;
}

export default function TopNav({ inline = false, className, onCollapsedChange, hasChanges = false }: TopNavProps) {
    const [collapsed, setCollapsed] = useState(true);
    const { isGrafanaAccessEnabled } = useConfig();
    const { isAdmin, isCashier } = useUserRole();
    const { openFullscreenPopup } = usePopup();
    const pathname = usePathname();
    const router = useRouter();

    const navItems = useMemo<NavItem[]>(
        () => [
            {
                id: 'cash_register',
                href: '/admin/kitchen/config/',
                label: 'Configuration',
                icon: <IconSettings size={28} />,
                hidden: !isAdmin, // Admin only
            },
            {
                id: 'edit_menu',
                href: '/admin/edit_menu/',
                label: 'Edition menu',
                icon: <IconPencil size={28} />,
                hidden: !isCashier, // Admin and Cashier
            },
            {
                id: 'kpi',
                href: USE_DIGICARTE ? '/stats/d/vue-dc-1/vue-dc' : '/stats',
                label: 'Statistiques',
                icon: <IconChartPie size={28} />,
                hidden: !isCashier || !isGrafanaAccessEnabled, // Admin and Cashier
            },
        ],
        [isGrafanaAccessEnabled, isAdmin, isCashier]
    );

    const handleToggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        onCollapsedChange?.(next);
    };

    const baseClass = inline
        ? 'flex items-center gap-1 rounded-2xl border border-black/10 bg-white/85 p-1 shadow-md backdrop-blur dark:border-white/10 dark:bg-black/45 shrink-0'
        : 'fixed top-3 left-3 z-50 flex items-center gap-2 rounded-2xl border border-black/10 bg-white/85 p-1 shadow-md backdrop-blur dark:border-white/10 dark:bg-black/45';

    return (
        <div id="nav" className={twMerge(baseClass, className)}>
            {!collapsed && (
                <>
                    {navItems
                        .filter((item) => !item.hidden)
                        .map((item) => {
                            const isActive =
                                pathname === item.href || pathname.startsWith(item.href.replace(/\/$/, ''));
                            if (isActive) {
                                return (
                                    <span
                                        key={item.id}
                                        className="flex h-12 w-12 items-center justify-center rounded-xl opacity-40 cursor-default"
                                        aria-label={item.label}
                                        title={item.label}
                                    >
                                        {item.icon}
                                    </span>
                                );
                            }
                            const handleClick = (e: React.MouseEvent) => {
                                if (hasChanges) {
                                    e.preventDefault();
                                    openFullscreenPopup(
                                        'Des modifications non enregistrées vont être perdues. Que souhaitez-vous faire ?',
                                        ['Enregistrer', 'Annuler', 'Quitter sans enregistrer'],
                                        (index) => {
                                            if (index === 0) {
                                                // Save - navigate after save handled by parent
                                                router.push(item.href);
                                            } else if (index === 2) {
                                                // Leave without saving
                                                router.push(item.href);
                                            }
                                            // index 1 = Cancel, do nothing
                                        }
                                    );
                                }
                            };

                            return (
                                <Link
                                    id={item.id}
                                    key={item.id}
                                    href={item.href}
                                    onClick={handleClick}
                                    className="flex h-12 w-12 items-center justify-center rounded-xl transition hover:bg-black/5 dark:hover:bg-white/10"
                                    aria-label={item.label}
                                    title={item.label}
                                >
                                    {item.icon}
                                </Link>
                            );
                        })}
                </>
            )}
            <button
                type="button"
                onClick={handleToggle}
                className="flex h-12 w-12 items-center justify-center rounded-xl text-3xl transition hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={collapsed ? 'Afficher la navigation' : 'Masquer la navigation'}
                title={collapsed ? 'Afficher la navigation' : 'Masquer la navigation'}
            >
                {collapsed ? <IconChevronRight size={24} aria-hidden /> : <IconChevronLeft size={24} aria-hidden />}
            </button>
        </div>
    );
}
