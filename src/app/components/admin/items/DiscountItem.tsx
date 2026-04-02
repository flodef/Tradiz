import { Discount } from '@/app/utils/interfaces';
import { CloseButton } from '@/app/components/CloseButton';
import AdminInput from '../AdminInput';
import AdminSelect from '../AdminSelect';

interface DiscountItemProps {
    discount: Discount;
    onChange: (discount: Discount) => void;
    onDelete: () => void;
    currencies: { label: string; value: string }[];
    isReadOnly?: boolean;
}

function getDecimalStep(value: string): number {
    const decimals = value.includes('.') ? value.split('.')[1].length : 0;
    return decimals > 0 ? Math.pow(10, -decimals) : 1;
}

function getCurrencyMax(label: string, currencies: { label: string; value: string }[]): number {
    const match = currencies.find((c) => c.label === label);
    if (!match) return 9999;
    return 9999;
}

export default function DiscountItem({
    discount,
    onChange,
    onDelete,
    currencies,
    isReadOnly = false,
}: DiscountItemProps) {
    const units = ['%', ...currencies.map((c) => c.label)];
    const isPercent = discount.unit === '%';

    const currencyEntry = currencies.find((c) => c.label === discount.unit);
    const step = isPercent ? 0.5 : currencyEntry ? getDecimalStep(currencyEntry.value) : 1;
    const max = isPercent ? 100 : getCurrencyMax(discount.unit, currencies);

    if (isReadOnly) {
        return (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 flex items-center gap-2 bg-white dark:bg-gray-800">
                <span className="text-sm font-medium">{discount.amount}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{discount.unit}</span>
            </div>
        );
    }

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 flex items-center gap-2 bg-white dark:bg-gray-800 relative group">
            <AdminInput
                type="number"
                value={discount.amount}
                min={0}
                max={max}
                step={step}
                onChange={(e) => {
                    const val = Math.min(max, Math.max(0, Number(e.target.value)));
                    onChange({ ...discount, amount: val });
                }}
                className="w-20"
                disabled={isReadOnly}
            />
            <AdminSelect
                value={discount.unit}
                onChange={(e) => onChange({ ...discount, unit: e.target.value })}
                options={units.map((u) => ({ label: u, value: u }))}
                className="w-16"
                disabled={isReadOnly}
            />
            <div className="absolute -top-2 -right-2 hidden group-hover:block">
                <CloseButton
                    onClose={onDelete}
                    size="xs"
                    className="bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 rounded-full p-1 shadow-sm"
                />
            </div>
        </div>
    );
}
