'use client';

import TopNav from '@/app/components/admin/TopNav';
import { CloseButton } from '@/app/components/CloseButton';
import { OfflineBanner } from '@/app/components/OfflineBanner';
import { useUnsavedChanges } from '@/app/hooks/useUnsavedChanges';
import { useUserRole } from '@/app/hooks/useUserRole';
import { useLocalStorage } from '@/app/utils/localStorage';
import { IconAlertTriangle, IconLoader2, IconX } from '@tabler/icons-react';
import { ReactNode, useState } from 'react';

interface AdminPageLayoutProps {
    title: string;
    children: ReactNode;
    action?: ReactNode;
    hasChanges?: boolean;
    onSave?: () => Promise<void> | void;
}

export default function AdminPageLayout({ title, children, action, hasChanges = false, onSave }: AdminPageLayoutProps) {
    const { confirmUnsavedChanges } = useUnsavedChanges();
    const { isRoleResolved } = useUserRole();
    const [navCollapsed, setNavCollapsed] = useState(true);
    const [closing, setClosing] = useState(false);
    // Set by DataProvider's auto-close sweep when the server refuses a daily
    // closure — a day without a Z-ticket must stay visible until resolved.
    // Dismissing clears the flag; a later refused sweep sets it again.
    const [blockedClosure, setBlockedClosure] = useLocalStorage<{ day: string; code: string; at: number } | null>(
        'autoCloseBlocked',
        null
    );

    const handleClose = () => {
        // No unsaved changes → navigates immediately; show the spinner like
        // TopNav's pending state (the POS takes a few seconds to load).
        if (!hasChanges) setClosing(true);
        confirmUnsavedChanges(hasChanges, onSave, '/');
    };

    return (
        <div className="min-h-screen bg-linear-to-tr from-main-from-light to-main-to-light dark:from-main-from-dark dark:to-main-to-dark text-writing-light dark:text-writing-dark">
            <OfflineBanner />
            <div
                className="sticky top-0 z-40 flex items-center border-b border-black/10 dark:border-white/10 bg-white/30 dark:bg-black/30 backdrop-blur px-2 py-1 min-h-14"
                style={{ position: 'sticky' }}
            >
                <div className="shrink-0 z-10">
                    {isRoleResolved && (
                        <TopNav
                            inline
                            hasChanges={hasChanges}
                            onSave={onSave}
                            onCollapsedStateChange={setNavCollapsed}
                        />
                    )}
                </div>
                <h1
                    className={`absolute inset-x-0 text-center text-3xl font-bold leading-tight wrap-break-word line-clamp-2 px-16 pointer-events-none ${!navCollapsed ? 'md:block hidden' : ''}`}
                >
                    {title}
                </h1>
                <div className="ml-auto shrink-0 z-10">
                    {action ??
                        (closing ? (
                            <IconLoader2 size={32} className="m-3 animate-spin" aria-label="Fermeture en cours" />
                        ) : (
                            <CloseButton
                                onClose={handleClose}
                                size="xl"
                                className="cursor-pointer active:bg-transparent dark:active:bg-transparent"
                            />
                        ))}
                </div>
            </div>
            {blockedClosure && (
                <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                    <IconAlertTriangle size={18} className="shrink-0" />
                    <span className="flex-1">
                        La clôture automatique du {blockedClosure.day} a été refusée
                        {blockedClosure.code === 'PENDING_DRAFTS'
                            ? ' — des transactions sont encore en cours ce jour-là.'
                            : '.'}{' '}
                        Finalisez-les puis clôturez la journée depuis la caisse.
                    </span>
                    <button
                        onClick={() => setBlockedClosure(null)}
                        className="cursor-pointer rounded p-1 hover:bg-amber-200/60 dark:hover:bg-amber-800/40"
                        aria-label="Masquer"
                    >
                        <IconX size={16} />
                    </button>
                </div>
            )}
            <div className="container mx-auto p-4">{children}</div>
        </div>
    );
}
