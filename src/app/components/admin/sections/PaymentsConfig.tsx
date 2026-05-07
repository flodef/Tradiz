import { Currency, PaymentMethod } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import { IconTrash, IconGripVertical } from '@tabler/icons-react';
import { PAYMENT_TYPES } from '@/app/utils/constants';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AvailabilityToggle from '../AvailabilityToggle';

export default function PaymentsConfig({
    config,
    onChange,
    onSave,
    currencies,
    isReadOnly = false,
}: {
    config: PaymentMethod[];
    onChange: (data: PaymentMethod[]) => void;
    onSave?: (data: PaymentMethod[]) => void;
    currencies: Currency[];
    isReadOnly?: boolean;
}) {
    const [payments, setPayments] = useState(config || []);

    useEffect(() => {
        setPayments(config || []);
    }, [config]);

    const handlePaymentChange = (index: number, updatedPayment: PaymentMethod) => {
        const newPayments = [...payments];
        newPayments[index] = updatedPayment;
        setPayments(newPayments);
        onChange(newPayments);
    };

    const handleAddPayment = () => {
        const newPayment: PaymentMethod = {
            type: 'Carte Bancaire',
            id: '',
            currency: '',
            availability: false,
        };
        const updated = [...payments, newPayment];
        setPayments(updated);
        onChange(updated);
    };

    const handleDeletePayment = (index: number) => {
        const newPayments = payments.filter((_, i) => i !== index);
        setPayments(newPayments);
        onChange(newPayments);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = payments.findIndex((_, i) => i === Number(active.id));
        const newIndex = payments.findIndex((_, i) => i === Number(over.id));
        const reordered = arrayMove(payments, oldIndex, newIndex);
        setPayments(reordered);
        onChange(reordered);
    };

    const sensors = useSensors(useSensor(PointerSensor));

    function SortableRow({
        payment,
        index,
        isReadOnly,
    }: {
        payment: PaymentMethod;
        index: number;
        isReadOnly: boolean;
    }) {
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
                        <div className="text-sm">{payment.type}</div>
                    ) : (
                        <select
                            value={payment.type}
                            onChange={(e) =>
                                handlePaymentChange(index, {
                                    ...payment,
                                    type: e.target.value,
                                })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {PAYMENT_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{payment.id}</div>
                    ) : (
                        <input
                            type="text"
                            value={payment.id || ''}
                            onChange={(e) =>
                                handlePaymentChange(index, {
                                    ...payment,
                                    id: e.target.value,
                                })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{payment.currency}</div>
                    ) : (
                        <select
                            value={payment.currency}
                            onChange={(e) =>
                                handlePaymentChange(index, {
                                    ...payment,
                                    currency: e.target.value,
                                })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {currencies.map(({ symbol }) => (
                                <option key={symbol} value={symbol}>
                                    {symbol}
                                </option>
                            ))}
                        </select>
                    )}
                </td>
                <td className="p-2 text-center">
                    <div className="flex justify-center">
                        <AvailabilityToggle
                            availability={payment.availability}
                            isReadOnly={isReadOnly}
                            onChange={(newValue) =>
                                handlePaymentChange(index, {
                                    ...payment,
                                    availability: newValue,
                                })
                            }
                        />
                    </div>
                </td>
                {!isReadOnly && (
                    <td className="p-2 text-center">
                        <button
                            onClick={() => handleDeletePayment(index)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600"
                            title="Supprimer"
                        >
                            <IconTrash size={18} />
                        </button>
                    </td>
                )}
            </tr>
        );
    }

    return (
        <SectionCard title="Paiements" onSave={isReadOnly ? undefined : onSave ? () => onSave(payments) : undefined}>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                            {!isReadOnly && (
                                <th className="text-center p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-12"></th>
                            )}
                            <th className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400">
                                Type
                            </th>
                            <th className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400">
                                ID
                            </th>
                            <th className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-24">
                                Devise
                            </th>
                            <th className="text-center p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-32">
                                Disponibilité
                            </th>
                            {!isReadOnly && <th className="w-24"></th>}
                        </tr>
                    </thead>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={payments.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                            <tbody>
                                {payments.map((payment, index) => (
                                    <SortableRow key={index} payment={payment} index={index} isReadOnly={isReadOnly} />
                                ))}
                            </tbody>
                        </SortableContext>
                    </DndContext>
                </table>
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddPayment}>
                    Ajouter un moyen de paiement
                </AdminButton>
            )}
        </SectionCard>
    );
}
