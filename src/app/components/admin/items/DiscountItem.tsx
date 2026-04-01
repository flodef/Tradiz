import { Discount } from '@/app/utils/interfaces';
import { CloseButton } from '@/app/components/CloseButton';

interface DiscountItemProps {
    discount: Discount;
    onChange: (discount: Discount) => void;
    onDelete: () => void;
    currencies: { label: string; value: string }[];
    readOnly?: boolean;
}

function getDecimalStep(value: string): number {
    const decimals = value.includes('.') ? value.split('.')[1].length : 0;
    return decimals > 0 ? Math.pow(10, -decimals) : 1;
}

function getCurrencyMax(label: string, currencies: { label: string; value: string }[]): number {
    const match = currencies.find((c) => c.label === label);
    if (!match) return 9999;
    const step = getDecimalStep(match.value);
    return step < 1 ? 9999 : 9999;
}

export default function DiscountItem({
    discount,
    onChange,
    onDelete,
    currencies,
    readOnly = false,
}: DiscountItemProps) {
    const units = ['%', ...currencies.map((c) => c.label)];
    const isPercent = discount.unit === '%';

    const currencyEntry = currencies.find((c) => c.label === discount.unit);
    const step = isPercent ? 0.5 : currencyEntry ? getDecimalStep(currencyEntry.value) : 1;
    const max = isPercent ? 100 : getCurrencyMax(discount.unit, currencies);

    if (readOnly) {
        return (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 flex items-center gap-2">
                <span className="text-sm font-medium">{discount.amount}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{discount.unit}</span>
            </div>
        );
    }

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 flex items-center gap-2">
            <input
                type="number"
                value={discount.amount}
                min={0}
                max={max}
                step={step}
                onChange={(e) => {
                    const val = Math.min(max, Math.max(0, Number(e.target.value)));
                    onChange({ ...discount, amount: val });
                }}
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none"
            />
            <select
                value={discount.unit}
                onChange={(e) => onChange({ ...discount, unit: e.target.value })}
                className="w-16 px-1 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none"
            >
                {units.map((unit) => (
                    <option key={unit} value={unit}>
                        {unit}
                    </option>
                ))}
            </select>
            <CloseButton
                onClose={onDelete}
                size="xs"
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1"
            />
        </div>
    );
}
