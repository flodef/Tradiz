'use client';

import { Parameters } from '@/app/contexts/ConfigProvider';
import { adminTextStyle } from '@/app/utils/constants';
import { Mercurial } from '@/app/utils/interfaces';
import AdminInput from '../AdminInput';
import AdminSelect from '../AdminSelect';
import SectionCard from '../SectionCard';
import SiretInput from '../SiretInput';
import ValidatedInput from '../ValidatedInput';
import ZipCityRow from '../ZipCityRow';

interface ParametersConfigProps {
    config: Parameters;
    onChange: (data: Parameters) => void;
    onSave: (data: Parameters) => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isSiretValid?: boolean;
    onSiretValidation?: (isValid: boolean) => void;
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
    hasChanges = false,
    isReadOnly = false,
    isSiretValid = true,
    onSiretValidation,
}: ParametersConfigProps) {
    const maxDaysInMonth = (month: number): number => {
        const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return days[month - 1] ?? 31;
    };

    const handleChange = (field: keyof Parameters, value: string | number) => {
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
            saveDisabled={!isSiretValid}
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
                    <ValidatedInput
                        label="Adresse"
                        value={String(config.shop.address || '')}
                        onChange={(value) => handleShopChange('address', String(value))}
                        placeholder="Adresse"
                        disabled={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <div className="w-full flex flex-wrap gap-4 items-end">
                        <ZipCityRow
                            zipCode={String(config.shop.zipCode || '')}
                            city={String(config.shop.city || '')}
                            onZipChange={(value: string) => handleShopChange('zipCode', value)}
                            onCityChange={(value: string) => handleShopChange('city', value)}
                            disabled={isReadOnly}
                        />
                        <SiretInput
                            value={String(config.shop.serial || '')}
                            onChange={(value: string) => handleShopChange('serial', value)}
                            onValidation={onSiretValidation}
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
                    <ValidatedInput
                        label="Message de remerciement"
                        value={config.thanksMessage || ''}
                        onChange={(value) => handleChange('thanksMessage', String(value))}
                        placeholder="Message de remerciement"
                        disabled={isReadOnly}
                        className="max-w-xs flex-1"
                    />
                    <AdminSelect
                        label="Mercurial"
                        value={config.mercurial}
                        onChange={(e) => !isReadOnly && handleChange('mercurial', e.target.value as Mercurial)}
                        disabled={isReadOnly}
                        className="w-32"
                        options={[
                            { label: 'Aucun', value: Mercurial.none },
                            { label: 'Exponentielle', value: Mercurial.exponential },
                            { label: 'Douce', value: Mercurial.soft },
                            { label: 'Zelet', value: Mercurial.zelet },
                        ]}
                    />
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
                        className="w-28"
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
                                disabled={isReadOnly}
                                className="w-28"
                                options={MONTH_NAMES.map((name, i) => ({ label: name, value: i + 1 }))}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}
