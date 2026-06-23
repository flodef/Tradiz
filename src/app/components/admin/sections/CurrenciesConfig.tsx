'use client';

import { adminHeaderStyle } from '@/app/utils/constants';
import { Currency } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import AdminButton from '../AdminButton';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

interface InternalCurrency extends Currency {
    _id: number;
}

interface SortableRowProps {
    currency: InternalCurrency;
    isReadOnly: boolean;
    canDelete: boolean;
    onFieldChange: (id: number, field: keyof Currency, value: string | number) => void;
    onDelete: (id: number) => void;
}

const SortableRow = memo(function SortableRow({
    currency,
    isReadOnly,
    canDelete,
    onFieldChange,
    onDelete,
}: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: currency._id,
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
                    <div className="text-sm">{currency.label}</div>
                ) : (
                    <ValidatedInput
                        type="text"
                        value={currency.label}
                        onChange={(value) => onFieldChange(currency._id, 'label', String(value))}
                    />
                )}
            </td>
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{currency.symbol}</div>
                ) : (
                    <ValidatedInput
                        type="text"
                        value={currency.symbol}
                        onChange={(value) => onFieldChange(currency._id, 'symbol', String(value))}
                    />
                )}
            </td>
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{currency.maxValue}</div>
                ) : (
                    <ValidatedInput
                        type="number"
                        value={currency.maxValue}
                        onChange={(value) => onFieldChange(currency._id, 'maxValue', Number(value))}
                        min={0}
                    />
                )}
            </td>
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{currency.decimals}</div>
                ) : (
                    <ValidatedInput
                        type="number"
                        value={currency.decimals}
                        onChange={(value) => onFieldChange(currency._id, 'decimals', Number(value))}
                        min={0}
                        max={8}
                    />
                )}
            </td>
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{currency.rate}</div>
                ) : (
                    <ValidatedInput
                        type="number"
                        value={currency.rate}
                        onChange={(value) => onFieldChange(currency._id, 'rate', Number(value))}
                        min={0}
                        step={0.01}
                    />
                )}
            </td>
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{currency.fee}</div>
                ) : (
                    <ValidatedInput
                        type="number"
                        value={currency.fee}
                        onChange={(value) => onFieldChange(currency._id, 'fee', Number(value))}
                        min={0}
                        step={0.01}
                    />
                )}
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={() => onDelete(currency._id)} canDelete={canDelete} />
        </tr>
    );
});

export default function CurrenciesConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
}: {
    config: Currency[];
    onChange: (data: Currency[]) => void;
    onSave: (data: Currency[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}) {
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [currencies, setCurrencies] = useState<InternalCurrency[]>(() =>
        (config || []).map((c) => ({ ...c, _id: nextIdRef.current++ }))
    );

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setCurrencies((config || []).map((c) => ({ ...c, _id: nextIdRef.current++ })));
    }, [config]);

    const strip = (items: InternalCurrency[]): Currency[] => items.map(({ _id: _, ...rest }) => rest);

    const notifyParent = useCallback(
        (items: InternalCurrency[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(items));
            }, 300);
        },
        [onChange]
    );

    const handleFieldChange = useCallback(
        (id: number, field: keyof Currency, value: string | number) => {
            setCurrencies((prev) => {
                const updated = prev.map((c) => (c._id === id ? { ...c, [field]: value } : c));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddCurrency = useCallback(() => {
        setCurrencies((prev) => {
            const updated = [
                ...prev,
                { label: '', maxValue: 1000, symbol: '', decimals: 2, rate: 1, fee: 0, _id: nextIdRef.current++ },
            ];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent]);

    const handleDeleteCurrency = useCallback(
        (id: number) => {
            setCurrencies((prev) => {
                const updated = prev.filter((c) => c._id !== id);
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setCurrencies((prev) => {
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

    const sensors = useSensors(useSensor(PointerSensor));

    return (
        <SectionCard
            title="Devises"
            onSave={isReadOnly || !hasChanges ? undefined : () => onSave(strip(currencies))}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            icon={icon}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={currencies.map((c) => c._id)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="w-12"></th>}
                                    <th className={adminHeaderStyle + ' min-w-24'}>Label</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Symbole</th>
                                    <th className={adminHeaderStyle + ' min-w-32'}>Max</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Décimales</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Taux</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Frais (%)</th>
                                    {!isReadOnly && <th className="w-16"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {currencies.map((currency) => (
                                    <SortableRow
                                        key={currency._id}
                                        currency={currency}
                                        isReadOnly={isReadOnly}
                                        canDelete={currencies.length > 1}
                                        onFieldChange={handleFieldChange}
                                        onDelete={handleDeleteCurrency}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCurrency}>
                    Ajouter une devise
                </AdminButton>
            )}
        </SectionCard>
    );
}
