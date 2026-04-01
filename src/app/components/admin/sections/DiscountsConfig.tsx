import { Discount } from '@/app/utils/interfaces';
import SectionCard from '../SectionCard';
import DiscountItem from '../items/DiscountItem';
import { useState, useEffect } from 'react';

export default function DiscountsConfig({
    config,
    onChange,
    onSave,
    currencies,
    isReadOnly = false,
}: {
    config: Discount[];
    onChange: (data: Discount[]) => void;
    onSave: (data: Discount[]) => void;
    currencies: { label: string; value: string }[];
    isReadOnly?: boolean;
}) {
    const [discounts, setDiscounts] = useState(config || []);

    useEffect(() => {
        setDiscounts(config || []);
    }, [config]);

    const handleDiscountChange = (index: number, updatedDiscount: Discount) => {
        const newDiscounts = [...discounts];
        newDiscounts[index] = updatedDiscount;
        setDiscounts(newDiscounts);
        onChange(newDiscounts);
    };

    const handleAddDiscount = () => {
        const newDiscount: Discount = { amount: 0, unit: '%' };
        const updated = [...discounts, newDiscount];
        setDiscounts(updated);
        onChange(updated);
    };

    const handleDeleteDiscount = (index: number) => {
        const updated = discounts.filter((_, i) => i !== index);
        setDiscounts(updated);
        onChange(updated);
    };

    return (
        <SectionCard title="Réductions" onSave={isReadOnly ? undefined : () => onSave(discounts)}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {discounts.map((discount, index) => (
                    <DiscountItem
                        key={index}
                        discount={discount}
                        onChange={(updated) => handleDiscountChange(index, updated)}
                        onDelete={() => handleDeleteDiscount(index)}
                        currencies={currencies}
                        readOnly={isReadOnly}
                    />
                ))}
            </div>
            {!isReadOnly && (
                <button
                    onClick={handleAddDiscount}
                    className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-sm"
                >
                    Ajouter une réduction
                </button>
            )}
        </SectionCard>
    );
}
