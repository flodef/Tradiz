'use client';

import { Parameters, ProductsSettings, SearchSettings, DisplaySettings } from '@/app/contexts/ConfigProvider';
import { adminTextStyle } from '@/app/utils/constants';
import { Mercurial } from '@/app/utils/interfaces';
import AdminInput from '../AdminInput';
import AdminSelect from '../AdminSelect';
import SectionCard from '../SectionCard';
import Switch from '../Switch';
import SiretInput from '../SiretInput';
import ValidatedInput from '../ValidatedInput';
import ZipCityRow from '../ZipCityRow';
import { useEffect, useState } from 'react';

interface ParametersConfigProps {
    config: Parameters;
    onChange: (data: Parameters) => void;
    onSave: (data: Parameters) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isSiretValid?: boolean;
    onSiretValidation?: (isValid: boolean) => void;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

const MONTH_NAMES = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
];

export default function ParametersConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isSiretValid = true,
    onSiretValidation,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
}: ParametersConfigProps) {
    const [appVersion, setAppVersion] = useState(process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0');

    useEffect(() => {
        // Fetch the current version from package.json at runtime
        fetch('/api/version')
            .then((res) => res.json())
            .then((data) => {
                if (data.version) {
                    setAppVersion(data.version);
                }
            })
            .catch(() => {
                // Fallback to env var if API fails
                setAppVersion(process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0');
            });
    }, []);

    const maxDaysInMonth = (month: number): number => {
        const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return days[month - 1] ?? 31;
    };

    const handleChange = (field: keyof Parameters, value: unknown) => {
        onChange({
            ...config,
            [field]: value,
        });
    };

    const handleShopChange = (field: string, value: string) => {
        onChange({
            ...config,
            shop: {
                ...config.shop,
                [field]: value,
            },
        });
    };

    const handleYearStartDateChange = (field: 'month' | 'day', value: number) => {
        const currentMonth = config.yearStartDate?.month || 1;
        const currentDay = config.yearStartDate?.day || 1;
        if (field === 'month') {
            const newMonth = Math.max(1, Math.min(12, value));
            const maxDay = maxDaysInMonth(newMonth);
            onChange({
                ...config,
                yearStartDate: { month: newMonth, day: Math.min(currentDay, maxDay) },
            });
        } else {
            const maxDay = maxDaysInMonth(currentMonth);
            onChange({
                ...config,
                yearStartDate: { month: currentMonth, day: Math.max(1, Math.min(maxDay, value)) },
            });
        }
    };

    const handleDisplayChange = (field: keyof DisplaySettings, checked: boolean) => {
        handleChange('display', {
            ...(config.display ?? {
                showWaiting: true,
                showRefund: true,
                showProvision: true,
                showDebit: true,
            }),
            [field]: checked,
        } as DisplaySettings);
    };

    return (
        <SectionCard
            title="Paramètres"
            onSave={isReadOnly || !hasChanges ? undefined : () => onSave(config)}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            icon={icon}
            saveDisabled={!isSiretValid}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Subsection: Commerce */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Commerce
                </h3>
                <div className="flex flex-wrap gap-4">
                    <ValidatedInput
                        label="Nom du commerce"
                        value={String(config.shop.name || '')}
                        onChange={(value) => handleShopChange('name', String(value))}
                        placeholder="Nom du commerce"
                        isReadOnly={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <ValidatedInput
                        label="Email"
                        value={String(config.shop.email || '')}
                        onChange={(value) => handleShopChange('email', String(value))}
                        placeholder="Email"
                        isReadOnly={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <SiretInput
                        value={String(config.shop.serial || '')}
                        onChange={(value: string) => handleShopChange('serial', value)}
                        onValidation={onSiretValidation}
                        isReadOnly={isReadOnly}
                    />
                    <div className="w-full flex flex-wrap gap-4 items-end">
                        <ValidatedInput
                            label="Adresse"
                            value={String(config.shop.address || '')}
                            onChange={(value) => handleShopChange('address', String(value))}
                            placeholder="Adresse"
                            isReadOnly={isReadOnly}
                            className="flex-1 min-w-40 max-w-xs"
                        />
                        <ZipCityRow
                            zipCode={String(config.shop.zipCode || '')}
                            city={String(config.shop.city || '')}
                            onZipChange={(value: string) => handleShopChange('zipCode', value)}
                            onCityChange={(value: string) => handleShopChange('city', value)}
                            isReadOnly={isReadOnly}
                        />
                    </div>
                </div>
            </div>

            {/* Subsection: Général */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Général
                </h3>
                <div className="flex flex-wrap gap-4 items-end">
                    <AdminInput
                        label="Heure de clôture"
                        type="number"
                        min={0}
                        max={23}
                        value={config.closingHour}
                        onChange={(e) =>
                            !isReadOnly &&
                            handleChange('closingHour', Math.max(0, Math.min(23, Number(e.target.value))))
                        }
                        isReadOnly={isReadOnly}
                        className="w-30"
                    />
                    <div className="flex flex-col">
                        <label className={adminTextStyle}>Début d&apos;année fiscale</label>
                        <div className="flex gap-2">
                            <AdminInput
                                type="number"
                                min={1}
                                max={maxDaysInMonth(config.yearStartDate?.month || 1)}
                                value={config.yearStartDate?.day || 1}
                                isReadOnly={isReadOnly}
                                onChange={(e) => handleYearStartDateChange('day', Number(e.target.value))}
                                className="w-14"
                                placeholder="Jour"
                            />
                            <AdminSelect
                                value={config.yearStartDate?.month || 1}
                                onChange={(e) => handleYearStartDateChange('month', Number(e.target.value))}
                                className="w-28"
                                options={MONTH_NAMES.map((name, i) => ({ label: name, value: i + 1 }))}
                                isReadOnly={isReadOnly}
                            />
                        </div>
                    </div>
                    <ValidatedInput
                        label="Message de remerciement"
                        value={config.thanksMessage || ''}
                        onChange={(value) => handleChange('thanksMessage', String(value))}
                        placeholder="Message de remerciement"
                        isReadOnly={isReadOnly}
                        className="max-w-xs min-w-40 flex-1"
                    />
                    <AdminSelect
                        label="Mercurial"
                        value={config.mercurial}
                        onChange={(e) => !isReadOnly && handleChange('mercurial', e.target.value as Mercurial)}
                        className="w-32"
                        options={[
                            { label: 'Aucun', value: Mercurial.none },
                            { label: 'Exponentielle', value: Mercurial.exponential },
                            { label: 'Douce', value: Mercurial.soft },
                            { label: 'Zelet', value: Mercurial.zelet },
                        ]}
                        isReadOnly={isReadOnly}
                    />
                    <ValidatedInput
                        label="Version"
                        value={appVersion}
                        onChange={() => {}}
                        isReadOnly={true}
                        className="w-32"
                    />
                </div>
            </div>

            {/* Subsection: Produits */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Produits
                </h3>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useVatPerProduct ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? {
                                        useVatPerProduct: false,
                                        useReference: false,
                                        useStock: false,
                                        usePhoto: false,
                                        useDescription: false,
                                        useOptions: false,
                                    }),
                                    useVatPerProduct: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser TVA par produit</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useReference ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? {
                                        useVatPerProduct: false,
                                        useReference: false,
                                        useStock: false,
                                        usePhoto: false,
                                        useDescription: false,
                                        useOptions: false,
                                    }),
                                    useReference: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser référence</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useStock ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? {
                                        useVatPerProduct: false,
                                        useReference: false,
                                        useStock: false,
                                        usePhoto: false,
                                        useDescription: false,
                                        useOptions: false,
                                    }),
                                    useStock: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser stock</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.usePhoto ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? {
                                        useVatPerProduct: false,
                                        useReference: false,
                                        useStock: false,
                                        usePhoto: false,
                                        useDescription: false,
                                        useOptions: false,
                                    }),
                                    usePhoto: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser photo</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useDescription ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? {
                                        useVatPerProduct: false,
                                        useReference: false,
                                        useStock: false,
                                        usePhoto: false,
                                        useDescription: false,
                                        useOptions: false,
                                    }),
                                    useDescription: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser description</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useOptions ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? {
                                        useVatPerProduct: false,
                                        useReference: false,
                                        useStock: false,
                                        usePhoto: false,
                                        useDescription: false,
                                        useOptions: false,
                                    }),
                                    useOptions: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser options</span>
                    </div>
                </div>
            </div>

            {/* Subsection: Recherche */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Recherche
                </h3>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.search?.searchCustomers ?? false}
                            onChange={(checked) =>
                                handleChange('search', {
                                    ...(config.search ?? {
                                        searchCustomers: false,
                                        searchProducts: false,
                                        searchUsers: false,
                                    }),
                                    searchCustomers: checked,
                                } as SearchSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Clients</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.search?.searchProducts ?? false}
                            onChange={(checked) =>
                                handleChange('search', {
                                    ...(config.search ?? {
                                        searchCustomers: false,
                                        searchProducts: false,
                                        searchUsers: false,
                                    }),
                                    searchProducts: checked,
                                } as SearchSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Produits</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.search?.searchUsers ?? false}
                            onChange={(checked) =>
                                handleChange('search', {
                                    ...(config.search ?? {
                                        searchCustomers: false,
                                        searchProducts: false,
                                        searchUsers: false,
                                    }),
                                    searchUsers: checked,
                                } as SearchSettings)
                            }
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utilisateurs</span>
                    </div>
                </div>
            </div>

            {/* Subsection: Affichage */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Affichage
                </h3>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showWaiting ?? true}
                            onChange={(checked) => handleDisplayChange('showWaiting', checked)}
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Mettre en attente</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showRefund ?? true}
                            onChange={(checked) => handleDisplayChange('showRefund', checked)}
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Remboursement</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showProvision ?? true}
                            onChange={(checked) => handleDisplayChange('showProvision', checked)}
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Provision</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showDebit ?? true}
                            onChange={(checked) => handleDisplayChange('showDebit', checked)}
                            isReadOnly={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Débit</span>
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}
