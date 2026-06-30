'use client';

import { adminHeaderStyle } from '@/app/utils/constants';
import { Company, Customer } from '@/app/utils/interfaces';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { usePopup } from '@/app/hooks/usePopup';
import AdminButton from '../AdminButton';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

interface InternalCompany extends Company {
    _id: number;
}

interface SortableRowProps {
    company: InternalCompany;
    isReadOnly: boolean;
    canDelete: boolean;
    onFieldChange: (id: number, field: keyof Company, value: string | number) => void;
    onDelete: (id: number) => void;
}

const SortableRow = memo(function SortableRow({
    company,
    isReadOnly,
    canDelete,
    onFieldChange,
    onDelete,
}: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: company._id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
            <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{company.name}</div>
                ) : (
                    <ValidatedInput
                        type="text"
                        value={company.name}
                        onChange={(value) => onFieldChange(company._id, 'name', String(value))}
                        validation={(value) => String(value).trim().length > 0}
                    />
                )}
            </td>
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{company.quotaShare} €</div>
                ) : (
                    <ValidatedInput
                        type="number"
                        value={company.quotaShare}
                        onChange={(value) => onFieldChange(company._id, 'quotaShare', Number(value))}
                        min={0}
                        max={100}
                        step={0.01}
                        className="w-24"
                        validation={(value) => Number(value) > 0}
                    />
                )}
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={() => onDelete(company._id)} canDelete={canDelete} />
        </tr>
    );
});

export default function CompaniesConfig({
    config,
    onChange,
    onSave,
    onCancel,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
    customers,
    onValidation,
}: {
    config: Company[];
    onChange: (data: Company[]) => void;
    onSave?: (data: Company[]) => void;
    onCancel?: () => void;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
    customers?: Customer[];
    onValidation?: (isValid: boolean) => void;
}) {
    const { openFullscreenPopup } = usePopup();
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [companies, setCompanies] = useState<InternalCompany[]>(() =>
        (config || []).map((c) => ({ ...c, _id: nextIdRef.current++ }))
    );
    // Store original config to track changes against
    const [originalConfig, setOriginalConfig] = useState<Company[]>(config || []);

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        const incoming = config || [];
        setCompanies(incoming.map((c) => ({ ...c, _id: nextIdRef.current++ })));
        setOriginalConfig(incoming);
    }, [config]);

    const strip = useCallback((items: InternalCompany[]): Company[] => items.map(({ _id: _, ...rest }) => rest), []);

    // Check if all companies have valid name and quotaShare
    const isValid = companies.every((company) => company.name?.trim() && company.quotaShare > 0);

    // Notify parent of validation state
    useEffect(() => {
        onValidation?.(isValid);
    }, [isValid, onValidation]);

    // Track changes
    const hasChanges = JSON.stringify(strip(companies)) !== JSON.stringify(originalConfig);

    const notifyParent = useCallback(
        (items: InternalCompany[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(items));
            }, 300);
        },
        [onChange, strip]
    );

    const handleFieldChange = useCallback(
        (id: number, field: keyof Company, value: string | number) => {
            setCompanies((prev) => {
                const updated = prev.map((c) => (c._id === id ? { ...c, [field]: value } : c));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddCompany = useCallback(() => {
        setCompanies((prev) => {
            const updated = [...prev, { name: '', quotaShare: 0, _id: nextIdRef.current++ }];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent]);

    const handleDeleteCompany = useCallback(
        (id: number) => {
            const companyToDelete = companies.find((c) => c._id === id);
            if (!companyToDelete) return;

            // Check if any customers are associated with this company
            const hasAssociatedCustomers = customers && customers.some((c) => c.company === companyToDelete.name);

            if (hasAssociatedCustomers) {
                openFullscreenPopup(
                    `Cette entreprise a des clients associés. Si vous la supprimez, ces clients perdront leur entreprise. Voulez-vous continuer ?`,
                    ['Oui', 'Non'],
                    (index) => {
                        if (index === 0) {
                            setCompanies((prev) => {
                                const updated = prev.filter((c) => c._id !== id);
                                notifyParent(updated);
                                return updated;
                            });
                        }
                    }
                );
            } else {
                setCompanies((prev) => {
                    const updated = prev.filter((c) => c._id !== id);
                    notifyParent(updated);
                    return updated;
                });
            }
        },
        [companies, customers, notifyParent, openFullscreenPopup]
    );

    const handleSave = useCallback(() => {
        if (onSave) {
            onSave(strip(companies));
            setOriginalConfig(strip(companies));
        }
    }, [companies, onSave, strip]);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setCompanies((prev) => {
                const oldIdx = prev.findIndex((c) => c._id === active.id);
                const newIdx = prev.findIndex((c) => c._id === over.id);
                if (oldIdx === -1 || newIdx === -1) return prev;
                const reordered = arrayMove(prev, oldIdx, newIdx);
                notifyParent(reordered);
                return reordered;
            });
        },
        [notifyParent]
    );

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
                distance: 10,
            },
        })
    );

    return (
        <SectionCard
            title="Entreprises"
            onSave={isReadOnly || !hasChanges || !onSave || isLoading ? undefined : handleSave}
            onCancel={isReadOnly || !hasChanges || isLoading ? undefined : onCancel}
            icon={icon}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={companies.map((c) => c._id)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            {companies.length > 0 && (
                                <thead>
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        {!isReadOnly && <th className="w-12"></th>}
                                        <th className={adminHeaderStyle}>Nom</th>
                                        <th className={adminHeaderStyle + ' w-32'}>Quote Part (€)</th>
                                        {!isReadOnly && <th className="w-16"></th>}
                                    </tr>
                                </thead>
                            )}
                            <tbody>
                                {companies.map((company) => (
                                    <SortableRow
                                        key={company._id}
                                        company={company}
                                        isReadOnly={isReadOnly}
                                        canDelete={companies.length > 0}
                                        onFieldChange={handleFieldChange}
                                        onDelete={handleDeleteCompany}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCompany}>
                    Ajouter une entreprise
                </AdminButton>
            )}
        </SectionCard>
    );
}
