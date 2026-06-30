'use client';

import { ReactNode, useState } from 'react';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useIsMobile } from '@/app/utils/mobile';
import AdminButton from './AdminButton';
import { twMerge } from 'tailwind-merge';

interface SectionCardProps {
    title: string;
    children: ReactNode;
    onSave?: () => void;
    saveDisabled?: boolean;
    onCancel?: () => void;
    defaultOpen?: boolean;
    headerExtra?: ReactNode;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: ReactNode;
    onAdd?: () => void;
    isValid?: boolean;
    addLabel?: string;
    isReadOnly?: boolean;
}

export default function SectionCard({
    title,
    children,
    onSave,
    saveDisabled = false,
    onCancel,
    defaultOpen = true,
    headerExtra,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
    onAdd,
    isValid = true,
    addLabel = 'Ajouter',
    isReadOnly = false,
}: SectionCardProps) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const open = isOpen !== undefined ? isOpen : internalOpen;
    const isMobile = useIsMobile();

    return (
        <div className="bg-white/30 dark:bg-black/20 shadow-lg rounded-lg mb-6 border border-black/10 dark:border-white/10 backdrop-blur overflow-hidden">
            <div
                className="cursor-pointer select-none"
                onClick={() => (onToggle ? onToggle() : setInternalOpen((o) => !o))}
            >
                <div className="flex justify-between items-start px-6 py-4 gap-4">
                    <div className="flex items-center gap-2">
                        <svg
                            className={`w-5 h-5 transition-transform duration-200 ${open ? 'rotate-90' : 'rotate-0'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {icon && <div className="text-light dark:text-dark">{icon}</div>}
                        <h2 className="text-2xl font-semibold text-light dark:text-dark">{title}</h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {open && headerExtra}
                        {open && (onSave || onCancel) && (
                            <div className="flex items-center gap-2">
                                {!isLoading && onCancel && (
                                    <AdminButton
                                        variant="secondary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCancel();
                                        }}
                                        className={twMerge('cursor-pointer', isMobile ? 'px-3 py-1.5' : 'px-3 py-1')}
                                    >
                                        {isMobile ? <IconX size={20} stroke={3} /> : 'Annuler'}
                                    </AdminButton>
                                )}
                                {onSave && (
                                    <AdminButton
                                        variant="save"
                                        disabled={saveDisabled}
                                        isLoading={isLoading}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSave();
                                        }}
                                        className={twMerge('cursor-pointer', isMobile ? 'px-3 py-1.5' : 'px-3 py-1')}
                                    >
                                        {isMobile ? <IconCheck size={20} stroke={3} /> : 'Enregistrer'}
                                    </AdminButton>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {open && (
                <div className="px-6 pb-6 pt-2 border-t border-black/10 dark:border-white/10 space-y-4">
                    {children}
                    {onAdd && !isReadOnly && (
                        <AdminButton variant="add" onClick={onAdd} disabled={!isValid}>
                            {addLabel}
                        </AdminButton>
                    )}
                </div>
            )}
        </div>
    );
}
