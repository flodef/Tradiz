'use client';

import { Customer } from '@/app/utils/interfaces';
import { adminHeaderStyle } from '@/app/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import ValidatedInput from '../ValidatedInput';
import { normalizeFirstName, normalizeFamilyName, emailRegex, frenchPhoneRegex } from '@/app/utils/regex';

interface CustomersConfigProps {
    config: Customer[];
    onChange: (data: Customer[]) => void;
    onSave?: (data: Customer[]) => void;
    onCancel?: () => void;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
    onValidation?: (isValid: boolean) => void;
}

interface InternalCustomer extends Customer {
    _id: number;
}

function SortableRow({
    customer,
    isReadOnly,
    onChange,
    onDelete,
}: {
    customer: InternalCustomer;
    isReadOnly: boolean;
    onChange: (customer: InternalCustomer) => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: customer._id });
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
                    value={customer.firstName}
                    onChange={(value) => onChange({ ...customer, firstName: normalizeFirstName(String(value)) })}
                    placeholder="Prénom"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                    className="min-w-32"
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={customer.lastName}
                    onChange={(value) => onChange({ ...customer, lastName: normalizeFamilyName(String(value)) })}
                    placeholder="Nom"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                    className="min-w-32"
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={customer.reference ?? ''}
                    onChange={(value) => onChange({ ...customer, reference: String(value) })}
                    placeholder="Auto-généré"
                    isReadOnly={isReadOnly}
                    className="min-w-32"
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={customer.email ?? ''}
                    onChange={(value) => onChange({ ...customer, email: String(value) })}
                    placeholder="Email"
                    isReadOnly={isReadOnly}
                    validation={(value) => emailRegex.test(String(value))}
                    className="min-w-40"
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={customer.phone ?? ''}
                    onChange={(value) => onChange({ ...customer, phone: String(value) })}
                    placeholder="Téléphone"
                    isReadOnly={isReadOnly}
                    validation={(value) => frenchPhoneRegex.test(String(value))}
                    className="w-36"
                />
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={onDelete} title="Supprimer le client" />
        </tr>
    );
}

export default function CustomersConfig({
    config,
    onChange,
    onSave,
    onCancel,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
    onValidation,
}: CustomersConfigProps) {
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [customers, setCustomers] = useState<InternalCustomer[]>(() =>
        (config || []).map((c: Customer) => ({ ...c, _id: nextIdRef.current++ }))
    );
    const [originalConfig, setOriginalConfig] = useState<Customer[]>(config || []);

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        const incoming = config || [];
        setCustomers(incoming.map((c: Customer) => ({ ...c, _id: nextIdRef.current++ })));
        setOriginalConfig(incoming);
    }, [config]);

    const strip = (items: InternalCustomer[]): Customer[] => items.map(({ _id: _, ...rest }) => rest);

    const notifyParent = useCallback(
        (items: InternalCustomer[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(items));
            }, 300);
        },
        [onChange]
    );

    const hasChanges = JSON.stringify(strip(customers)) !== JSON.stringify(originalConfig);

    const isValid = useMemo(() => {
        return customers.every((customer) => customer.firstName?.trim() && customer.lastName?.trim());
    }, [customers]);

    // Notify parent of validation state
    useEffect(() => {
        onValidation?.(isValid);
    }, [isValid, onValidation]);

    const handleCustomerChange = useCallback(
        (id: number, updatedCustomer: InternalCustomer) => {
            setCustomers((prev) => {
                const updated = prev.map((c) => (c._id === id ? updatedCustomer : c));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddCustomer = useCallback(() => {
        setCustomers((prev: InternalCustomer[]) => {
            const updated = [
                ...prev,
                {
                    firstName: '',
                    lastName: '',
                    reference: '',
                    email: '',
                    phone: '',
                    _id: nextIdRef.current++,
                } as InternalCustomer,
            ];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent]);

    const handleDeleteCustomer = useCallback(
        (id: number) => {
            setCustomers((prev) => {
                const updated = prev.filter((c) => c._id !== id);
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleSave = () => {
        onSave?.(strip(customers));
        setOriginalConfig(strip(customers));
    };

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setCustomers((prev: InternalCustomer[]) => {
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
            title="Clients"
            onSave={onSave ? handleSave : undefined}
            onCancel={hasChanges && onCancel ? () => onCancel() : undefined}
            icon={icon}
            saveDisabled={!hasChanges || !isValid || isReadOnly || isLoading}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={customers.map((c) => c._id)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            {customers.length > 0 && (
                                <thead>
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        {!isReadOnly && <th className="w-12"></th>}
                                        <th className={adminHeaderStyle + ' min-w-32 w-32'}>Prénom</th>
                                        <th className={adminHeaderStyle + ' min-w-32 w-32'}>Nom</th>
                                        <th className={adminHeaderStyle + ' min-w-32 w-32'}>Référence</th>
                                        <th className={adminHeaderStyle + ' min-w-40 w-40'}>Email</th>
                                        <th className={adminHeaderStyle + ' min-w-36 w-36'}>Téléphone</th>
                                        {!isReadOnly && <th className="w-8"></th>}
                                    </tr>
                                </thead>
                            )}
                            <tbody>
                                {customers.map((customer) => (
                                    <SortableRow
                                        key={customer._id}
                                        customer={customer}
                                        isReadOnly={isReadOnly}
                                        onChange={(updated) => handleCustomerChange(customer._id, updated)}
                                        onDelete={() => handleDeleteCustomer(customer._id)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>

            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCustomer} disabled={!isValid || isLoading}>
                    Ajouter un client
                </AdminButton>
            )}
        </SectionCard>
    );
}
