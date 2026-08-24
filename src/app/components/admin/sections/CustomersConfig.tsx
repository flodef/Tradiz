'use client';

import { Customer, Company } from '@/app/utils/interfaces';
import '@/app/utils/extensions';
import { adminHeaderStyle } from '@/app/utils/constants';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    IconChevronDown,
    IconChevronUp,
    IconEdit,
    IconPrinter,
    IconSearch,
    IconSelector,
    IconUpload,
} from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { useIsMobile } from '@/app/utils/mobile';
import SectionCard from '../SectionCard';
import DeleteButton from '../DeleteButton';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';
import AdminButton from '../AdminButton';
import { useVirtualKeyboardInput } from '../VirtualKeyboardProvider';
import { normalizeFirstName, normalizeFamilyName, emailRegex, frenchPhoneRegex } from '@/app/utils/regex';
import { twMerge } from 'tailwind-merge';
import { usePopup } from '@/app/hooks/usePopup';
import { useConfig } from '@/app/hooks/useConfig';
import { CustomerListReport } from '@/app/components/CustomerListReport';

type SortField = 'firstName' | 'lastName' | 'reference' | 'email' | 'phone' | 'company' | 'balance';
type SortDirection = 'asc' | 'desc' | 'none';

// Sentinel value used in the company filter dropdown to represent customers
// with no company (company is undefined/null/empty).
const NONE_COMPANY = '__none__';

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
    const vkInput = useVirtualKeyboardInput(setQuery);

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
                onFocus={vkInput.onFocus}
                onBlur={vkInput.onBlur}
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
    onEdit,
}: {
    customer: InternalCustomer;
    isReadOnly: boolean;
    onEdit: () => void;
}) {
    return (
        <tr
            className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
            onClick={onEdit}
        >
            <td className="p-2 text-sm truncate max-w-32">{customer.firstName}</td>
            <td className="p-2 text-sm truncate max-w-32">{customer.lastName}</td>
            <td className="p-2 text-sm truncate max-w-32 text-gray-500 dark:text-gray-400">
                {customer.reference || '—'}
            </td>
            <td className="p-2 text-sm truncate max-w-40 text-gray-500 dark:text-gray-400">{customer.email || '—'}</td>
            <td className="p-2 text-sm truncate max-w-36 text-gray-500 dark:text-gray-400">{customer.phone || '—'}</td>
            <td className="p-2 text-sm truncate max-w-40">{customer.company || '—'}</td>
            <td className="p-2 text-sm text-right tabular-nums">
                {isReadOnly ? (customer.balance ?? 0).toLocaleCurrency() : customer.balance ?? 0}
            </td>
            <td className="p-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                {!isReadOnly && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-600 cursor-pointer"
                        title="Modifier le client"
                    >
                        <IconEdit size={28} stroke={2} />
                    </button>
                )}
            </td>
        </tr>
    );
}

interface CustomerEditPopupProps {
    customer: InternalCustomer;
    companies?: Company[];
    isReadOnly?: boolean;
    onSave: (customer: InternalCustomer) => void;
    onDelete: () => void;
    onCancel: () => void;
}

const CustomerEditPopup: FC<CustomerEditPopupProps> = ({
    customer,
    companies,
    isReadOnly,
    onSave,
    onDelete,
    onCancel,
}) => {
    const [draft, setDraft] = useState<InternalCustomer>(customer);

    const companyOptions = useMemo(() => {
        const opts = [{ value: '', label: 'Aucune' }];
        if (companies) {
            companies.forEach((c) => opts.push({ value: c.name, label: c.name }));
        }
        return opts;
    }, [companies]);

    const isValid = draft.firstName?.trim() && draft.lastName?.trim();
    const emailValid = !draft.email || emailRegex.test(draft.email);
    const phoneValid = !draft.phone || frenchPhoneRegex.test(draft.phone);

    return (
        <div className="p-4 space-y-4 max-w-lg mx-auto">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Prénom *</label>
                    <ValidatedInput
                        value={draft.firstName}
                        onChange={(value) => setDraft((d) => ({ ...d, firstName: normalizeFirstName(String(value)) }))}
                        placeholder="Prénom"
                        validation={(value) => String(value).trim().length > 0}
                        isNameField
                        isReadOnly={isReadOnly}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Nom *</label>
                    <ValidatedInput
                        value={draft.lastName}
                        onChange={(value) => setDraft((d) => ({ ...d, lastName: normalizeFamilyName(String(value)) }))}
                        placeholder="Nom"
                        validation={(value) => String(value).trim().length > 0}
                        isNameField
                        isReadOnly={isReadOnly}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Référence</label>
                    <ValidatedInput
                        value={draft.reference ?? ''}
                        onChange={(value) => setDraft((d) => ({ ...d, reference: String(value) }))}
                        placeholder="Auto-généré"
                        isReadOnly={isReadOnly}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Solde</label>
                    {isReadOnly ? (
                        <div className="text-right tabular-nums">{(draft.balance ?? 0).toLocaleCurrency()}</div>
                    ) : (
                        <ValidatedInput
                            type="number"
                            value={String(draft.balance ?? 0)}
                            onChange={(value) => setDraft((d) => ({ ...d, balance: parseFloat(String(value)) || 0 }))}
                            placeholder="0"
                            className="w-full text-right"
                        />
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Email</label>
                    <ValidatedInput
                        value={draft.email ?? ''}
                        onChange={(value) => setDraft((d) => ({ ...d, email: String(value) }))}
                        placeholder="Email"
                        validation={(value) => !value || emailRegex.test(String(value))}
                        isReadOnly={isReadOnly}
                    />
                    {!emailValid && <p className="text-xs text-red-500 mt-1">Email invalide</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Téléphone</label>
                    <ValidatedInput
                        value={draft.phone ?? ''}
                        onChange={(value) => setDraft((d) => ({ ...d, phone: String(value) }))}
                        placeholder="Téléphone"
                        validation={(value) => !value || frenchPhoneRegex.test(String(value))}
                        isReadOnly={isReadOnly}
                    />
                    {!phoneValid && <p className="text-xs text-red-500 mt-1">Téléphone invalide</p>}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Entreprise</label>
                <AdminSelect
                    value={draft.company || ''}
                    onChange={(e) =>
                        setDraft((d) => ({ ...d, company: e.target.value === '' ? undefined : String(e.target.value) }))
                    }
                    options={companyOptions}
                    isReadOnly={isReadOnly || !companies?.length}
                />
            </div>
            <div className="flex justify-between items-center pt-2">
                <DeleteButton onClick={onDelete} title="Supprimer le client" />
                <div className="flex gap-2">
                    <AdminButton variant="secondary" onClick={onCancel}>
                        Annuler
                    </AdminButton>
                    <AdminButton
                        variant="primary"
                        onClick={() => onSave(draft)}
                        disabled={isReadOnly || !isValid || !emailValid || !phoneValid}
                    >
                        Valider
                    </AdminButton>
                </div>
            </div>
        </div>
    );
};

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
    const { parameters } = useConfig();
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const lastAddedIdRef = useRef<number | null>(null);
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
    const [searchQuery, setSearchQuery] = useState('');
    const vkSearchInput = useVirtualKeyboardInput(setSearchQuery);
    const [companyFilter, setCompanyFilter] = useState<string>('');
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
            } else if (sortField === 'balance') {
                comparison = (a.balance ?? 0) - (b.balance ?? 0);
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
            const newCompany: Company = { name: effectiveCompanyName, mealPrice: 0 };
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

    const handleEditCustomer = useCallback(
        (customer: InternalCustomer) => {
            const content = (
                <CustomerEditPopup
                    customer={customer}
                    companies={companies}
                    isReadOnly={isReadOnly}
                    onSave={(updated) => {
                        handleCustomerChange(customer._id, updated);
                        closePopup();
                    }}
                    onDelete={() => {
                        handleDeleteCustomer(customer._id);
                        closePopup();
                    }}
                    onCancel={() => closePopup()}
                />
            );
            openFullscreenPopup(
                `Modifier ${customer.firstName} ${customer.lastName}`.trim() || 'Nouveau client',
                [content],
                () => {},
                true
            );
        },
        [companies, isReadOnly, closePopup, handleCustomerChange, handleDeleteCustomer, openFullscreenPopup]
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
            balance: 0,
            _id: newId,
        };
        const updated = [...customers, newCustomer];
        lastAddedIdRef.current = newId;
        selfUpdateRef.current = true;
        setCustomers(updated);
        onChange(strip(updated));
        handleEditCustomer(newCustomer);
    }, [customers, onChange, handleEditCustomer]);

    const handleSave = () => {
        onSave?.(strip(customers));
        setOriginalConfig(strip(customers));
    };

    // Company filter options derived from the actual customers: only companies
    // that have at least one customer appear, plus "Aucune" when some customers
    // have no company.
    const companyFilterOptions = useMemo(() => {
        const present = new Set<string>();
        let hasNone = false;
        for (const c of customers) {
            const name = (c.company ?? '').trim();
            if (name) {
                present.add(name);
            } else {
                hasNone = true;
            }
        }
        const opts: { value: string; label: string }[] = [{ value: '', label: 'Toutes les entreprises' }];
        // Preserve the companies prop ordering for ones that are present.
        if (companies) {
            for (const c of companies) {
                if (present.has(c.name)) opts.push({ value: c.name, label: c.name });
            }
        }
        // Add any companies present in customers but missing from the companies prop.
        const known = new Set((companies || []).map((c) => c.name));
        for (const name of present) {
            if (!known.has(name)) opts.push({ value: name, label: name });
        }
        if (hasNone) opts.push({ value: NONE_COMPANY, label: 'Aucune' });
        return opts;
    }, [customers, companies]);

    // Reset the filter when its option disappears (e.g. after deleting/renaming).
    useEffect(() => {
        if (!companyFilter) return;
        if (!companyFilterOptions.some((o) => o.value === companyFilter)) {
            setCompanyFilter('');
        }
    }, [companyFilterOptions, companyFilter]);

    const filteredCustomers = useMemo(() => {
        let result = sortedCustomers;
        if (companyFilter) {
            if (companyFilter === NONE_COMPANY) {
                result = result.filter((c) => !c.company?.trim());
            } else {
                result = result.filter((c) => (c.company ?? '').trim() === companyFilter);
            }
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(
                (c) =>
                    c.firstName.toLowerCase().includes(q) ||
                    c.lastName.toLowerCase().includes(q) ||
                    (c.reference ?? '').toLowerCase().includes(q) ||
                    (c.email ?? '').toLowerCase().includes(q) ||
                    (c.phone ?? '').toLowerCase().includes(q) ||
                    (c.company ?? '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [sortedCustomers, companyFilter, searchQuery]);

    const handlePrintCustomerList = useCallback(() => {
        const customersToPrint = companyFilter
            ? strip(customers).filter((c) =>
                  companyFilter === NONE_COMPANY ? !c.company?.trim() : (c.company ?? '').trim() === companyFilter
              )
            : strip(customers);
        const title = companyFilter
            ? companyFilter === NONE_COMPANY
                ? 'Liste des clients - Aucune'
                : `Liste des clients - ${companyFilter}`
            : 'Liste des clients';
        openFullscreenPopup(
            title,
            [<CustomerListReport key="customerListReport" customers={customersToPrint} shop={parameters.shop} />],
            undefined,
            true
        );
    }, [customers, companyFilter, parameters.shop, openFullscreenPopup]);

    const isMobile = useIsMobile();

    const headerExtra = (
        <div className="flex items-center gap-2">
            {customers.length > 0 && (
                <AdminButton
                    variant="primary"
                    onClick={handlePrintCustomerList}
                    className={twMerge(isMobile ? 'px-3 py-1.5' : 'px-3 py-1', 'mt-0')}
                >
                    {isMobile ? <IconPrinter size={24} /> : 'Imprimer la liste'}
                </AdminButton>
            )}
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
                {/* Search + company filter bar */}
                {customers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                        <div className="relative min-w-0">
                            <IconSearch
                                size={16}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                            />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={vkSearchInput.onFocus}
                                onBlur={vkSearchInput.onBlur}
                                placeholder="Rechercher..."
                                maxLength={10}
                                className="w-28 pl-8 pr-2 py-1.5 text-sm border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                            />
                        </div>
                        {companyFilterOptions.length > 1 && (
                            <AdminSelect
                                value={companyFilter}
                                onChange={(e) => setCompanyFilter(e.target.value)}
                                options={companyFilterOptions}
                                className="min-w-48"
                            />
                        )}
                        {(searchQuery || companyFilter) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery('');
                                    setCompanyFilter('');
                                }}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                            >
                                Réinitialiser
                            </button>
                        )}
                    </div>
                )}
                <div className="overflow-auto max-h-[calc(100vh-16rem)]">
                    <table className="w-full border-collapse">
                        {sortedCustomers.length > 0 && (
                            <thead className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    <th
                                        className={adminHeaderStyle + ' cursor-pointer'}
                                        onClick={() => handleSort('firstName')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Prénom <SortIcon field="firstName" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' cursor-pointer'}
                                        onClick={() => handleSort('lastName')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Nom <SortIcon field="lastName" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' cursor-pointer'}
                                        onClick={() => handleSort('reference')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Référence <SortIcon field="reference" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' cursor-pointer'}
                                        onClick={() => handleSort('email')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Email <SortIcon field="email" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' cursor-pointer'}
                                        onClick={() => handleSort('phone')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Téléphone <SortIcon field="phone" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' cursor-pointer'}
                                        onClick={() => handleSort('company')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Entreprise <SortIcon field="company" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' cursor-pointer text-right'}
                                        onClick={() => handleSort('balance')}
                                    >
                                        <div className="flex items-center gap-1 justify-end">
                                            Solde <SortIcon field="balance" />
                                        </div>
                                    </th>
                                    {!isReadOnly && <th className="w-20"></th>}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {filteredCustomers.map((customer) => (
                                <Row
                                    key={customer._id}
                                    customer={customer}
                                    isReadOnly={isReadOnly}
                                    onEdit={() => handleEditCustomer(customer)}
                                />
                            ))}
                            {filteredCustomers.length === 0 && sortedCustomers.length > 0 && (
                                <tr>
                                    <td
                                        colSpan={isReadOnly ? 7 : 8}
                                        className="text-center py-4 text-gray-500 dark:text-gray-400"
                                    >
                                        Aucun client trouvé
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
}
