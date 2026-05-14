'use client';

import { Config, updateConfigTheme } from '@/app/actions/config';
import { Parameters } from '@/app/contexts/ConfigProvider';
import { Category, Color, Currency, Discount, PaymentMethod, Printer, User } from '@/app/utils/interfaces';
import { useCallback, useMemo, useState } from 'react';
import CategoriesConfig from './sections/CategoriesConfig';
import ColorsConfig from './sections/ColorsConfig';
import CurrenciesConfig from './sections/CurrenciesConfig';
import DiscountsConfig from './sections/DiscountsConfig';
import PaymentsConfig from './sections/PaymentsConfig';
import PrintersConfig from './sections/PrintersConfig';
import ProductsConfig, { AdminProduct } from './sections/ProductsConfig';
import SettingsConfig from './sections/SettingsConfig';
import UsersConfig from './sections/UsersConfig';

interface AdminPanelProps {
    initialConfig: Config;
    shopName: string;
}

export default function AdminPanel({ initialConfig, shopName }: AdminPanelProps) {
    const [config, setConfig] = useState(() => {
        const newConfig = { ...initialConfig };
        // Ensure array types are initialized as arrays if they are null/undefined
        if (!newConfig.Products) newConfig.Products = [];
        if (!newConfig.Discounts) newConfig.Discounts = [];
        if (!newConfig.Currencies) newConfig.Currencies = [];
        if (!newConfig.Payments) newConfig.Payments = [];
        if (!newConfig.Colors) newConfig.Colors = [];
        if (!newConfig.Users) newConfig.Users = [];
        if (!newConfig.Printers) newConfig.Printers = [];
        // Settings is an object, not an array
        if (!newConfig.Settings) newConfig.Settings = {};
        return newConfig;
    });

    const [originalConfig, setOriginalConfig] = useState(() => {
        const newConfig = { ...initialConfig };
        if (!newConfig.Products) newConfig.Products = [];
        if (!newConfig.Discounts) newConfig.Discounts = [];
        if (!newConfig.Currencies) newConfig.Currencies = [];
        if (!newConfig.Payments) newConfig.Payments = [];
        if (!newConfig.Colors) newConfig.Colors = [];
        if (!newConfig.Users) newConfig.Users = [];
        if (!newConfig.Printers) newConfig.Printers = [];
        if (!newConfig.Settings) newConfig.Settings = {};
        return newConfig;
    });

    const hasProductsChanges = JSON.stringify(config.Products) !== JSON.stringify(originalConfig.Products);

    const handleCancel = (theme: string) => {
        setConfig((prevConfig) => ({
            ...prevConfig,
            [theme]: originalConfig[theme as keyof Config],
        }));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSave = async (theme: string, data: Record<string, any>) => {
        try {
            await updateConfigTheme(shopName, theme, data);
            setOriginalConfig((prevConfig) => ({
                ...prevConfig,
                [theme]: data,
            }));
            alert(`${theme} enregistré !`);
        } catch (error) {
            console.error(`Erreur lors de l'enregistrement de ${theme}:`, error);
            alert(`Erreur lors de l'enregistrement de ${theme}.`);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleChange = (theme: string, data: Record<string, any>) => {
        setConfig((prevConfig) => ({
            ...prevConfig,
            [theme]: data,
        }));
    };

    // Derive categories from products
    const derivedCategories = useMemo(() => {
        const products = config.Products ? Object.values(config.Products as AdminProduct[]) : [];
        const catVats = new Map<string, Set<number>>();
        for (const p of products) {
            const cat = p.category || '';
            if (!cat) continue;
            if (!catVats.has(cat)) catVats.set(cat, new Set());
            catVats.get(cat)!.add(p.vat ?? 20);
        }
        const result: Category[] = [];
        for (const [label, vats] of catVats) {
            result.push({ label, vat: vats.size === 1 ? [...vats][0] : null });
        }
        return result;
    }, [config.Products]);

    const categories = useMemo(
        () => derivedCategories.map((cat) => ({ label: cat.label, value: cat.label })),
        [derivedCategories]
    );

    const handleCategoryRename = useCallback((oldLabel: string, newLabel: string) => {
        setConfig((prev) => ({
            ...prev,
            Products: (prev.Products as AdminProduct[]).map((p) =>
                p.category === oldLabel ? { ...p, category: newLabel } : p
            ),
        }));
    }, []);

    const handleDeleteCategoryProducts = useCallback((categoryLabel: string, moveToEmpty: boolean) => {
        setConfig((prev) => ({
            ...prev,
            Products: moveToEmpty
                ? (prev.Products as AdminProduct[]).map((p) =>
                      p.category === categoryLabel ? { ...p, category: '' } : p
                  )
                : (prev.Products as AdminProduct[]).filter((p) => p.category !== categoryLabel),
        }));
    }, []);

    const handleCategoryVatChange = useCallback((categoryLabel: string, vat: number) => {
        setConfig((prev) => ({
            ...prev,
            Products: (prev.Products as AdminProduct[]).map((p) => (p.category === categoryLabel ? { ...p, vat } : p)),
        }));
    }, []);

    const currencies = config.Currencies ? Object.values(config.Currencies as Currency[]) : [];
    const currencySymbols = config.Currencies ? Object.values(config.Currencies as Currency[]) : [];

    return (
        <div className="container mx-auto p-4 bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
            <h1 className="text-3xl font-bold mb-6 text-center">Panneau d'administration pour {shopName}</h1>
            <div className="space-y-6">
                <ProductsConfig
                    config={config.Products as AdminProduct[]}
                    onChange={(data: AdminProduct[]) => handleChange('Products', data)}
                    onSave={(data: AdminProduct[]) => handleSave('Products', data)}
                    onCancel={() => handleCancel('Products')}
                    hasChanges={hasProductsChanges}
                    categories={categories}
                    currencies={currencies}
                />
                <CategoriesConfig
                    config={derivedCategories}
                    productCategories={(config.Products as AdminProduct[])
                        .filter((p) => p.category)
                        .map((p) => ({ category: p.category, available: p.stock !== 0 }))}
                    onDeleteCategoryProducts={handleDeleteCategoryProducts}
                    onRenameCategory={handleCategoryRename}
                    onCategoryVatChange={handleCategoryVatChange}
                />
                <DiscountsConfig
                    config={config.Discounts as Discount[]}
                    onChange={(data: Discount[]) => handleChange('Discounts', data)}
                    onSave={(data: Discount[]) => handleSave('Discounts', data)}
                    currencies={currencySymbols}
                />
                <CurrenciesConfig
                    config={config.Currencies as Currency[]}
                    onChange={(data: Currency[]) => handleChange('Currencies', data)}
                    onSave={(data: Currency[]) => handleSave('Currencies', data)}
                />
                <PaymentsConfig
                    config={config.Payments as PaymentMethod[]}
                    onChange={(data: PaymentMethod[]) => handleChange('Payments', data)}
                    onSave={(data: PaymentMethod[]) => handleSave('Payments', data)}
                    currencies={currencies}
                />
                <SettingsConfig
                    config={config.Settings as Parameters}
                    onChange={(data: Parameters) => handleChange('Settings', data)}
                    onSave={(data: Parameters) => handleSave('Settings', data)}
                />
                <ColorsConfig
                    config={config.Colors as Color[]}
                    onChange={(data: Color[]) => handleChange('Colors', data)}
                    onSave={(data: Color[]) => handleSave('Colors', data)}
                />
                <UsersConfig
                    config={config.Users as User[]}
                    onChange={(data: User[]) => handleChange('Users', data)}
                    onSave={(data: User[]) => handleSave('Users', data)}
                />
                <PrintersConfig
                    config={config.Printers as Printer[]}
                    onChange={(data: Printer[]) => handleChange('Printers', data)}
                    onSave={(data: Printer[]) => handleSave('Printers', data)}
                />
            </div>
        </div>
    );
}
