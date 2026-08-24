'use client';

import TopNav from '@/app/components/admin/TopNav';
import { CloseButton } from '@/app/components/CloseButton';
import { OfflineBanner } from '@/app/components/OfflineBanner';
import { useUnsavedChanges } from '@/app/hooks/useUnsavedChanges';
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
    const [navCollapsed, setNavCollapsed] = useState(true);

    const handleClose = () => {
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
                    <TopNav inline hasChanges={hasChanges} onSave={onSave} onCollapsedStateChange={setNavCollapsed} />
                </div>
                <h1
                    className={`absolute inset-x-0 text-center text-3xl font-bold leading-tight wrap-break-word line-clamp-2 px-16 pointer-events-none ${!navCollapsed ? 'md:block hidden' : ''}`}
                >
                    {title}
                </h1>
                <div className="ml-auto shrink-0 z-10">
                    {action ?? (
                        <CloseButton
                            onClose={handleClose}
                            size="xl"
                            className="cursor-pointer active:bg-transparent dark:active:bg-transparent"
                        />
                    )}
                </div>
            </div>
            <div className="container mx-auto p-4">{children}</div>
        </div>
    );
}
