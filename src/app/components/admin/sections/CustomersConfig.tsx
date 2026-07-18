'use client';

import { Customer, Company } from '@/app/utils/interfaces';
import { adminHeaderStyle } from '@/app/utils/constants';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronDown, IconChevronUp, IconSelector, IconUpload } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { useIsMobile } from '@/app/utils/mobile';
import SectionCard from '../SectionCard';
import DeleteButtonCell from '../DeleteButtonCell';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';
import AdminButton from '../AdminButton';
import { normalizeFirstName, normalizeFamilyName, emailRegex, frenchPhoneRegex } from '@/app/utils/regex';
import { twMerge } from 'tailwind-merge';
import { usePopup } from '@/app/hooks/usePopup';

type SortField = 'firstName' | 'lastName' | 'reference' | 'email' | 'phone' | 'company';
type SortDirection = 'asc' | 'desc' | 'none';

interface CustomersConfigProps {
    config: Customer[];
    onChange: (data: Customer[]) => void;
    onSave?: (data: Customer[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
    onValidation?: (isValid: boolean) => void;
    companies?: Company[];
    onCompaniesChange?: (companies: Company[]) => void;
}

interface InternalCustomer extends Customer {
    _id: number;
}

interface CompanySearchPopupProps {
    companies: Company[];
    initialQuery: string;
    onSelectCompany: (companyName: string) => void;
    onCreateCompany: (companyName: string) => void;
    onSelectNoCompany: () => void;
}

const CompanySearchPopup: FC<CompanySearchPopupProps> = ({
    companies,
    initialQuery,
    onSelectCompany,
    onCreateCompany,
    onSelectNoCompany,
}) => {
    const [query, setQuery] = useState(initialQuery);

    const filteredCompanies = useMemo(() => {
        if (!query) return companies;
        return companies.filter((c: Company) => c.name.toLowerCase().includes(query.toLowerCase()));
    }, [companies, query]);

    return (
        <div className="p-4">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une entreprise..."
                className="w-full p-2 border rounded mb-4 dark:bg-gray-700 dark:border-gray-600"
                autoFocus
                maxLength={15}
            />
            <div className="max-h-60 overflow-y-auto">
                {filteredCompanies.length > 0 ? (
                    filteredCompanies.map((company: Company) => (
                        <div
                            key={company.name}
                            onClick={() => onSelectCompany(company.name)}
                            className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                        >
                            {company.name}
                        </div>
                    ))
                ) : (
                    <div
                        onClick={() => onCreateCompany(query)}
                        className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-green-600 dark:text-green-400 cursor-pointer"
                    >
                        + Créer "{query}"
                    </div>
                )}
                <div
                    onClick={() => onSelectNoCompany()}
                    className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded mt-2 border-t border-gray-200 dark:border-gray-700 cursor-pointer"
                >
                    Aucune
                </div>
            </div>
        </div>
    );
};

function Row({
    customer,
    isReadOnly,
    onChange,
    onDelete,
    companies,
    firstNameInputRefs,
    lastAddedIdRef,
    index,
}: {
    customer: InternalCustomer;
    isReadOnly: boolean;
    onChange: (customer: InternalCustomer) => void;
    onDelete: () => void;
    companies?: Company[];
    firstNameInputRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
    lastAddedIdRef: React.MutableRefObject<number | null>;
    index: number;
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
                    ref={(el) => {
                        if (el) {
                            firstNameInputRefs.current.set(index, el);
                            if (lastAddedIdRef.current === customer._id) {
                                el.focus();
                            }
                        } else {
                            firstNameInputRefs.current.delete(index);
                        }
                    }}
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
    onCompaniesChange,
}: CustomersConfigProps) {
    const { openFullscreenPopup, closePopup } = usePopup();
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const lastAddedIdRef = useRef<number | null>(null);
    const firstNameInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const [customers, setCustomers] = useState<InternalCustomer[]>(() =>
        (config || []).map((c: Customer) => ({ ...c, _id: nextIdRef.current++ }))
    );
    const [originalConfig, setOriginalConfig] = useState<Customer[]>(config || []);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('none');
    const [importData, setImportData] = useState<InternalCustomer[] | null>(null);
    const [importCompanyName, setImportCompanyName] = useState<string>('');
    const [importAction, setImportAction] = useState<'add' | 'overwrite' | null>(null);
    const [companySearchQuery, setCompanySearchQuery] = useState('');
    const [shouldOpenCompanySearch, setShouldOpenCompanySearch] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        const incoming = config || [];
        setCustomers(incoming.map((c: Customer) => ({ ...c, _id: nextIdRef.current++ })));
        setOriginalConfig(incoming);
    }, [config]);

    useEffect(() => {
        if (shouldOpenCompanySearch && importData) {
            setShouldOpenCompanySearch(false);
            openCompanySearchPopup();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldOpenCompanySearch, importData]);

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

    const sortedCustomers = useMemo(() => {
        if (!sortField || sortDirection === 'none') return customers;

        const sorted = [...customers].sort((a, b) => {
            let comparison = 0;
            if (sortField === 'firstName') {
                comparison = (a.firstName ?? '').localeCompare(b.firstName ?? '');
            } else if (sortField === 'lastName') {
                comparison = (a.lastName ?? '').localeCompare(b.lastName ?? '');
            } else if (sortField === 'reference') {
                comparison = (a.reference ?? '').localeCompare(b.reference ?? '');
            } else if (sortField === 'email') {
                comparison = (a.email ?? '').localeCompare(b.email ?? '');
            } else if (sortField === 'phone') {
                comparison = (a.phone ?? '').localeCompare(b.phone ?? '');
            } else if (sortField === 'company') {
                comparison = (a.company ?? '').localeCompare(b.company ?? '');
            }
            return sortDirection === 'desc' ? -comparison : comparison;
        });

        return sorted;
    }, [customers, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else if (sortDirection === 'desc') {
                setSortDirection('none');
                setSortField(null);
            }
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <IconSelector size={14} className="opacity-30" />;
        if (sortDirection === 'none') return <IconSelector size={14} className="opacity-30" />;
        return sortDirection === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const data = event.target?.result;
            if (!data) return;

            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][];

            // Extract company name from filename
            const companyName = file.name.replace(/\.[^/.]+$/, '');

            // Parse data (skip header row)
            const parsedCustomers: InternalCustomer[] = [];
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row.length < 2) continue; // Need at least first name and last name

                parsedCustomers.push({
                    firstName: normalizeFirstName(String(row[0] || '')),
                    lastName: normalizeFamilyName(String(row[1] || '')),
                    reference: row[2] ? String(row[2]) : '',
                    email: row[3] ? String(row[3]) : '',
                    phone: row[4] ? String(row[4]) : '',
                    company: undefined,
                    _id: nextIdRef.current++,
                });
            }

            setImportData(parsedCustomers);
            setImportCompanyName(companyName);
            openImportConfirmationPopup(companyName);
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleImportConfirm = (companyName?: string, action?: 'add' | 'overwrite') => {
        if (!importData) {
            return;
        }

        const effectiveCompanyName = companyName !== undefined ? companyName : importCompanyName;
        const effectiveAction = action !== undefined ? action : importAction;
        const existingCompany = companies?.find((c) => c.name === effectiveCompanyName);
        const customersWithCompany = importData.map((c) => ({
            ...c,
            company: effectiveCompanyName || undefined,
        }));

        // Remove empty customers from the company being imported to
        let customersToUse = customers;
        if (effectiveCompanyName) {
            customersToUse = customers.filter((c) => c.company !== effectiveCompanyName || (c.firstName && c.lastName));
        }

        // Remove the last added empty customer if it exists (global)
        if (lastAddedIdRef.current !== null) {
            const lastAddedCustomer = customersToUse.find((c) => c._id === lastAddedIdRef.current);
            if (lastAddedCustomer && !lastAddedCustomer.firstName && !lastAddedCustomer.lastName) {
                customersToUse = customersToUse.filter((c) => c._id !== lastAddedIdRef.current);
                lastAddedIdRef.current = null;
            }
        }

        // Create new company if it doesn't exist
        if (effectiveCompanyName && !existingCompany && onCompaniesChange) {
            const newCompany: Company = { name: effectiveCompanyName, quotaShare: 0 };
            onCompaniesChange([...(companies || []), newCompany]);
        }

        if (effectiveAction === 'overwrite' && existingCompany) {
            // Remove existing customers for this company
            const filtered = customersToUse.filter((c) => c.company !== effectiveCompanyName);
            const finalCustomers = [...filtered, ...customersWithCompany];
            setCustomers(finalCustomers);
            notifyParent(finalCustomers);
        } else {
            // Add new customers (avoid duplicates)
            const existingNames = new Set(
                customersToUse
                    .filter((c) => c.company === effectiveCompanyName)
                    .map((c) => `${c.firstName}|${c.lastName}`)
            );
            const nonDuplicates = customersWithCompany.filter(
                (c) => !existingNames.has(`${c.firstName}|${c.lastName}`)
            );
            const duplicateCount = customersWithCompany.length - nonDuplicates.length;
            const finalCustomers = [...customersToUse, ...nonDuplicates];
            setCustomers(finalCustomers);
            notifyParent(finalCustomers);

            // Show popup if there were duplicates
            if (duplicateCount > 0) {
                const clientText = duplicateCount === 1 ? 'client' : 'clients';
                openFullscreenPopup(
                    `${duplicateCount} ${clientText} en double n'ont pas été importés`,
                    ['OK'],
                    () => {
                        closePopup();
                    },
                    true
                );
            }
        }

        setImportData(null);
        setImportCompanyName('');
        setImportAction(null);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        if (isReadOnly) return;
        // Let normal paste happen when pasting into an editable field
        if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
        const text = e.clipboardData.getData('text');
        if (!text) return;

        const lines = text.split('\n').filter((line) => line.trim());
        if (lines.length === 0) return;

        e.preventDefault();
        const parsedCustomers: InternalCustomer[] = [];
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 2) continue; // Need at least first name and last name

            parsedCustomers.push({
                firstName: normalizeFirstName(parts[0] || ''),
                lastName: normalizeFamilyName(parts[1] || ''),
                reference: parts[2] || '',
                email: parts[3] || '',
                phone: parts[4] || '',
                company: undefined,
                _id: nextIdRef.current++,
            });
        }

        if (parsedCustomers.length > 0) {
            setImportData(parsedCustomers);
            setImportCompanyName('');
            setCompanySearchQuery('');
            setShouldOpenCompanySearch(true);
        }
    };

    const openCompanySearchPopup = () => {
        const content = (
            <CompanySearchPopup
                companies={companies || []}
                initialQuery={companySearchQuery}
                onSelectCompany={handleCompanySelect}
                onCreateCompany={(companyName) => {
                    setImportCompanyName(companyName);
                    setImportAction('add');
                    closePopup();
                    handleImportConfirm(companyName, 'add');
                }}
                onSelectNoCompany={handleNoCompany}
            />
        );
        openFullscreenPopup(
            'Sélectionner une entreprise',
            [content],
            (_index, _option) => {
                // No-op - we handle clicks inside the component
            },
            true
        );
    };

    const openImportConfirmationPopup = (companyName?: string) => {
        const effectiveCompanyName = companyName || importCompanyName;
        const existingCompany = companies?.find((c) => c.name === effectiveCompanyName);
        const existingCustomersCount = customers.filter((c) => c.company === effectiveCompanyName).length;
        const clientText = existingCustomersCount === 1 ? 'client déjà présent' : 'clients déjà présents';
        openFullscreenPopup(
            existingCompany
                ? `${existingCustomersCount} ${clientText} pour l'entreprise "${effectiveCompanyName}"`
                : 'Importer clients',
            ['Ajouter', 'Écraser'],
            (index) => {
                if (index === 0) {
                    setImportAction('add');
                    closePopup();
                    handleImportConfirm(effectiveCompanyName, 'add');
                } else if (index === 1) {
                    setImportAction('overwrite');
                    closePopup();
                    handleImportConfirm(effectiveCompanyName, 'overwrite');
                }
            },
            true
        );
    };

    const handleCompanySelect = (companyName: string) => {
        setImportCompanyName(companyName);
        // Auto-set action based on whether company has existing customers
        const existingCompany = companies?.find((c) => c.name === companyName);
        const existingCustomersCount = customers.filter((c) => c.company === companyName).length;
        if (existingCompany && existingCustomersCount > 0) {
            setImportAction(null); // Will need user to choose
            closePopup();
            setTimeout(() => openImportConfirmationPopup(companyName), 0);
        } else {
            // Auto-confirm for new companies or empty ones
            setImportAction('add');
            closePopup();
            handleImportConfirm(companyName, 'add');
        }
    };

    const handleNoCompany = () => {
        setImportCompanyName('');
        closePopup();
        setImportAction('add'); // No company, auto-add
        handleImportConfirm('', 'add');
    };

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
        const newId = nextIdRef.current++;
        const newCustomer: InternalCustomer = {
            firstName: '',
            lastName: '',
            reference: '',
            email: '',
            phone: '',
            company: undefined,
            _id: newId,
        };
        const updated = [...customers, newCustomer];
        lastAddedIdRef.current = newId;
        selfUpdateRef.current = true;
        setCustomers(updated);
        onChange(strip(updated));
    }, [customers, onChange]);

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

    const isMobile = useIsMobile();

    const headerExtra = (
        <div className="flex items-center">
            {!isReadOnly && !hasChanges && (
                <>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                    />
                    <AdminButton
                        variant="add"
                        onClick={() => fileInputRef.current?.click()}
                        className={twMerge(isMobile ? 'px-3 py-1.5' : 'px-3 py-1', 'mt-0')}
                    >
                        {isMobile ? <IconUpload size={24} /> : 'Importer'}
                    </AdminButton>
                </>
            )}
        </div>
    );

    return (
        <div onPaste={handlePaste}>
            <SectionCard
                title="Clients"
                onSave={onSave ? handleSave : undefined}
                onCancel={hasChanges && onCancel ? () => onCancel() : undefined}
                hasChanges={hasChanges}
                icon={icon}
                saveDisabled={!hasChanges || !isValid || isReadOnly || isLoading}
                isLoading={isLoading}
                isOpen={isOpen}
                onToggle={onToggle}
                onAdd={handleAddCustomer}
                isValid={isValid && !isLoading}
                addLabel="Ajouter un client"
                isReadOnly={isReadOnly}
                headerExtra={headerExtra}
            >
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        {sortedCustomers.length > 0 && (
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    <th
                                        className={adminHeaderStyle + ' min-w-32 w-32 cursor-pointer'}
                                        onClick={() => handleSort('firstName')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Prénom <SortIcon field="firstName" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' min-w-32 w-32 cursor-pointer'}
                                        onClick={() => handleSort('lastName')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Nom <SortIcon field="lastName" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' min-w-32 w-32 cursor-pointer'}
                                        onClick={() => handleSort('reference')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Référence <SortIcon field="reference" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' min-w-40 w-40 cursor-pointer'}
                                        onClick={() => handleSort('email')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Email <SortIcon field="email" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' min-w-36 w-36 cursor-pointer'}
                                        onClick={() => handleSort('phone')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Téléphone <SortIcon field="phone" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' min-w-40 w-40 cursor-pointer'}
                                        onClick={() => handleSort('company')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Entreprise <SortIcon field="company" />
                                        </div>
                                    </th>
                                    {!isReadOnly && <th className="w-8"></th>}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {sortedCustomers.map((customer, index) => (
                                <Row
                                    key={customer._id}
                                    customer={customer}
                                    isReadOnly={isReadOnly}
                                    onChange={(updated) => handleCustomerChange(customer._id, updated)}
                                    onDelete={() => handleDeleteCustomer(customer._id)}
                                    companies={companies}
                                    firstNameInputRefs={firstNameInputRefs}
                                    lastAddedIdRef={lastAddedIdRef}
                                    index={index}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
}
