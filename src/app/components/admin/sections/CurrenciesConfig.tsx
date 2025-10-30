import { Currency } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import CurrencyItem from '../items/CurrencyItem';

export default function CurrenciesConfig({
    config,
    onChange,
    onSave,
}: {
    config: Currency[];
    onChange: (data: Currency[]) => void;
    onSave: (data: Currency[]) => void;
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
            maxValue: 0,
            symbol: '',
            decimals: 2,
        };
        setCurrencies([...currencies, newCurrency]);
        onChange([...currencies, newCurrency]);
    };

    const handleDeleteCurrency = (index: number) => {
        const newCurrencies = currencies.filter((_, i) => i !== index);
        setCurrencies(newCurrencies);
        onChange(newCurrencies);
    };

    return (
        <SectionCard title="Devises" onSave={() => onSave(currencies)}>
            {currencies.map((currency, index) => (
                <CurrencyItem
                    key={index}
                    currency={currency}
                    onChange={(updatedCurrency) => handleCurrencyChange(index, updatedCurrency)}
                    onDelete={() => handleDeleteCurrency(index)}
                />
            ))}
            <button
                onClick={handleAddCurrency}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter une devise
            </button>
        </SectionCard>
    );
}
