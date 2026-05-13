import { adminHeaderStyle, PAYMENT_TYPES } from '@/app/utils/constants';
import { Currency, PaymentMethod } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import AvailabilityToggle from '../AvailabilityToggle';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

interface InternalPayment extends PaymentMethod {
    _id: number;
}

interface SortableRowProps {
    payment: InternalPayment;
    isReadOnly: boolean;
    currencyOptions: { value: string; label: string }[];
    onFieldChange: (id: number, field: keyof PaymentMethod, value: string | boolean) => void;
    onDelete: (id: number) => void;
}

const SortableRow = memo(function SortableRow({
    payment,
    isReadOnly,
    currencyOptions,
    onFieldChange,
    onDelete,
}: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: payment._id,
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
                    onChange={(e) => onFieldChange(payment._id, 'type', e.target.value)}
                    options={PAYMENT_TYPES.map((type) => ({ value: type, label: type }))}
                    disabled={isReadOnly}
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    type="text"
                    value={payment.id || ''}
                    onChange={(value) => onFieldChange(payment._id, 'id', String(value))}
                    disabled={isReadOnly}
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={payment.currency}
                    onChange={(e) => onFieldChange(payment._id, 'currency', e.target.value)}
                    options={currencyOptions}
                    disabled={isReadOnly}
                />
            </td>
            <td className="p-2 text-center">
                <div className="flex justify-center">
                    <AvailabilityToggle
                        availability={payment.availability}
                        isReadOnly={isReadOnly}
                        onChange={(newValue) => onFieldChange(payment._id, 'availability', newValue)}
                    />
                </div>
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={() => onDelete(payment._id)} />
        </tr>
    );
});

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
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [payments, setPayments] = useState<InternalPayment[]>(() =>
        (config || []).map((p) => ({ ...p, _id: nextIdRef.current++ }))
    );

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setPayments((config || []).map((p) => ({ ...p, _id: nextIdRef.current++ })));
    }, [config]);

    const strip = (items: InternalPayment[]): PaymentMethod[] => items.map(({ _id: _, ...rest }) => rest);

    const notifyParent = useCallback(
        (items: InternalPayment[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(items));
            }, 300);
        },
        [onChange]
    );

    const handleFieldChange = useCallback(
        (id: number, field: keyof PaymentMethod, value: string | boolean) => {
            setPayments((prev) => {
                const updated = prev.map((p) => (p._id === id ? { ...p, [field]: value } : p));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddPayment = useCallback(() => {
        setPayments((prev) => {
            const updated = [
                ...prev,
                { type: 'Carte Bancaire', id: '', currency: '', availability: false, _id: nextIdRef.current++ },
            ];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent]);

    const handleDeletePayment = useCallback(
        (id: number) => {
            setPayments((prev) => {
                const updated = prev.filter((p) => p._id !== id);
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
            setPayments((prev) => {
                const oldIdx = prev.findIndex((p) => p._id === active.id);
                const newIdx = prev.findIndex((p) => p._id === over.id);
                if (oldIdx === -1 || newIdx === -1) return prev;
                const reordered = arrayMove(prev, oldIdx, newIdx);
                notifyParent(reordered);
                return reordered;
            });
        },
        [notifyParent]
    );

    const sensors = useSensors(useSensor(PointerSensor));
    const currencyOptions = React.useMemo(
        () => currencies.map(({ symbol }) => ({ value: symbol, label: symbol })),
        [currencies]
    );

    return (
        <SectionCard
            title="Paiements"
            onSave={isReadOnly ? undefined : onSave ? () => onSave(strip(payments)) : undefined}
            onCancel={onCancel}
            isLoading={isLoading}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={payments.map((p) => p._id)} strategy={verticalListSortingStrategy}>
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
                                {payments.map((payment) => (
                                    <SortableRow
                                        key={payment._id}
                                        payment={payment}
                                        isReadOnly={isReadOnly}
                                        currencyOptions={currencyOptions}
                                        onFieldChange={handleFieldChange}
                                        onDelete={handleDeletePayment}
                                    />
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
