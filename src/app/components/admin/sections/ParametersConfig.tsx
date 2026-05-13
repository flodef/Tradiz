'use client';

import { Parameters, ProductsSettings } from '@/app/contexts/ConfigProvider';
import { adminTextStyle } from '@/app/utils/constants';
import { Mercurial } from '@/app/utils/interfaces';
import AdminInput from '../AdminInput';
import AdminSelect from '../AdminSelect';
import SectionCard from '../SectionCard';
import Switch from '../Switch';
import SiretInput from '../SiretInput';
import ValidatedInput from '../ValidatedInput';
import ZipCityRow from '../ZipCityRow';

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
}: ParametersConfigProps) {
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

    return (
        <SectionCard
            title="Paramètres"
            onSave={isReadOnly || !hasChanges ? undefined : () => onSave(config)}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            saveDisabled={!isSiretValid}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Subsection: Commerce */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Commerce
                </h3>
                <div className="flex flex-wrap gap-4">
                    <ValidatedInput
                        label="Nom du commerce"
                        value={String(config.shop.name || '')}
                        onChange={(value) => handleShopChange('name', String(value))}
                        placeholder="Nom du commerce"
                        disabled={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <ValidatedInput
                        label="Email"
                        value={String(config.shop.email || '')}
                        onChange={(value) => handleShopChange('email', String(value))}
                        placeholder="Email"
                        disabled={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <SiretInput
                        value={String(config.shop.serial || '')}
                        onChange={(value: string) => handleShopChange('serial', value)}
                        onValidation={onSiretValidation}
                        disabled={isReadOnly}
                    />
                    <div className="w-full flex flex-wrap gap-4 items-end">
                        <ValidatedInput
                            label="Adresse"
                            value={String(config.shop.address || '')}
                            onChange={(value) => handleShopChange('address', String(value))}
                            placeholder="Adresse"
                            disabled={isReadOnly}
                            className="flex-1 min-w-40 max-w-xs"
                        />
                        <ZipCityRow
                            zipCode={String(config.shop.zipCode || '')}
                            city={String(config.shop.city || '')}
                            onZipChange={(value: string) => handleShopChange('zipCode', value)}
                            onCityChange={(value: string) => handleShopChange('city', value)}
                            disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                                disabled={isReadOnly}
                                onChange={(e) => handleYearStartDateChange('day', Number(e.target.value))}
                                className="w-14"
                                placeholder="Jour"
                            />
                            <AdminSelect
                                value={config.yearStartDate?.month || 1}
                                onChange={(e) => handleYearStartDateChange('month', Number(e.target.value))}
                                className="w-28"
                                options={MONTH_NAMES.map((name, i) => ({ label: name, value: i + 1 }))}
                                disabled={isReadOnly}
                            />
                        </div>
                    </div>
                    <ValidatedInput
                        label="Message de remerciement"
                        value={config.thanksMessage || ''}
                        onChange={(value) => handleChange('thanksMessage', String(value))}
                        placeholder="Message de remerciement"
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
                    />
                </div>
            </div>

            {/* Subsection: Produits */}
            <div className="mb-6">
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
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser options</span>
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}
