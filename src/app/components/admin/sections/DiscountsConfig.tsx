import { adminHeaderStyle } from '@/app/utils/constants';
import { Currency, Discount } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

interface InternalDiscount extends Discount {
    _id: number;
}

interface SortableRowProps {
    discount: InternalDiscount;
    isReadOnly: boolean;
    units: string[];
    onAmountChange: (id: number, amount: number) => void;
    onUnitChange: (id: number, unit: string) => void;
    onDelete: (id: number) => void;
}

const SortableRow = memo(function SortableRow({
    discount,
    isReadOnly,
    units,
    onAmountChange,
    onUnitChange,
    onDelete,
}: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: discount._id,
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
                <ValidatedInput
                    type="number"
                    value={discount.amount}
                    onChange={(value) => onAmountChange(discount._id, Number(value))}
                    min={0}
                    step={discount.unit === '%' ? 0.5 : 0.01}
                    disabled={isReadOnly}
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={discount.unit}
                    onChange={(e) => onUnitChange(discount._id, e.target.value)}
                    options={units.map((u) => ({ value: u, label: u }))}
                    disabled={isReadOnly}
                />
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={() => onDelete(discount._id)} />
        </tr>
    );
});

export default function DiscountsConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    currencies,
    isReadOnly = false,
    isLoading = false,
}: {
    config: Discount[];
    onChange: (data: Discount[]) => void;
    onSave: (data: Discount[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    currencies: Currency[];
    isReadOnly?: boolean;
    isLoading?: boolean;
}) {
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [discounts, setDiscounts] = useState<InternalDiscount[]>(() =>
        (config || []).map((d) => ({ ...d, _id: nextIdRef.current++ }))
    );

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setDiscounts((config || []).map((d) => ({ ...d, _id: nextIdRef.current++ })));
    }, [config]);

    const notifyParent = useCallback(
        (items: InternalDiscount[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(items.map(({ _id: _, ...rest }) => rest));
            }, 300);
        },
        [onChange]
    );

    const handleAmountChange = useCallback(
        (id: number, amount: number) => {
            setDiscounts((prev) => {
                const updated = prev.map((d) => (d._id === id ? { ...d, amount } : d));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleUnitChange = useCallback(
        (id: number, unit: string) => {
            setDiscounts((prev) => {
                const updated = prev.map((d) => (d._id === id ? { ...d, unit } : d));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddDiscount = useCallback(() => {
        setDiscounts((prev) => {
            const updated = [...prev, { amount: 0, unit: '%', _id: nextIdRef.current++ }];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent]);

    const handleDeleteDiscount = useCallback(
        (id: number) => {
            setDiscounts((prev) => {
                const updated = prev.filter((d) => d._id !== id);
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
            setDiscounts((prev) => {
                const oldIdx = prev.findIndex((d) => d._id === active.id);
                const newIdx = prev.findIndex((d) => d._id === over.id);
                if (oldIdx === -1 || newIdx === -1) return prev;
                const reordered = arrayMove(prev, oldIdx, newIdx);
                notifyParent(reordered);
                return reordered;
            });
        },
        [notifyParent]
    );

    const sensors = useSensors(useSensor(PointerSensor));
    const units = React.useMemo(() => ['%', ...currencies.map((c) => c.symbol)], [currencies]);

    return (
        <SectionCard
            title="Réductions"
            onSave={isReadOnly || !hasChanges ? undefined : () => onSave(discounts.map(({ _id: _, ...rest }) => rest))}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            isLoading={isLoading}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={discounts.map((d) => d._id)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="w-12"></th>}
                                    <th className={adminHeaderStyle + ' min-w-24'}>Montant</th>
                                    <th className={adminHeaderStyle + ' min-w-16 w-16'}>Unité</th>
                                    {!isReadOnly && <th className="w-16"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {discounts.map((discount) => (
                                    <SortableRow
                                        key={discount._id}
                                        discount={discount}
                                        isReadOnly={isReadOnly}
                                        units={units}
                                        onAmountChange={handleAmountChange}
                                        onUnitChange={handleUnitChange}
                                        onDelete={handleDeleteDiscount}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddDiscount}>
                    Ajouter une réduction
                </AdminButton>
            )}
        </SectionCard>
    );
}
