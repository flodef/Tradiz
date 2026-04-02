'use client';

import AdminButton from '@/app/components/admin/AdminButton';
import AdminInput from '@/app/components/admin/AdminInput';
import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import AdminSelect from '@/app/components/admin/AdminSelect';
import SectionCard from '@/app/components/admin/SectionCard';
import CurrenciesConfig from '@/app/components/admin/sections/CurrenciesConfig';
import DiscountsConfig from '@/app/components/admin/sections/DiscountsConfig';
import SiretInput from '@/app/components/admin/SiretInput';
import ValidatedInput from '@/app/components/admin/ValidatedInput';
import ZipCityRow from '@/app/components/admin/ZipCityRow';
import { Parameters } from '@/app/contexts/ConfigProvider';
import { useConfig } from '@/app/hooks/useConfig';
import { usePopup } from '@/app/hooks/usePopup';
import { USE_DIGICARTE } from '@/app/utils/constants';
import { Currency, Discount, Mercurial } from '@/app/utils/interfaces';
import { useIsMobile } from '@/app/utils/mobile';
import { defaultParameters } from '@/app/utils/processData';
import { useCallback, useEffect, useState } from 'react';

// Type for currency row from DB
interface CurrencyRow {
    0: string; // label
    1: number; // maxValue
    2: string; // symbol
    3: number; // decimals
    4?: number; // rate
    5?: number; // fee
}

export default function SettingsPage() {
    const isMobile = useIsMobile();
    const { parameters, discounts: configDiscounts, currencies } = useConfig();
    const { openFullscreenPopup } = usePopup();
    const [settings, setSettings] = useState<Parameters>(defaultParameters);
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [currenciesConfig, setCurrenciesConfig] = useState<Currency[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);
    const [isSiretValid, setIsSiretValid] = useState(true);
    const [hasChanges, setHasChanges] = useState(false);
    const [originalSettings, setOriginalSettings] = useState<Parameters>(defaultParameters);
    const [originalDiscounts, setOriginalDiscounts] = useState<Discount[]>([]);
    const [originalCurrencies, setOriginalCurrencies] = useState<Currency[]>([]);

    // Step 1: check DB config once on mount
    useEffect(() => {
        fetch('/api/sql/getDbConfig')
            .then((r) => r.json())
            .then(({ hasDbConfig }) => {
                setIsReadOnly(!hasDbConfig);
                setDbConfigChecked(true);
            })
            .catch(() => {
                setIsReadOnly(true);
                setDbConfigChecked(true);
            });
    }, []);

    const fetchParameters = useCallback(async () => {
        setIsLoading(true);
        try {
            if (isReadOnly) {
                if (parameters?.lastModified) setSettings(parameters);
                if (configDiscounts) setDiscounts(configDiscounts);
                if (currencies) setCurrenciesConfig(currencies);
                setIsLoading(false);
                return;
            }

            const response = await fetch('/api/sql/getParameters');
            const data = await response.json();

            if (data.values && data.values.length > 0) {
                const paramMap = new Map<string, string>();
                data.values.forEach(([key, value]: [string, string]) => {
                    paramMap.set(key, value);
                });

                const loadedSettings: Parameters = {
                    shop: {
                        name: paramMap.get('name') || '',
                        address: paramMap.get('address') || '',
                        zipCode: paramMap.get('zipCode') || '',
                        city: paramMap.get('city') || '',
                        serial: paramMap.get('serial') || '',
                        id: paramMap.get('id') || '',
                        email: paramMap.get('email') || '',
                    },
                    thanksMessage: paramMap.get('thanksMessage') || 'Merci de votre visite !',
                    mercurial: (paramMap.get('mercurial') || Mercurial.none) as Mercurial,
                    closingHour: Math.max(0, Math.min(23, Number(paramMap.get('closingHour')) || 0)),
                    yearStartDate: (() => {
                        try {
                            const value = paramMap.get('yearStartDate');
                            if (value) {
                                const parsed = JSON.parse(value);
                                if (parsed && typeof parsed.month === 'number' && typeof parsed.day === 'number') {
                                    return parsed;
                                }
                            }
                        } catch {
                            // Invalid JSON
                        }
                        return { month: 1, day: 1 };
                    })(),
                    lastModified: paramMap.get('lastModified') || new Date().toLocaleString(),
                    user: parameters?.user || { name: '', role: 0 },
                };

                setSettings(loadedSettings);
                setOriginalSettings(loadedSettings);
            }

            // Load discounts from DB
            try {
                const discountsResponse = await fetch('/api/sql/getDiscounts');
                const discountsData = await discountsResponse.json();
                if (discountsData.values && discountsData.values.length > 1) {
                    const loaded: Discount[] = discountsData.values
                        .slice(1)
                        .map(([amount, unit]: [number, string]) => ({
                            amount: Number(amount),
                            unit: String(unit).trim(),
                        }));
                    setDiscounts(loaded);
                    setOriginalDiscounts(loaded);
                }
            } catch {
                if (configDiscounts) setDiscounts(configDiscounts);
            }

            // Load currencies from DB
            try {
                const currenciesResponse = await fetch('/api/sql/getCurrencies');
                const currenciesData = await currenciesResponse.json();
                if (currenciesData.values && currenciesData.values.length > 1) {
                    const loaded: Currency[] = currenciesData.values.slice(1).map((row: CurrencyRow) => ({
                        label: String(row[0]),
                        maxValue: Number(row[1]),
                        symbol: String(row[2]),
                        decimals: Number(row[3]),
                        rate: Number(row[4] ?? 1),
                        fee: Number(row[5] ?? 0),
                    }));
                    setCurrenciesConfig(loaded);
                    setOriginalCurrencies(loaded);
                }
            } catch {
                if (currencies) setCurrenciesConfig(currencies);
            }
        } catch (error) {
            console.error('Error fetching parameters:', error);
            if (parameters) setSettings(parameters);
        } finally {
            setIsLoading(false);
        }
    }, [isReadOnly, parameters, configDiscounts, currencies]);

    // Step 2: once DB config is known, load data
    useEffect(() => {
        if (!dbConfigChecked) return;
        fetchParameters();
    }, [dbConfigChecked, fetchParameters]);

    // Track changes by comparing current state with original loaded data
    useEffect(() => {
        const settingsChanged = JSON.stringify(settings) !== JSON.stringify(originalSettings);
        const discountsChanged = JSON.stringify(discounts) !== JSON.stringify(originalDiscounts);
        const currenciesChanged = JSON.stringify(currenciesConfig) !== JSON.stringify(originalCurrencies);
        setHasChanges(settingsChanged || discountsChanged || currenciesChanged);
    }, [settings, discounts, currenciesConfig, originalSettings, originalDiscounts, originalCurrencies]);

    const handleChange = (field: keyof Parameters, value: string | number) => {
        setSettings((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleShopChange = (field: string, value: string) => {
        setSettings((prev) => ({
            ...prev,
            shop: {
                ...prev.shop,
                [field]: value,
            },
        }));
    };

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

    const maxDaysInMonth = (month: number): number => {
        const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return days[month - 1] ?? 31;
    };

    const handleYearStartDateChange = (field: 'month' | 'day', value: number) => {
        setSettings((prev) => {
            const currentMonth = prev.yearStartDate?.month || 1;
            const currentDay = prev.yearStartDate?.day || 1;
            if (field === 'month') {
                const newMonth = Math.max(1, Math.min(12, value));
                const maxDay = maxDaysInMonth(newMonth);
                return {
                    ...prev,
                    yearStartDate: { month: newMonth, day: Math.min(currentDay, maxDay) },
                };
            } else {
                const maxDay = maxDaysInMonth(currentMonth);
                return {
                    ...prev,
                    yearStartDate: { month: currentMonth, day: Math.max(1, Math.min(maxDay, value)) },
                };
            }
        });
    };

    const handleDiscountsSave = async (data: Discount[]) => {
        try {
            const response = await fetch('/api/sql/updateDiscounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ discounts: data }),
            });
            if (!response.ok) throw new Error('Failed to save discounts');
            setDiscounts(data);
            openFullscreenPopup('Réductions enregistrées avec succès !', ['OK']);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des réductions.", ['OK']);
        }
    };

    const handleCurrenciesSave = async (data: Currency[]) => {
        try {
            const response = await fetch('/api/sql/updateCurrencies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currencies: data }),
            });
            if (!response.ok) throw new Error('Failed to save currencies');
            setCurrenciesConfig(data);
            openFullscreenPopup('Devises enregistrées avec succès !', ['OK']);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des devises.", ['OK']);
        }
    };

    const handleSave = async () => {
        if (!isSiretValid) {
            openFullscreenPopup("Veuillez corriger les erreurs avant d'enregistrer.", ['OK']);
            return;
        }
        setIsSaving(true);
        try {
            const paramUpdates = [
                { key: 'name', value: settings.shop.name },
                { key: 'address', value: settings.shop.address },
                { key: 'zipCode', value: settings.shop.zipCode },
                { key: 'city', value: settings.shop.city },
                { key: 'serial', value: settings.shop.serial },
                { key: 'id', value: settings.shop.id },
                { key: 'email', value: settings.shop.email },
                { key: 'thanksMessage', value: settings.thanksMessage },
                { key: 'mercurial', value: settings.mercurial },
                { key: 'closingHour', value: String(settings.closingHour) },
                { key: 'yearStartDate', value: JSON.stringify(settings.yearStartDate) },
                { key: 'lastModified', value: new Date().toLocaleString() },
            ];

            const response = await fetch('/api/sql/updateParameters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parameters: paramUpdates }),
            });

            if (!response.ok) throw new Error('Failed to save parameters');

            openFullscreenPopup('Paramètres enregistrés avec succès !', ['OK'], () => {
                fetchParameters();
            });
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des paramètres.", ['OK']);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        openFullscreenPopup('Êtes-vous sûr de vouloir annuler les modifications ?', ['Oui', 'Non'], (index) => {
            if (index === 0) {
                // Restore from ConfigProvider context instead of fetching from DB
                if (parameters) {
                    setSettings(parameters);
                    setOriginalSettings(parameters);
                }
                if (configDiscounts) {
                    setDiscounts(configDiscounts);
                    setOriginalDiscounts(configDiscounts);
                }
                if (currencies) {
                    setCurrenciesConfig(currencies);
                    setOriginalCurrencies(currencies);
                }
                setHasChanges(false);
            }
        });
    };

    if (USE_DIGICARTE) return null;

    if (isLoading) {
        return (
            <AdminPageLayout title="Configuration">
                <p>Chargement...</p>
            </AdminPageLayout>
        );
    }

    if (!settings || !settings.shop) {
        return (
            <AdminPageLayout title="Configuration">
                <p>Erreur de chargement des données</p>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Configuration">
            {isReadOnly && (
                <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Mode lecture seule :</strong> La base de données n'est pas configurée. Les modifications
                        ne seront pas enregistrées.
                    </p>
                </div>
            )}

            <SectionCard
                title="Informations du commerce"
                onSave={isReadOnly ? undefined : handleSave}
                saveDisabled={!isSiretValid}
            >
                <div className="flex flex-wrap gap-4">
                    <ValidatedInput
                        label="Nom du commerce"
                        value={String(settings.shop.name || '')}
                        onChange={(value) => handleShopChange('name', String(value))}
                        placeholder="Nom du commerce"
                        disabled={isReadOnly}
                        className="flex-1 min-w-40"
                    />
                    <ValidatedInput
                        label="Email"
                        value={String(settings.shop.email || '')}
                        onChange={(value) => handleShopChange('email', String(value))}
                        placeholder="Email"
                        disabled={isReadOnly}
                        className="flex-1 min-w-40"
                    />
                    <ValidatedInput
                        label="Adresse"
                        value={String(settings.shop.address || '')}
                        onChange={(value) => handleShopChange('address', String(value))}
                        placeholder="Adresse"
                        disabled={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <div className="w-full flex flex-wrap gap-4 items-end">
                        <ZipCityRow
                            zipCode={String(settings.shop.zipCode || '')}
                            city={String(settings.shop.city || '')}
                            onZipChange={(value: string) => handleShopChange('zipCode', value)}
                            onCityChange={(value: string) => handleShopChange('city', value)}
                            disabled={isReadOnly}
                        />
                        <SiretInput
                            value={String(settings.shop.serial || '')}
                            onChange={(value: string) => handleShopChange('serial', value)}
                            onValidation={setIsSiretValid}
                            disabled={isReadOnly}
                        />
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Paramètres généraux" onSave={isReadOnly ? undefined : handleSave}>
                <div className="flex flex-wrap gap-4 items-end">
                    <ValidatedInput
                        label="Message de remerciement"
                        value={settings.thanksMessage || ''}
                        onChange={(value) => handleChange('thanksMessage', String(value))}
                        placeholder="Message de remerciement"
                        disabled={isReadOnly}
                        className="max-w-xs flex-1"
                    />
                    <AdminSelect
                        label="Mercurial"
                        value={settings.mercurial}
                        onChange={(e) => !isReadOnly && handleChange('mercurial', e.target.value as Mercurial)}
                        disabled={isReadOnly}
                        className="w-40"
                        options={[
                            { label: 'Aucun', value: Mercurial.none },
                            { label: 'Exponentielle', value: Mercurial.exponential },
                            { label: 'Douce', value: Mercurial.soft },
                            { label: 'Zelet', value: Mercurial.zelet },
                        ]}
                    />
                    <AdminInput
                        label="Heure de clôture (0-23)"
                        type="number"
                        min={0}
                        max={23}
                        value={settings.closingHour}
                        onChange={(e) =>
                            !isReadOnly &&
                            handleChange('closingHour', Math.max(0, Math.min(23, Number(e.target.value))))
                        }
                        disabled={isReadOnly}
                        className="w-32"
                    />
                    <div className="flex flex-col">
                        <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                            Début d&apos;année fiscale
                        </label>
                        <div className="flex gap-2">
                            <AdminInput
                                type="number"
                                min={1}
                                max={maxDaysInMonth(settings.yearStartDate?.month || 1)}
                                value={settings.yearStartDate?.day || 1}
                                disabled={isReadOnly}
                                onChange={(e) => handleYearStartDateChange('day', Number(e.target.value))}
                                className="w-16"
                                placeholder="Jour"
                            />
                            <AdminSelect
                                value={settings.yearStartDate?.month || 1}
                                onChange={(e) => handleYearStartDateChange('month', Number(e.target.value))}
                                disabled={isReadOnly}
                                className="w-32"
                                options={MONTH_NAMES.map((name, i) => ({ label: name, value: i + 1 }))}
                            />
                        </div>
                    </div>
                </div>
            </SectionCard>

            <DiscountsConfig
                config={discounts}
                onChange={setDiscounts}
                onSave={handleDiscountsSave}
                currencies={currencies?.map((c) => ({ label: c.label, value: c.label })) ?? []}
                isReadOnly={isReadOnly}
            />

            <CurrenciesConfig
                config={currenciesConfig}
                onChange={setCurrenciesConfig}
                onSave={handleCurrenciesSave}
                isReadOnly={isReadOnly}
            />

            {!isReadOnly && hasChanges && (
                <div className="mt-6 flex justify-end gap-4">
                    <AdminButton onClick={handleCancel} variant="secondary">
                        Annuler
                    </AdminButton>
                    <AdminButton
                        onClick={handleSave}
                        isLoading={isSaving}
                        disabled={!isSiretValid}
                        variant="save"
                        className={isMobile ? 'px-3 py-2' : ''}
                    >
                        {isMobile ? 'Enregistrer tout' : 'Enregistrer tous les paramètres'}
                    </AdminButton>
                </div>
            )}
        </AdminPageLayout>
    );
}
