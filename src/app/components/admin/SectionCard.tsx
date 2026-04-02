'use client';

import { ReactNode, useState } from 'react';
import { TickIcon } from '@/app/images/TickIcon';
import { useIsMobile } from '@/app/utils/mobile';
import AdminButton from './AdminButton';

interface SectionCardProps {
    title: string;
    children: ReactNode;
    onSave?: () => void;
    saveDisabled?: boolean;
    defaultOpen?: boolean;
    headerExtra?: ReactNode;
}

export default function SectionCard({
    title,
    children,
    onSave,
    saveDisabled = false,
    defaultOpen = true,
    headerExtra,
}: SectionCardProps) {
    const [open, setOpen] = useState(defaultOpen);
    const isMobile = useIsMobile();

    return (
        <div className="bg-white/30 dark:bg-black/20 shadow-lg rounded-lg mb-6 border border-black/10 dark:border-white/10 backdrop-blur overflow-hidden">
            <div className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
                <div className="flex justify-between items-center px-6 py-4">
                    <div className="flex items-center gap-2">
                        <svg
                            className={`w-5 h-5 transition-transform duration-200 ${open ? 'rotate-90' : 'rotate-0'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <h2 className="text-2xl font-semibold text-light dark:text-dark">{title}</h2>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {open && headerExtra && <div className="hidden md:flex items-center gap-2">{headerExtra}</div>}
                        {open && onSave && (
                            <AdminButton
                                variant="save"
                                disabled={saveDisabled}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSave();
                                }}
                                className={isMobile ? 'px-3 py-2' : ''}
                            >
                                {isMobile ? <TickIcon className="w-5 h-5" /> : 'Enregistrer'}
                            </AdminButton>
                        )}
                    </div>
                </div>
                {open && headerExtra && (
                    <div className="md:hidden px-6 pb-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                        {headerExtra}
                    </div>
                )}
            </div>
            {open && (
                <div className="px-6 pb-6 pt-2 border-t border-black/10 dark:border-white/10 space-y-4">{children}</div>
            )}
        </div>
    );
}
