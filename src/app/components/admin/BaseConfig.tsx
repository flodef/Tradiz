'use client';

import { ReactNode } from 'react';
import SectionCard from './SectionCard';

export interface BaseConfigProps<T> {
    title: string;
    config: T;
    onChange: (data: T) => void;
    onSave?: (data: T) => void;
    onCancel?: () => void;
    hasChanges: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon: ReactNode;
    isValid?: boolean;
    addLabel?: string;
    onAdd?: () => void;
    saveDisabled?: boolean;
    headerExtra?: ReactNode;
    children: ReactNode;
}

export default function BaseConfig<T>({
    title,
    config,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
    isOpen = false,
    onToggle,
    icon,
    isValid = true,
    addLabel = 'Ajouter',
    onAdd,
    saveDisabled = false,
    headerExtra,
    children,
}: BaseConfigProps<T> & { _onChange?: (data: T) => void }) {
    return (
        <SectionCard
            title={title}
            onSave={onSave ? () => onSave(config) : undefined}
            onCancel={onCancel}
            hasChanges={hasChanges}
            isReadOnly={isReadOnly}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            icon={icon}
            isValid={isValid}
            addLabel={addLabel}
            onAdd={onAdd || (() => {})}
            saveDisabled={saveDisabled}
            headerExtra={headerExtra}
        >
            {children}
        </SectionCard>
    );
}
