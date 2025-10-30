'use client';

import { Config, updateConfigTheme } from '@/app/actions/config';
import { Parameters } from '@/app/contexts/ConfigProvider';
import { Category, Color, Currency, Discount, PaymentMethod, Printer, User } from '@/app/utils/interfaces';
import { useState } from 'react';
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
        if (!newConfig.Categories) newConfig.Categories = [];
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

    const handleSave = async (theme: string, data: any) => {
        try {
            await updateConfigTheme(shopName, theme, data);
            alert(`${theme} enregistré avec succès!`);
        } catch (error) {
            console.error(`Erreur lors de l'enregistrement de ${theme}:`, error);
            alert(`Erreur lors de l'enregistrement de ${theme}.`);
        }
    };

    const handleChange = (theme: string, data: any) => {
        setConfig((prevConfig) => ({
            ...prevConfig,
            [theme]: data,
        }));
    };

    const categories = config.Categories
        ? Object.values(config.Categories).map((cat: any) => ({ label: cat.Label, value: cat.Label }))
        : [];
    const currencies = config.Currencies
        ? Object.values(config.Currencies).map((cur: any) => ({ label: cur.Label, value: cur.Label }))
        : [];
    const currencySymbols = config.Currencies
        ? Object.values(config.Currencies).map((cur: any) => ({ label: cur.Symbol, value: cur.Symbol }))
        : [];

    return (
        <div className="container mx-auto p-4 bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
            <h1 className="text-3xl font-bold mb-6 text-center">Panneau d'administration pour {shopName}</h1>
            <div className="space-y-6">
                <ProductsConfig
                    config={config.Products as AdminProduct[]}
                    onChange={(data: AdminProduct[]) => handleChange('Products', data)}
                    onSave={(data: AdminProduct[]) => handleSave('Products', data)}
                    categories={categories}
                    currencies={currencies}
                />
                <CategoriesConfig
                    config={config.Categories as Category[]}
                    onChange={(data: Category[]) => handleChange('Categories', data)}
                    onSave={(data: Category[]) => handleSave('Categories', data)}
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
