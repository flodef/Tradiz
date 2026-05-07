import { Currency, Discount } from '@/app/utils/interfaces';
import SectionCard from '../SectionCard';
import { useState, useEffect } from 'react';
import AdminButton from '../AdminButton';
import { IconGripVertical } from '@tabler/icons-react';
import DeleteButton from '../DeleteButton';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { adminTextStyle } from '@/app/utils/constants';

export default function DiscountsConfig({
    config,
    onChange,
    onSave,
    hasChanges = false,
    currencies,
    isReadOnly = false,
}: {
    config: Discount[];
    onChange: (data: Discount[]) => void;
    onSave: (data: Discount[]) => void;
    hasChanges?: boolean;
    currencies: Currency[];
    isReadOnly?: boolean;
}) {
    const [discounts, setDiscounts] = useState(config || []);

    useEffect(() => {
        setDiscounts(config || []);
    }, [config]);

    const handleDiscountChange = (index: number, updatedDiscount: Discount) => {
        const newDiscounts = [...discounts];
        newDiscounts[index] = updatedDiscount;
        setDiscounts(newDiscounts);
        onChange(newDiscounts);
    };

    const handleAddDiscount = () => {
        const newDiscount: Discount = { amount: 0, unit: '%' };
        const updated = [...discounts, newDiscount];
        setDiscounts(updated);
        onChange(updated);
    };

    const handleDeleteDiscount = (index: number) => {
        const updated = discounts.filter((_, i) => i !== index);
        setDiscounts(updated);
        onChange(updated);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = discounts.findIndex((_, i) => i === Number(active.id));
        const newIndex = discounts.findIndex((_, i) => i === Number(over.id));
        const reordered = arrayMove(discounts, oldIndex, newIndex);
        setDiscounts(reordered);
        onChange(reordered);
    };

    const sensors = useSensors(useSensor(PointerSensor));
    const units = ['%', ...currencies.map((c) => c.symbol)];

    function SortableRow({ discount, index, isReadOnly }: { discount: Discount; index: number; isReadOnly: boolean }) {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
            id: index,
        });
        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
        };

        return (
            <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
                {!isReadOnly && (
                    <td className="p-2 text-center cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
                        <IconGripVertical size={18} className="mx-auto text-gray-400" />
                    </td>
                )}
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{discount.amount}</div>
                    ) : (
                        <input
                            type="number"
                            value={discount.amount}
                            onChange={(e) =>
                                handleDiscountChange(index, {
                                    ...discount,
                                    amount: Number(e.target.value),
                                })
                            }
                            min={0}
                            step={discount.unit === '%' ? 0.5 : 0.01}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{discount.unit}</div>
                    ) : (
                        <select
                            value={discount.unit}
                            onChange={(e) =>
                                handleDiscountChange(index, {
                                    ...discount,
                                    unit: e.target.value,
                                })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {units.map((u) => (
                                <option key={u} value={u}>
                                    {u}
                                </option>
                            ))}
                        </select>
                    )}
                </td>
                {!isReadOnly && (
                    <td className="p-2 text-center">
                        <DeleteButton onClick={() => handleDeleteDiscount(index)} />
                    </td>
                )}
            </tr>
        );
    }

    return (
        <SectionCard title="Réductions" onSave={isReadOnly || !hasChanges ? undefined : () => onSave(discounts)}>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                            {!isReadOnly && <th className={adminTextStyle + ' w-12'}></th>}
                            <th className={adminTextStyle}>Montant</th>
                            <th className={adminTextStyle + ' w-32'}>Unité</th>
                            {!isReadOnly && <th className="w-24"></th>}
                        </tr>
                    </thead>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={discounts.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                            <tbody>
                                {discounts.map((discount, index) => (
                                    <SortableRow
                                        key={index}
                                        discount={discount}
                                        index={index}
                                        isReadOnly={isReadOnly}
                                    />
                                ))}
                            </tbody>
                        </SortableContext>
                    </DndContext>
                </table>
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddDiscount}>
                    Ajouter une réduction
                </AdminButton>
            )}
        </SectionCard>
    );
}
