'use client';

import AdminButton from '@/app/components/admin/AdminButton';
import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import CurrenciesConfig from '@/app/components/admin/sections/CurrenciesConfig';
import DiscountsConfig from '@/app/components/admin/sections/DiscountsConfig';
import ParametersConfig from '@/app/components/admin/sections/ParametersConfig';
import PaymentsConfig from '@/app/components/admin/sections/PaymentsConfig';
import ColorsConfig from '@/app/components/admin/sections/ColorsConfig';
import { Parameters } from '@/app/contexts/ConfigProvider';
import { useConfig } from '@/app/hooks/useConfig';
import { usePopup } from '@/app/hooks/usePopup';
import { USE_DIGICARTE } from '@/app/utils/constants';
import { Currency, Discount, Mercurial, PaymentMethod, Color } from '@/app/utils/interfaces';
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
    const {
        parameters,
        discounts: configDiscounts,
        currencies,
        paymentMethods: configPayments,
        colors: configColors,
    } = useConfig();
    const { openFullscreenPopup } = usePopup();
    const [settings, setSettings] = useState<Parameters>(defaultParameters);
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [currenciesConfig, setCurrenciesConfig] = useState<Currency[]>([]);
    const [paymentsConfig, setPaymentsConfig] = useState<PaymentMethod[]>([]);
    const [colorsConfig, setColorsConfig] = useState<Color[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);
    const [isSiretValid, setIsSiretValid] = useState(true);
    const [hasChanges, setHasChanges] = useState(false);
    const [hasSettingsChanges, setHasSettingsChanges] = useState(false);
    const [hasDiscountsChanges, setHasDiscountsChanges] = useState(false);
    const [hasCurrenciesChanges, setHasCurrenciesChanges] = useState(false);
    const [hasPaymentsChanges, setHasPaymentsChanges] = useState(false);
    const [hasColorsChanges, setHasColorsChanges] = useState(false);
    const [originalSettings, setOriginalSettings] = useState<Parameters>(defaultParameters);
    const [originalDiscounts, setOriginalDiscounts] = useState<Discount[]>([]);
    const [originalCurrencies, setOriginalCurrencies] = useState<Currency[]>([]);
    const [originalPayments, setOriginalPayments] = useState<PaymentMethod[]>([]);
    const [originalColors, setOriginalColors] = useState<Color[]>([]);

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
                if (configPayments) setPaymentsConfig(configPayments);
                if (configColors) setColorsConfig(configColors);
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

            // Load payments and colors from config (no DB API yet)
            if (configPayments) {
                setPaymentsConfig(configPayments);
                setOriginalPayments(configPayments);
            }
            if (configColors) {
                setColorsConfig(configColors);
                setOriginalColors(configColors);
            }
        } catch (error) {
            console.error('Error fetching parameters:', error);
            if (parameters) setSettings(parameters);
        } finally {
            setIsLoading(false);
        }
    }, [isReadOnly, parameters, configDiscounts, currencies, configPayments, configColors]);

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
        const paymentsChanged = JSON.stringify(paymentsConfig) !== JSON.stringify(originalPayments);
        const colorsChanged = JSON.stringify(colorsConfig) !== JSON.stringify(originalColors);
        setHasSettingsChanges(settingsChanged);
        setHasDiscountsChanges(discountsChanged);
        setHasCurrenciesChanges(currenciesChanged);
        setHasPaymentsChanges(paymentsChanged);
        setHasColorsChanges(colorsChanged);
        setHasChanges(settingsChanged || discountsChanged || currenciesChanged || paymentsChanged || colorsChanged);
    }, [
        settings,
        discounts,
        currenciesConfig,
        paymentsConfig,
        colorsConfig,
        originalSettings,
        originalDiscounts,
        originalCurrencies,
        originalPayments,
        originalColors,
    ]);

    const handleSaveAll = async () => {
        // Save all changed sections
        if (hasSettingsChanges) await handleParametersSave(settings);
        if (hasDiscountsChanges) await handleDiscountsSave(discounts);
        if (hasCurrenciesChanges) await handleCurrenciesSave(currenciesConfig);
        if (hasPaymentsChanges) await handlePaymentsSave(paymentsConfig);
        if (hasColorsChanges) await handleColorsSave(colorsConfig);
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
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des devises.", ['OK']);
        }
    };

    const handleParametersSave = async (data: Parameters) => {
        if (!isSiretValid) {
            openFullscreenPopup("Veuillez corriger les erreurs avant d'enregistrer.", ['OK']);
            return;
        }
        setIsSaving(true);
        try {
            const paramUpdates = [
                { key: 'name', value: data.shop.name },
                { key: 'address', value: data.shop.address },
                { key: 'zipCode', value: data.shop.zipCode },
                { key: 'city', value: data.shop.city },
                { key: 'serial', value: data.shop.serial },
                { key: 'id', value: data.shop.id },
                { key: 'email', value: data.shop.email },
                { key: 'thanksMessage', value: data.thanksMessage },
                { key: 'mercurial', value: data.mercurial },
                { key: 'closingHour', value: String(data.closingHour) },
                { key: 'yearStartDate', value: JSON.stringify(data.yearStartDate) },
                { key: 'lastModified', value: new Date().toLocaleString() },
            ];

            const response = await fetch('/api/sql/updateParameters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parameters: paramUpdates }),
            });

            if (!response.ok) throw new Error('Failed to save parameters');

            fetchParameters();
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des paramètres.", ['OK']);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePaymentsSave = async (data: PaymentMethod[]) => {
        // Placeholder for payments save - implement when API is ready
        console.log('Saving payments:', data);
        setOriginalPayments(data);
    };

    const handleColorsSave = async (data: Color[]) => {
        // Placeholder for colors save - implement when API is ready
        console.log('Saving colors:', data);
        setOriginalColors(data);
    };

    const handleCancel = (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        openFullscreenPopup('Êtes-vous sûr de vouloir annuler les modifications ?', ['Oui', 'Non'], (index) => {
            if (index === 0) {
                // Restore from originally loaded DB data, not from ConfigProvider context
                setSettings(originalSettings);
                setDiscounts(originalDiscounts);
                setCurrenciesConfig(originalCurrencies);
                setPaymentsConfig(originalPayments);
                setColorsConfig(originalColors);
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

            <ParametersConfig
                config={settings}
                onChange={setSettings}
                onSave={handleParametersSave}
                hasChanges={hasSettingsChanges}
                isReadOnly={isReadOnly}
                isSiretValid={isSiretValid}
                onSiretValidation={setIsSiretValid}
            />

            <DiscountsConfig
                config={discounts}
                onChange={setDiscounts}
                onSave={handleDiscountsSave}
                hasChanges={hasDiscountsChanges}
                currencies={currencies}
                isReadOnly={isReadOnly}
            />

            <CurrenciesConfig
                config={currenciesConfig}
                onChange={setCurrenciesConfig}
                onSave={handleCurrenciesSave}
                hasChanges={hasCurrenciesChanges}
                isReadOnly={isReadOnly}
            />

            <PaymentsConfig
                config={paymentsConfig}
                onChange={setPaymentsConfig}
                onSave={handlePaymentsSave}
                currencies={currenciesConfig}
                isReadOnly={isReadOnly}
            />

            <ColorsConfig
                config={colorsConfig}
                onChange={setColorsConfig}
                onSave={handleColorsSave}
                isReadOnly={isReadOnly}
            />

            {!isReadOnly && hasChanges && (
                <div className="mt-6 flex justify-end gap-4">
                    <AdminButton onClick={handleCancel} variant="secondary">
                        Annuler
                    </AdminButton>
                    <AdminButton
                        onClick={handleSaveAll}
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
