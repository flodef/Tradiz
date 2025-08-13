import { Discount } from '@/app/hooks/useConfig';
import SectionCard from '../SectionCard';
import DiscountItem from '../items/DiscountItem';
import { useState, useEffect } from 'react';

export default function DiscountsConfig({
    config,
    onChange,
    onSave,
    currencies,
}: {
    config: Discount[];
    onChange: (data: Discount[]) => void;
    onSave: (data: Discount[]) => void;
    currencies: { label: string; value: string }[];
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
        const newDiscount: Discount = {
            amount: 0,
            unit: '%',
        };
        setDiscounts([...discounts, newDiscount]);
        onChange([...discounts, newDiscount]);
    };

    const handleDeleteDiscount = (index: number) => {
        const newDiscounts = discounts.filter((_, i) => i !== index);
        setDiscounts(newDiscounts);
        onChange(newDiscounts);
    };

    return (
        <SectionCard title="Réductions" onSave={() => onSave(discounts)}>
            {discounts.map((discount, index) => (
                <DiscountItem
                    key={index}
                    discount={discount}
                    onChange={(updatedDiscount) => handleDiscountChange(index, updatedDiscount)}
                    onDelete={() => handleDeleteDiscount(index)}
                    currencies={currencies}
                />
            ))}
            <button
                onClick={handleAddDiscount}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter une réduction
            </button>
        </SectionCard>
    );
}
