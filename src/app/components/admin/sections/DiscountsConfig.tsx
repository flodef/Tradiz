import { adminHeaderStyle } from '@/app/utils/constants';
import { Currency, Discount } from '@/app/utils/interfaces';
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
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
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
    amountInputRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
    lastAddedIndexRef: React.MutableRefObject<number | null>;
    index: number;
}

const SortableRow = memo(function SortableRow({
    discount,
    isReadOnly,
    units,
    onAmountChange,
    onUnitChange,
    onDelete,
    amountInputRefs,
    lastAddedIndexRef,
    index,
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
                    value={String(discount.amount)}
                    onChange={(value) => onAmountChange(discount._id, Number(value))}
                    validation={(value) => Number(value) > 0}
                    min={0}
                    ref={(el) => {
                        if (el) {
                            amountInputRefs.current.set(index, el);
                            if (lastAddedIndexRef.current === index) {
                                el.focus();
                                lastAddedIndexRef.current = null;
                            }
                        } else {
                            amountInputRefs.current.delete(index);
                        }
                    }}
                    step={discount.unit === '%' ? 0.5 : 0.01}
                    isReadOnly={isReadOnly}
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={discount.unit}
                    onChange={(e) => onUnitChange(discount._id, e.target.value)}
                    options={units.map((u) => ({ value: u, label: u }))}
                    isReadOnly={isReadOnly}
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
    isOpen,
    onToggle,
    icon,
}: {
    config: Discount[];
    onChange: (data: Discount[]) => void;
    onSave?: (data: Discount[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    currencies: Currency[];
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}) {
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const lastAddedIndexRef = useRef<number | null>(null);
    const amountInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
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

    const isValid = discounts.every((d) => d.amount !== null && d.amount !== undefined && d.amount > 0);

    const handleAddDiscount = useCallback(() => {
        setDiscounts((prev) => {
            const updated = [...prev, { amount: 0, unit: '%', _id: nextIdRef.current++ }];
            lastAddedIndexRef.current = updated.length - 1;
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

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
                distance: 10,
            },
        })
    );
    const units = React.useMemo(() => ['%', ...currencies.map((c) => c.symbol)], [currencies]);

    return (
        <SectionCard
            title="Réductions"
            onSave={onSave ? () => onSave(discounts.map(({ _id: _, ...rest }) => rest)) : undefined}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            hasChanges={hasChanges}
            icon={icon}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            onAdd={handleAddDiscount}
            isValid={isValid}
            saveDisabled={!isValid}
            addLabel="Ajouter une réduction"
            isReadOnly={isReadOnly}
        >
            {discounts.length > 0 && (
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
                                    {discounts.map((discount, index) => (
                                        <SortableRow
                                            key={discount._id}
                                            discount={discount}
                                            isReadOnly={isReadOnly}
                                            units={units}
                                            onAmountChange={handleAmountChange}
                                            onUnitChange={handleUnitChange}
                                            onDelete={handleDeleteDiscount}
                                            amountInputRefs={amountInputRefs}
                                            lastAddedIndexRef={lastAddedIndexRef}
                                            index={index}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </SectionCard>
    );
}
