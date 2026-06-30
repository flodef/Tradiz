'use client';

import { Customer, Company } from '@/app/utils/interfaces';
import { adminHeaderStyle } from '@/app/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import DeleteButtonCell from '../DeleteButtonCell';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';
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
    companies?: Company[];
}

interface InternalCustomer extends Customer {
    _id: number;
}

function Row({
    customer,
    isReadOnly,
    onChange,
    onDelete,
    companies,
}: {
    customer: InternalCustomer;
    isReadOnly: boolean;
    onChange: (customer: InternalCustomer) => void;
    onDelete: () => void;
    companies?: Company[];
}) {
    const companyOptions = useMemo(() => {
        const opts = [{ value: '', label: 'Aucune' }];
        if (companies) {
            companies.forEach((c) => {
                opts.push({ value: c.name, label: c.name });
            });
        }
        return opts;
    }, [companies]);

    return (
        <tr className="border-b border-gray-200 dark:border-gray-700">
            <td className="p-2">
                <ValidatedInput
                    value={customer.firstName}
                    onChange={(value) => onChange({ ...customer, firstName: normalizeFirstName(String(value)) })}
                    placeholder="Prénom"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                    className="min-w-32"
                    isNameField
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
                    isNameField
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
                    validation={(value) => !value || emailRegex.test(String(value))}
                    className="min-w-40"
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={customer.phone ?? ''}
                    onChange={(value) => onChange({ ...customer, phone: String(value) })}
                    placeholder="Téléphone"
                    isReadOnly={isReadOnly}
                    validation={(value) => !value || frenchPhoneRegex.test(String(value))}
                    className="w-36"
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={customer.company || ''}
                    onChange={(e) =>
                        onChange({ ...customer, company: e.target.value === '' ? undefined : String(e.target.value) })
                    }
                    options={companyOptions}
                    className="min-w-40"
                    isReadOnly={isReadOnly}
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
    companies,
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
                    company: undefined,
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
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    {customers.length > 0 && (
                        <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                <th className={adminHeaderStyle + ' min-w-32 w-32'}>Prénom</th>
                                <th className={adminHeaderStyle + ' min-w-32 w-32'}>Nom</th>
                                <th className={adminHeaderStyle + ' min-w-32 w-32'}>Référence</th>
                                <th className={adminHeaderStyle + ' min-w-40 w-40'}>Email</th>
                                <th className={adminHeaderStyle + ' min-w-36 w-36'}>Téléphone</th>
                                <th className={adminHeaderStyle + ' min-w-40 w-40'}>Entreprise</th>
                                {!isReadOnly && <th className="w-8"></th>}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {customers.map((customer) => (
                            <Row
                                key={customer._id}
                                customer={customer}
                                isReadOnly={isReadOnly}
                                onChange={(updated) => handleCustomerChange(customer._id, updated)}
                                onDelete={() => handleDeleteCustomer(customer._id)}
                                companies={companies}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCustomer} disabled={!isValid || isLoading}>
                    Ajouter un client
                </AdminButton>
            )}
        </SectionCard>
    );
}
