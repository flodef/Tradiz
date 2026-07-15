'use client';

import {
    Color,
    Currency,
    Customer,
    Discount,
    InventoryItem,
    Mercurial,
    PaymentMethod,
    Printer,
    Role,
    State,
    User,
} from '@/app/utils/interfaces';
import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigContext, OperationMode } from '../hooks/useConfig';
import {
    ADMIN_CONFIG_URL,
    ADMIN_EDIT_MENU_URL,
    CONFIG_KEYWORD,
    CURRENT_USER_KEYWORD,
    LOCAL_PRINTER_KEYWORD,
    PRINT_KEYWORD,
    SEPARATOR,
    USE_DIGICARTE,
} from '../utils/constants';
import { useLocalStorage } from '../utils/localStorage';
import {
    DatabaseNotConfiguredError,
    MissingDataError,
    UserNotFoundError,
    defaultCurrencies,
    defaultParameters,
    defaultPaymentMethods,
    getPublicKey,
    loadData,
    resolveUserFromKey,
} from '../utils/processData';

export interface Shop {
    name: string;
    address: string;
    zipCode: string;
    city: string;
    serial: string;
    email: string;
    id: string;
}

export interface ProductsSettings {
    useVatPerProduct: boolean;
    useReference: boolean;
    useStock: boolean;
    usePhoto: boolean;
    useDescription: boolean;
    useOptions: boolean;
}

export interface SearchSettings {
    searchCustomers: boolean;
    searchProducts: boolean;
    searchUsers: boolean;
}

export interface DisplaySettings {
    showWaiting: boolean;
    showRefund: boolean;
    showProvision: boolean;
    showDebit: boolean;
}

export interface Parameters {
    shop: Shop;
    thanksMessage: string;
    mercurial: Mercurial;
    lastModified: string;
    closingHour: number;
    yearStartDate?: { month: number; day: number }; // Optional, defaults to { month: 1, day: 1 } (January 1st)
    user: User;
    userSwitch?: boolean;
    products?: ProductsSettings;
    search?: SearchSettings;
    display?: DisplaySettings;
    error?: string;
}

export interface Config {
    parameters: Parameters;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: Discount[];
    colors: Color[];
    printers: Printer[];
    customers: Customer[];
    users: User[];
}

export interface ConfigProviderProps {
    children: ReactNode;
    shop: string;
}

/**
 * Validates config data to ensure required fields are present.
 * This prevents infinite spinner and error states when config is incomplete.
 *
 * @param data - The config data to validate
 * @throws Error if required fields are missing or empty
 */
export function validateConfigData(data: Config): void {
    const role = data.parameters?.user?.role;
    const hasEditAccess = role === Role.admin || role === Role.cashier;

    if (!data.currencies?.length) throw new Error('Empty config data: currencies');

    if (!data.paymentMethods?.length) throw new Error('Empty config data: paymentMethods');

    if (!data.inventory?.length && !hasEditAccess) throw new Error('Empty config data: inventory');

    if (!data.colors?.length) throw new Error('Empty config data: colors');

    if (!data.parameters?.shop) throw new Error('Empty config data: shop');
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children }) => {
    const [state, setState] = useState(State.init);
    const [modeFonctionnement, setModeFonctionnement] = useState<OperationMode>(USE_DIGICARTE ? 'restaurant' : 'lite');
    const [isFastFood, setIsFastFood] = useState(!USE_DIGICARTE);
    const [isKitchenViewEnabled, setIsKitchenViewEnabled] = useState(false);
    const [isGrafanaAccessEnabled, setIsGrafanaAccessEnabled] = useState(false);

    const [config, setConfig] = useLocalStorage<Config | undefined>(CONFIG_KEYWORD, undefined);
    const [parameters, setParameters] = useState<Parameters>(defaultParameters);
    const [currencyIndex, setCurrencyIndex] = useState(0);
    const [currencies, setCurrencies] = useState<Currency[]>(defaultCurrencies);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [colors, setColors] = useState<Color[]>([]);
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [users, setUsers] = useState<User[]>([]);

    const isStateReady = useMemo(() => state === State.preloaded || state === State.loaded, [state]);

    useEffect(() => {
        type EtabConfigResponse = {
            mode_fonctionnement?: OperationMode;
            kitchen_view_enabled?: boolean;
            grafana_access_enabled?: boolean;
        };

        fetch('/api/sql/getEtabConfig')
            .then((r) => r.json())
            .then((data: EtabConfigResponse) => {
                const mode =
                    data?.mode_fonctionnement === 'fastfood'
                        ? 'fastfood'
                        : data?.mode_fonctionnement === 'lite'
                          ? 'lite'
                          : 'restaurant';
                setModeFonctionnement(mode);
                setIsFastFood(mode === 'fastfood' || mode === 'lite');
                setIsKitchenViewEnabled(data?.kitchen_view_enabled ?? false);
                setIsGrafanaAccessEnabled(data?.grafana_access_enabled ?? false);
            })
            .catch(() => {
                setModeFonctionnement('restaurant');
                setIsFastFood(false);
                setIsKitchenViewEnabled(false);
                setIsGrafanaAccessEnabled(false);
            });
    }, []);

    const setCurrency = useCallback(
        (label: string) => {
            const index = currencies.findIndex(({ label: l }) => l === label);
            if (index !== -1) {
                setCurrencyIndex(index);
            }
        },
        [currencies]
    );

    const getPrintersNames = useCallback(() => {
        const printersNames = printers.filter(({ label: name }) => name !== LOCAL_PRINTER_KEYWORD);
        if (!printersNames.length) return [];

        return printersNames.length === 1
            ? [PRINT_KEYWORD]
            : printersNames.map(({ label: name }) => PRINT_KEYWORD + SEPARATOR + name);
    }, [printers]);
    const getPrinterAddresses = useCallback(
        (name?: string) => {
            const printerName = name?.split(SEPARATOR)[1];
            const printer = (
                printerName
                    ? [
                          printers.find(({ label: n }) => n === printerName),
                          printers.find(({ label: n }) => n === LOCAL_PRINTER_KEYWORD),
                      ]
                    : printers
            ).filter(Boolean) as Printer[]; // If no printer name is provided, return all printers
            if (!printer.length) return [];

            return printer.map(({ ipAddress: address }) => address);
        },
        [printers]
    );

    const loadConfig = useCallback((data: Config | undefined) => {
        if (!data) return;

        setParameters(data.parameters);
        setCurrencies(data.currencies);
        setPaymentMethods(data.paymentMethods);
        setInventory(data.inventory);
        setDiscounts(data.discounts);
        setColors(data.colors);
        setPrinters(data.printers);
        setCustomers(data.customers);
        setUsers(data.users);

        setState(State.preloaded);
    }, []);

    const storeData = useCallback(
        (data: Config) => {
            validateConfigData(data);

            setConfig(data);
            loadConfig(data);

            setState(State.loaded);
        },
        [setConfig, loadConfig]
    );

    useEffect(() => {
        if (!colors?.length) return;

        document.documentElement.style.setProperty('--writing-light-color', colors[0].light);
        document.documentElement.style.setProperty('--main-from-light-color', colors[1].light);
        document.documentElement.style.setProperty('--main-to-light-color', colors[2].light);
        document.documentElement.style.setProperty('--popup-light-color', colors[3].light);
        document.documentElement.style.setProperty('--active-light-color', colors[4].light);
        document.documentElement.style.setProperty('--secondary-light-color', colors[5].light);
        document.documentElement.style.setProperty('--secondary-active-light-color', colors[6].light);

        document.documentElement.style.setProperty('--writing-dark-color', colors[0].dark);
        document.documentElement.style.setProperty('--main-from-dark-color', colors[1].dark);
        document.documentElement.style.setProperty('--main-to-dark-color', colors[2].dark);
        document.documentElement.style.setProperty('--popup-dark-color', colors[3].dark);
        document.documentElement.style.setProperty('--active-dark-color', colors[4].dark);
        document.documentElement.style.setProperty('--secondary-dark-color', colors[5].dark);
        document.documentElement.style.setProperty('--secondary-active-dark-color', colors[6].dark);

        document.documentElement.setAttribute('data-theme-ready', '1');
    }, [colors]);

    // Persist the current user to localStorage so the next session can restore it.
    useEffect(() => {
        if (parameters.user && parameters.user.name) {
            localStorage.setItem(CURRENT_USER_KEYWORD, JSON.stringify(parameters.user));
        } else {
            localStorage.removeItem(CURRENT_USER_KEYWORD);
        }
    }, [parameters.user]);

    // When loaded with an empty inventory, send admins/cashiers straight to the menu editor
    // so they can recreate the catalog instead of staring at a blank or error screen.
    useEffect(() => {
        if (state !== State.loaded) return;
        const role = parameters.user?.role;
        const hasEditAccess = role === Role.admin || role === Role.cashier;
        if (hasEditAccess && inventory.length === 0 && !window.location.pathname.startsWith('/admin')) {
            window.location.href = `${ADMIN_EDIT_MENU_URL}?emptyProducts=true`;
        }
    }, [state, inventory, parameters.user?.role]);

    // Listen for storage events to detect when data is updated in another tab
    // (e.g., when admin saves data, main app should reload to get fresh data)
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === CONFIG_KEYWORD && e.newValue) {
                try {
                    const newConfig = JSON.parse(e.newValue) as Config;
                    loadConfig(newConfig);
                    storeData(newConfig);
                } catch {
                    // Invalid data, ignore
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [loadConfig, storeData]);

    useEffect(() => {
        if (state !== State.init) return;

        // Skip loading data if on admin config page - it has its own loading logic.
        // Still resolve the user so the TopNav and admin pages know the role.
        if (window.location.pathname.includes(ADMIN_CONFIG_URL)) {
            resolveUserFromKey(getPublicKey()).then(({ user }) => {
                if (user) setParameters((prev) => ({ ...prev, user }));
                setState(State.loaded);
            });
            return;
        }

        // Load cached data first if available - set state directly to preloaded to avoid loading dots
        if (config) {
            try {
                loadConfig(config);
                setState(State.preloaded);
            } catch {
                // Invalid cached data, proceed to load from DB with loading state
                setState(State.loading);
            }
        } else {
            // No cached data, show loading
            setState(State.loading);
        }

        // Always load fresh data from DB in background
        loadData()
            .then((data) => {
                if (!data) {
                    // If we have cached data, stay in preloaded state
                    if (config) return;
                    setState(State.error);
                    return;
                }
                storeData(data);
            })
            .catch((error) => {
                console.error(error);

                // If we have cached data, stay in preloaded state and just log error
                if (config) {
                    parameters.error = error.message;
                    return;
                }

                parameters.error = error.message;
                if (error instanceof UserNotFoundError) {
                    parameters.shop.email = String(error.cause);
                    setState(State.unidentified);
                } else if (error instanceof MissingDataError) {
                    // Check if error has isAdmin flag (admin user with missing parameters)
                    if (error.isAdmin) {
                        // Only redirect if not already on admin config page to prevent infinite loop
                        if (!window.location.pathname.includes(ADMIN_CONFIG_URL)) {
                            window.location.href = ADMIN_CONFIG_URL;
                        }
                    } else {
                        setState(State.missingData);
                    }
                } else if (error instanceof DatabaseNotConfiguredError) {
                    // Database not configured - fatal error
                    setState(State.fatal);
                } else {
                    setState(State.error);
                }
            });
    }, [state, config, setConfig, storeData, loadConfig, parameters]);

    return (
        <ConfigContext.Provider
            value={{
                state,
                setState,
                setConfig,
                isStateReady,
                modeFonctionnement,
                isFastFood,
                isKitchenViewEnabled,
                isGrafanaAccessEnabled,
                parameters,
                setParameters,
                currencyIndex,
                setCurrency,
                currencies,
                paymentMethods,
                inventory,
                discounts,
                colors,
                printers,
                getPrintersNames,
                getPrinterAddresses,
                customers,
                users,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
