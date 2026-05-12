import { adminHeaderStyle, PAYMENT_TYPES } from '@/app/utils/constants';
import { Currency, PaymentMethod } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import AvailabilityToggle from '../AvailabilityToggle';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

export default function PaymentsConfig({
    config,
    onChange,
    onSave,
    currencies,
    isReadOnly = false,
    onCancel,
    isLoading = false,
}: {
    config: PaymentMethod[];
    onChange: (data: PaymentMethod[]) => void;
    onSave?: (data: PaymentMethod[]) => void;
    currencies: Currency[];
    isReadOnly?: boolean;
    onCancel?: () => void;
    isLoading?: boolean;
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
                <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
                <td className="p-2">
                    <AdminSelect
                        value={payment.type}
                        onChange={(e) =>
                            handlePaymentChange(index, {
                                ...payment,
                                type: e.target.value,
                            })
                        }
                        options={PAYMENT_TYPES.map((type) => ({ value: type, label: type }))}
                        disabled={isReadOnly}
                    />
                </td>
                <td className="p-2">
                    <ValidatedInput
                        type="text"
                        value={payment.id || ''}
                        onChange={(value) =>
                            handlePaymentChange(index, {
                                ...payment,
                                id: String(value),
                            })
                        }
                        disabled={isReadOnly}
                    />
                </td>
                <td className="p-2">
                    <AdminSelect
                        value={payment.currency}
                        onChange={(e) =>
                            handlePaymentChange(index, {
                                ...payment,
                                currency: e.target.value,
                            })
                        }
                        options={currencies.map(({ symbol }) => ({ value: symbol, label: symbol }))}
                        disabled={isReadOnly}
                    />
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
                <DeleteButtonCell isReadOnly={isReadOnly} onDelete={() => handleDeletePayment(index)} />
            </tr>
        );
    }

    return (
        <SectionCard
            title="Paiements"
            onSave={isReadOnly ? undefined : onSave ? () => onSave(payments) : undefined}
            onCancel={onCancel}
            isLoading={isLoading}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={payments.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="w-12"></th>}
                                    <th className={adminHeaderStyle + ' min-w-40 w-40'}>Type</th>
                                    <th className={adminHeaderStyle + ' min-w-80 w-80'}>ID</th>
                                    <th className={adminHeaderStyle + ' min-w-20 w-20'}>Devise</th>
                                    <th className={adminHeaderStyle + ' min-w-20 w-20'}>Disponibilité</th>
                                    {!isReadOnly && <th className="w-8"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((payment, index) => (
                                    <SortableRow key={index} payment={payment} index={index} isReadOnly={isReadOnly} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddPayment}>
                    Ajouter un moyen de paiement
                </AdminButton>
            )}
        </SectionCard>
    );
}
