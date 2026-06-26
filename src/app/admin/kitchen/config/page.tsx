'use client';

import AdminButton from '@/app/components/admin/AdminButton';
import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import CurrenciesConfig from '@/app/components/admin/sections/CurrenciesConfig';
import DiscountsConfig from '@/app/components/admin/sections/DiscountsConfig';
import ParametersConfig from '@/app/components/admin/sections/ParametersConfig';
import PaymentsConfig from '@/app/components/admin/sections/PaymentsConfig';
import ColorsConfig from '@/app/components/admin/sections/ColorsConfig';
import UsersConfig from '@/app/components/admin/sections/UsersConfig';
import CustomersConfig from '@/app/components/admin/sections/CustomersConfig';
import { Parameters } from '@/app/contexts/ConfigProvider';
import { useConfig } from '@/app/hooks/useConfig';
import { usePopup } from '@/app/hooks/usePopup';
import { USE_DIGICARTE, INTERNAL_PAYMENT_METHODS } from '@/app/utils/constants';
import { Currency, Discount, Mercurial, PaymentMethod, Color, User, Role, Customer } from '@/app/utils/interfaces';
import { useUserRole } from '@/app/hooks/useUserRole';
import { useIsMobile } from '@/app/utils/mobile';
import { clearLoadDataCache, defaultParameters } from '@/app/utils/processData';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadingDot } from '@/app/loading';
import {
    IconSettings,
    IconDiscount,
    IconCurrency,
    IconCreditCard,
    IconUserScan,
    IconPalette,
    IconUsersGroup,
} from '@tabler/icons-react';

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
        setParameters,
        discounts: configDiscounts,
        currencies,
        paymentMethods: configPayments,
        colors: configColors,
    } = useConfig();
    const { openFullscreenPopup } = usePopup();
    const { isAdmin } = useUserRole();
    const [settings, setSettings] = useState<Parameters>(defaultParameters);
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [currenciesConfig, setCurrenciesConfig] = useState<Currency[]>([]);
    const [paymentsConfig, setPaymentsConfig] = useState<PaymentMethod[]>([]);
    const [colorsConfig, setColorsConfig] = useState<Color[]>([]);
    const [usersConfig, setUsersConfig] = useState<User[]>([]);
    const [customersConfig, setCustomersConfig] = useState<Customer[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingUsers, setIsSavingUsers] = useState(false);
    const [isSavingCustomers, setIsSavingCustomers] = useState(false);
    const dbConfigCheckedRef = useRef(false);
    const dataLoadedRef = useRef(false);
    const [isSavingParameters, setIsSavingParameters] = useState(false);
    const [isSavingDiscounts, setIsSavingDiscounts] = useState(false);
    const [isSavingCurrencies, setIsSavingCurrencies] = useState(false);
    const [isSavingPayments, setIsSavingPayments] = useState(false);
    const [isSavingColors, setIsSavingColors] = useState(false);
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
    const [hasUsersChanges, setHasUsersChanges] = useState(false);
    const [hasCustomersChanges, setHasCustomersChanges] = useState(false);
    const [isUsersValid, setIsUsersValid] = useState(true);
    const [isCustomersValid, setIsCustomersValid] = useState(true);
    const [originalSettings, setOriginalSettings] = useState<Parameters>(defaultParameters);
    const [originalDiscounts, setOriginalDiscounts] = useState<Discount[]>([]);
    const [originalCurrencies, setOriginalCurrencies] = useState<Currency[]>([]);
    const [originalPayments, setOriginalPayments] = useState<PaymentMethod[]>([]);
    const [originalColors, setOriginalColors] = useState<Color[]>([]);
    const [originalUsers, setOriginalUsers] = useState<User[]>([]);
    const [originalCustomers, setOriginalCustomers] = useState<Customer[]>([]);
    const [themeName, setThemeName] = useState<string>('');
    const [originalThemeName, setOriginalThemeName] = useState<string>('');
    const [selectedThemeIndex, setSelectedThemeIndex] = useState<number>(0);
    const [originalSelectedThemeIndex, setOriginalSelectedThemeIndex] = useState<number>(0);
    const [customThemeNames, setCustomThemeNames] = useState<Record<number, string>>({});
    const [originalCustomThemeNames, setOriginalCustomThemeNames] = useState<Record<number, string>>({});
    const [openSection, setOpenSection] = useState<string | null>(null);

    // Warn about unsaved changes when leaving page
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    // Step 1: check DB config once on mount
    useEffect(() => {
        if (dbConfigCheckedRef.current) return;
        dbConfigCheckedRef.current = true;

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

                // Helper function to get parameter value (handles both English and French keys)
                const getParam = (enKey: string, frKey: string): string => {
                    return paramMap.get(enKey) || paramMap.get(frKey) || '';
                };

                const loadedSettings: Parameters = {
                    shop: {
                        name: getParam('name', 'Nom du commerce'),
                        address: getParam('address', 'Adresse'),
                        zipCode: getParam('zipCode', 'Code postal'),
                        city: getParam('city', 'Ville'),
                        serial: getParam('serial', 'SIRET'),
                        id: getParam('id', 'Identifiant'),
                        email: getParam('email', 'Email de contact'),
                    },
                    thanksMessage: getParam('thanksMessage', 'Message de remerciement') || 'Merci de votre visite !',
                    mercurial: (getParam('mercurial', 'Mercuriale quadratique') || Mercurial.none) as Mercurial,
                    closingHour: Math.max(0, Math.min(23, Number(getParam('closingHour', 'Heure de fermeture')) || 0)),
                    yearStartDate: (() => {
                        try {
                            const value = getParam('yearStartDate', 'Année fiscale');
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
                    lastModified: getParam('lastModified', 'Dernière modification') || new Date().toLocaleString(),
                    user: parameters?.user || { name: '', role: 0 },
                    products: (() => {
                        try {
                            const value = getParam('productsSettings', 'Paramètres produits');
                            if (value) {
                                const parsed = JSON.parse(value);
                                if (parsed && typeof parsed === 'object') {
                                    return {
                                        useVatPerProduct: parsed.useVatPerProduct ?? false,
                                        useReference: parsed.useReference ?? false,
                                        useStock: parsed.useStock ?? false,
                                        usePhoto: parsed.usePhoto ?? false,
                                        useDescription: parsed.useDescription ?? false,
                                        useOptions: parsed.useOptions ?? false,
                                    };
                                }
                            }
                        } catch {
                            // Invalid JSON
                        }
                        return undefined;
                    })(),
                    search: (() => {
                        try {
                            const value = getParam('searchSettings', 'Paramètres recherche');
                            if (value) {
                                const parsed = JSON.parse(value);
                                if (parsed && typeof parsed === 'object') {
                                    return {
                                        searchCustomers: parsed.searchCustomers ?? false,
                                        searchProducts: parsed.searchProducts ?? false,
                                        searchUsers: parsed.searchUsers ?? false,
                                    };
                                }
                            }
                        } catch {
                            // Invalid JSON
                        }
                        return undefined;
                    })(),
                };

                setSettings(loadedSettings);
                setOriginalSettings(loadedSettings);
            }

            // Load discounts from DB
            try {
                const discountsResponse = await fetch('/api/sql/getDiscounts');
                const discountsData = await discountsResponse.json();
                if (discountsData.values && discountsData.values.length > 1) {
                    const loaded: Discount[] = discountsData.values.slice(1).map((row: (string | number)[]) => ({
                        amount: Number(row[0]),
                        unit: String(row[1]).trim(),
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

            // Load payments from DB
            try {
                const paymentsResponse = await fetch('/api/sql/getPaymentMethods');
                const paymentsData = await paymentsResponse.json();
                if (paymentsData.values && paymentsData.values.length > 1) {
                    const loaded: PaymentMethod[] = paymentsData.values
                        .slice(1)
                        .filter((row: unknown[]) => {
                            const type = String(row[0]);
                            return !INTERNAL_PAYMENT_METHODS.includes(type);
                        })
                        .map((row: unknown[]) => ({
                            type: String(row[0]),
                            id: String(row[1]),
                            currency: String(row[2]),
                            availability: Boolean(row[3]),
                        }));
                    setPaymentsConfig(loaded);
                    setOriginalPayments(loaded);
                }
            } catch {
                if (configPayments) {
                    const filtered = configPayments.filter((p) => !INTERNAL_PAYMENT_METHODS.includes(p.type));
                    setPaymentsConfig(filtered);
                    setOriginalPayments(filtered);
                }
            }

            // Load colors/theme from DB
            try {
                const colorsResponse = await fetch('/api/sql/getColors');
                const colorsData = await colorsResponse.json();
                if (colorsData.values && colorsData.values.length > 1) {
                    const loaded: Color[] = colorsData.values.slice(1).map((row: string[]) => ({
                        label: String(row[0]),
                        light: String(row[1]),
                        dark: String(row[2]),
                    }));
                    setColorsConfig(loaded);
                    setOriginalColors(loaded);
                    if (colorsData.themeName) {
                        setThemeName(String(colorsData.themeName));
                        setOriginalThemeName(String(colorsData.themeName));
                    }
                }
            } catch {
                if (configColors) {
                    setColorsConfig(configColors);
                    setOriginalColors(configColors);
                }
            }

            // Load users from DB
            try {
                const usersResponse = await fetch('/api/sql/getUsers');
                const usersData = await usersResponse.json();
                if (usersData.values && usersData.values.length > 1) {
                    const loaded: User[] = usersData.values.slice(1).map((row: string[]) => ({
                        key: String(row[0]),
                        name: String(row[1]),
                        role: String(row[2]) as Role,
                        reference: row[3] ? String(row[3]) : undefined,
                    }));
                    setUsersConfig(loaded);
                    setOriginalUsers(loaded);
                }
            } catch {
                // No fallback for users - start with empty list
                setUsersConfig([]);
                setOriginalUsers([]);
            }

            // Load customers from DB
            try {
                const customersResponse = await fetch('/api/sql/getCustomers');
                const customersData = await customersResponse.json();
                if (customersData.values && customersData.values.length > 1) {
                    const loaded: Customer[] = customersData.values.slice(1).map((row: string[]) => ({
                        id: row[0] ? Number(row[0]) : undefined,
                        firstName: String(row[1]),
                        lastName: String(row[2]),
                        reference: row[3] ? String(row[3]) : undefined,
                        email: row[4] ? String(row[4]) : undefined,
                        phone: row[5] ? String(row[5]) : undefined,
                    }));
                    setCustomersConfig(loaded);
                    setOriginalCustomers(loaded);
                }
            } catch {
                // No fallback for customers - start with empty list
                setCustomersConfig([]);
                setOriginalCustomers([]);
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
        if (dataLoadedRef.current) return;
        dataLoadedRef.current = true;
        fetchParameters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbConfigChecked]);

    // Track changes by comparing current state with original loaded data
    useEffect(() => {
        const settingsChanged = JSON.stringify(settings) !== JSON.stringify(originalSettings);
        const discountsChanged = JSON.stringify(discounts) !== JSON.stringify(originalDiscounts);
        const currenciesChanged = JSON.stringify(currenciesConfig) !== JSON.stringify(originalCurrencies);
        const paymentsChanged = JSON.stringify(paymentsConfig) !== JSON.stringify(originalPayments);
        const colorsChanged =
            JSON.stringify(colorsConfig) !== JSON.stringify(originalColors) ||
            themeName !== originalThemeName ||
            selectedThemeIndex !== originalSelectedThemeIndex ||
            JSON.stringify(customThemeNames) !== JSON.stringify(originalCustomThemeNames);
        const usersChanged = JSON.stringify(usersConfig) !== JSON.stringify(originalUsers);
        const customersChanged = JSON.stringify(customersConfig) !== JSON.stringify(originalCustomers);
        setHasSettingsChanges(settingsChanged);
        setHasDiscountsChanges(discountsChanged);
        setHasCurrenciesChanges(currenciesChanged);
        setHasPaymentsChanges(paymentsChanged);
        setHasColorsChanges(colorsChanged);
        setHasUsersChanges(usersChanged);
        setHasCustomersChanges(customersChanged);
        setHasChanges(
            settingsChanged ||
                discountsChanged ||
                currenciesChanged ||
                paymentsChanged ||
                colorsChanged ||
                usersChanged ||
                customersChanged
        );
    }, [
        settings,
        discounts,
        currenciesConfig,
        paymentsConfig,
        colorsConfig,
        usersConfig,
        customersConfig,
        themeName,
        selectedThemeIndex,
        customThemeNames,
        originalSettings,
        originalDiscounts,
        originalCurrencies,
        originalPayments,
        originalColors,
        originalUsers,
        originalCustomers,
        originalThemeName,
        originalSelectedThemeIndex,
        originalCustomThemeNames,
    ]);

    const handleSaveAll = async () => {
        // Save all changed sections
        setIsSaving(true);
        if (hasSettingsChanges) await handleParametersSave(settings);
        if (hasDiscountsChanges) await handleDiscountsSave(discounts);
        if (hasCurrenciesChanges) await handleCurrenciesSave(currenciesConfig);
        if (hasPaymentsChanges) await handlePaymentsSave(paymentsConfig);
        if (hasCustomersChanges) await handleCustomersSave(customersConfig);
        if (hasColorsChanges) await handleColorsSave(colorsConfig);
        if (hasUsersChanges) await handleUsersSave(usersConfig);
        setIsSaving(false);
    };

    const handleUsersSave = async (data: User[]) => {
        setIsSavingUsers(true);
        setIsSaving(true);
        try {
            const response = await fetch('/api/sql/updateUsers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users: data }),
            });
            if (!response.ok) throw new Error('Failed to save users');
            setOriginalUsers(data);
            setHasUsersChanges(false);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des utilisateurs.", ['OK']);
        } finally {
            setIsSavingUsers(false);
            setIsSaving(false);
        }
    };

    const handleCurrenciesSave = async (data: Currency[]) => {
        setIsSavingCurrencies(true);
        setIsSaving(true);
        try {
            const response = await fetch('/api/sql/updateCurrencies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currencies: data }),
            });
            if (!response.ok) throw new Error('Failed to save currencies');
            setCurrenciesConfig(data);
            setOriginalCurrencies(data);
            setHasCurrenciesChanges(false);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des devises.", ['OK']);
        } finally {
            setIsSavingCurrencies(false);
            setIsSaving(false);
        }
    };

    const handleParametersSave = async (data: Parameters) => {
        if (!isSiretValid) {
            openFullscreenPopup("Veuillez corriger les erreurs avant d'enregistrer.", ['OK']);
            return;
        }
        setIsSavingParameters(true);
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
                { key: 'productsSettings', value: JSON.stringify(data.products ?? {}) },
                { key: 'searchSettings', value: JSON.stringify(data.search ?? {}) },
            ];

            const response = await fetch('/api/sql/updateParameters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parameters: paramUpdates }),
            });

            if (!response.ok) throw new Error('Failed to save parameters');

            // Update local state without refetching
            setSettings(data);
            setOriginalSettings(data);
            setHasSettingsChanges(false);

            // Update ConfigProvider parameters directly
            setParameters(data);

            // Invalidate the loadData cache so other ConfigProvider instances
            // (e.g. the POS app) re-fetch fresh parameters from the DB on next mount
            clearLoadDataCache();
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des paramètres.", ['OK']);
        } finally {
            setIsSavingParameters(false);
            setIsSaving(false);
        }
    };

    const handlePaymentsSave = async (data: PaymentMethod[]) => {
        setIsSavingPayments(true);
        setIsSaving(true);
        try {
            const response = await fetch('/api/sql/updatePaymentMethods', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentMethods: data }),
            });
            if (!response.ok) throw new Error('Failed to save payment methods');
            setOriginalPayments(data);
            setHasPaymentsChanges(false);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des moyens de paiement.", ['OK']);
        } finally {
            setIsSavingPayments(false);
            setIsSaving(false);
        }
    };

    const handleDiscountsSave = async (data: Discount[]) => {
        setIsSavingDiscounts(true);
        setIsSaving(true);
        try {
            const response = await fetch('/api/sql/updateDiscounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ discounts: data }),
            });
            if (!response.ok) throw new Error('Failed to save discounts');
            setOriginalDiscounts(data);
            setHasDiscountsChanges(false);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des réductions.", ['OK']);
        } finally {
            setIsSavingDiscounts(false);
            setIsSaving(false);
        }
    };

    const handleColorsSave = async (data: Color[]) => {
        setIsSavingColors(true);
        setIsSaving(true);
        try {
            // Save all themes (colors, names, and selected index)
            await fetch('/api/sql/updateColors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    colors: data,
                    themeName,
                    selectedThemeIndex,
                    customThemeNames,
                }),
            });
            setOriginalColors(data);
            setOriginalThemeName(themeName);
            setOriginalSelectedThemeIndex(selectedThemeIndex);
            setOriginalCustomThemeNames(customThemeNames);
            setHasColorsChanges(false);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des couleurs.", ['OK']);
        } finally {
            setIsSavingColors(false);
            setIsSaving(false);
        }
    };

    const handleCustomersSave = async (data: Customer[]) => {
        setIsSavingCustomers(true);
        setIsSaving(true);
        try {
            await fetch('/api/sql/updateCustomers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customers: data }),
            });
            setOriginalCustomers(data);
            setHasCustomersChanges(false);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des clients.", ['OK']);
        } finally {
            setIsSavingCustomers(false);
            setIsSaving(false);
        }
    };

    const handleThemeNameChange = (name: string) => {
        setThemeName(name);
    };

    const handleThemeSelect = (index: number) => {
        setSelectedThemeIndex(index);
    };

    const handleCustomThemeNamesChange = (names: Record<number, string>) => {
        setCustomThemeNames(names);
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
                setUsersConfig(originalUsers);
                setCustomersConfig(originalCustomers);
                setThemeName(originalThemeName);
                setSelectedThemeIndex(originalSelectedThemeIndex);
                setCustomThemeNames(originalCustomThemeNames);
                setHasChanges(false);
            }
        });
    };

    if (USE_DIGICARTE) return null;

    if (isLoading) {
        return (
            <AdminPageLayout title="Configuration" hasChanges={false}>
                <LoadingDot fullscreen />
            </AdminPageLayout>
        );
    }

    if (!settings || !settings.shop) {
        return (
            <AdminPageLayout title="Configuration" hasChanges={false}>
                <p>Erreur de chargement des données</p>
            </AdminPageLayout>
        );
    }

    // Check admin access
    if (!isAdmin) {
        return (
            <AdminPageLayout title="Configuration" hasChanges={false}>
                <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                    <p className="text-red-800 dark:text-red-200">
                        <strong>Accès refusé :</strong> Cette page est réservée aux administrateurs.
                    </p>
                </div>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Configuration" hasChanges={hasChanges}>
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
                onCancel={handleCancel}
                hasChanges={hasSettingsChanges}
                isReadOnly={isReadOnly}
                isSiretValid={isSiretValid}
                onSiretValidation={setIsSiretValid}
                isLoading={isSavingParameters}
                isOpen={openSection === 'parameters'}
                onToggle={() => setOpenSection((prev) => (prev === 'parameters' ? null : 'parameters'))}
                icon={<IconSettings size={24} />}
            />

            <DiscountsConfig
                config={discounts}
                onChange={setDiscounts}
                onSave={handleDiscountsSave}
                onCancel={handleCancel}
                hasChanges={hasDiscountsChanges}
                currencies={currenciesConfig}
                isReadOnly={isReadOnly}
                isLoading={isSavingDiscounts}
                isOpen={openSection === 'discounts'}
                onToggle={() => setOpenSection((prev) => (prev === 'discounts' ? null : 'discounts'))}
                icon={<IconDiscount size={24} />}
            />

            <CurrenciesConfig
                config={currenciesConfig}
                onChange={setCurrenciesConfig}
                onSave={handleCurrenciesSave}
                onCancel={handleCancel}
                hasChanges={hasCurrenciesChanges}
                isReadOnly={isReadOnly}
                isLoading={isSavingCurrencies}
                isOpen={openSection === 'currencies'}
                onToggle={() => setOpenSection((prev) => (prev === 'currencies' ? null : 'currencies'))}
                icon={<IconCurrency size={24} />}
            />

            <PaymentsConfig
                config={paymentsConfig}
                onChange={setPaymentsConfig}
                onSave={hasPaymentsChanges ? handlePaymentsSave : undefined}
                currencies={currenciesConfig}
                isReadOnly={isReadOnly}
                onCancel={hasPaymentsChanges ? handleCancel : undefined}
                isLoading={isSavingPayments}
                isOpen={openSection === 'payments'}
                onToggle={() => setOpenSection((prev) => (prev === 'payments' ? null : 'payments'))}
                icon={<IconCreditCard size={24} />}
            />

            <UsersConfig
                config={usersConfig}
                onChange={setUsersConfig}
                onSave={hasUsersChanges ? handleUsersSave : undefined}
                onCancel={hasUsersChanges ? handleCancel : undefined}
                isReadOnly={isReadOnly}
                isLoading={isSavingUsers}
                isOpen={openSection === 'users'}
                onToggle={() => setOpenSection((prev) => (prev === 'users' ? null : 'users'))}
                icon={<IconUserScan size={24} />}
                onValidation={setIsUsersValid}
            />

            <CustomersConfig
                config={customersConfig}
                onChange={setCustomersConfig}
                onSave={hasCustomersChanges ? handleCustomersSave : undefined}
                isReadOnly={isReadOnly}
                onCancel={hasCustomersChanges ? handleCancel : undefined}
                isLoading={isSavingCustomers}
                isOpen={openSection === 'customers'}
                onToggle={() => setOpenSection((prev) => (prev === 'customers' ? null : 'customers'))}
                icon={<IconUsersGroup size={24} />}
                onValidation={setIsCustomersValid}
            />

            <ColorsConfig
                config={colorsConfig}
                onChange={setColorsConfig}
                onSave={hasColorsChanges ? handleColorsSave : undefined}
                isReadOnly={isReadOnly}
                themeName={themeName}
                onThemeNameChange={handleThemeNameChange}
                onCancel={hasColorsChanges ? handleCancel : undefined}
                isLoading={isSavingColors}
                selectedThemeIndex={selectedThemeIndex}
                onThemeSelect={handleThemeSelect}
                customThemeNames={customThemeNames}
                onCustomThemeNamesChange={handleCustomThemeNamesChange}
                isOpen={openSection === 'colors'}
                onToggle={() => setOpenSection((prev) => (prev === 'colors' ? null : 'colors'))}
                icon={<IconPalette size={24} />}
            />

            {!isReadOnly && hasChanges && (
                <div className="mt-6 flex justify-end gap-4">
                    {!isSaving && (
                        <AdminButton onClick={handleCancel} variant="secondary">
                            Annuler
                        </AdminButton>
                    )}
                    <AdminButton
                        onClick={handleSaveAll}
                        isLoading={isSaving}
                        disabled={!isSiretValid || !isUsersValid || !isCustomersValid || isSaving}
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
