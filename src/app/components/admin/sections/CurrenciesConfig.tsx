'use client';

import { Currency } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import CurrencyItem from '../items/CurrencyItem';
import AdminButton from '../AdminButton';

export default function CurrenciesConfig({
    config,
    onChange,
    onSave,
    hasChanges = false,
    isReadOnly = false,
}: {
    config: Currency[];
    onChange: (data: Currency[]) => void;
    onSave: (data: Currency[]) => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
}) {
    const [currencies, setCurrencies] = useState(config || []);

    useEffect(() => {
        setCurrencies(config || []);
    }, [config]);

    const handleCurrencyChange = (index: number, updatedCurrency: Currency) => {
        const newCurrencies = [...currencies];
        newCurrencies[index] = updatedCurrency;
        setCurrencies(newCurrencies);
        onChange(newCurrencies);
    };

    const handleAddCurrency = () => {
        const newCurrency: Currency = {
            label: '',
            maxValue: 1000,
            symbol: '',
            decimals: 2,
            rate: 1,
            fee: 0,
        };
        const updated = [...currencies, newCurrency];
        setCurrencies(updated);
        onChange(updated);
    };

    const handleDeleteCurrency = (index: number) => {
        const updated = currencies.filter((_, i) => i !== index);
        setCurrencies(updated);
        onChange(updated);
    };

    return (
        <SectionCard title="Devises" onSave={isReadOnly || !hasChanges ? undefined : () => onSave(currencies)}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {currencies.map((currency, index) => (
                    <CurrencyItem
                        key={index}
                        currency={currency}
                        onChange={(updated) => handleCurrencyChange(index, updated)}
                        onDelete={() => handleDeleteCurrency(index)}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCurrency}>
                    Ajouter une devise
                </AdminButton>
            )}
        </SectionCard>
    );
}
