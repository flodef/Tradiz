import { adminHeaderStyle } from '@/app/utils/constants';
import { Currency, Discount } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import DeleteButton from '../DeleteButton';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

export default function DiscountsConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    currencies,
    isReadOnly = false,
}: {
    config: Discount[];
    onChange: (data: Discount[]) => void;
    onSave: (data: Discount[]) => void;
    onCancel?: () => void;
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
                    <ValidatedInput
                        type="number"
                        value={discount.amount}
                        onChange={(value) =>
                            handleDiscountChange(index, {
                                ...discount,
                                amount: Number(value),
                            })
                        }
                        min={0}
                        step={discount.unit === '%' ? 0.5 : 0.01}
                        disabled={isReadOnly}
                    />
                </td>
                <td className="p-2">
                    <AdminSelect
                        value={discount.unit}
                        onChange={(e) =>
                            handleDiscountChange(index, {
                                ...discount,
                                unit: e.target.value,
                            })
                        }
                        options={units.map((u) => ({ value: u, label: u }))}
                        disabled={isReadOnly}
                    />
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
        <SectionCard
            title="Réductions"
            onSave={isReadOnly || !hasChanges ? undefined : () => onSave(discounts)}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={discounts.map((_, i) => i)} strategy={verticalListSortingStrategy}>
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
                                        key={index}
                                        discount={discount}
                                        index={index}
                                        isReadOnly={isReadOnly}
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
