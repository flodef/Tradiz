import { CloseButton } from '@/app/components/CloseButton';
import {
    adminContainerStyle,
    adminTextStyle,
    errorRoundButtonStyle,
    errorRoundContainerStyle,
} from '@/app/utils/constants';
import { Currency, Discount } from '@/app/utils/interfaces';
import AdminInput from '../AdminInput';
import AdminSelect from '../AdminSelect';

interface DiscountItemProps {
    discount: Discount;
    onChange: (discount: Discount) => void;
    onDelete: () => void;
    currencies: Currency[];
    isReadOnly?: boolean;
}

function getDecimalStep(decimals: number): number {
    return decimals > 0 ? Math.pow(10, -decimals) : 1;
}

function getCurrencyMax(label: string, currencies: Currency[]): number {
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
    const units = ['%', ...currencies.map((c) => c.symbol)];
    const isPercent = discount.unit === '%';

    const currencyEntry = currencies.find((c) => c.label === discount.unit);
    const step = isPercent ? 0.5 : currencyEntry ? getDecimalStep(currencyEntry.decimals) : 1;
    const max = isPercent ? 100 : getCurrencyMax(discount.unit, currencies);

    if (isReadOnly) {
        return (
            <div className={adminContainerStyle(true)}>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Montant</span>
                    <span className="font-medium">{discount.amount}</span>
                </div>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Unité</span>
                    <span className="font-medium">{discount.unit}</span>
                </div>
            </div>
        );
    }

    return (
        <div className={adminContainerStyle()}>
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
                className="w-24"
                disabled={isReadOnly}
            />
            <AdminSelect
                value={discount.unit}
                onChange={(e) => onChange({ ...discount, unit: e.target.value })}
                options={units.map((u) => ({ label: u, value: u }))}
                className="w-16"
                disabled={isReadOnly}
            />
            <div className={errorRoundContainerStyle}>
                <CloseButton onClose={onDelete} size="xs" className={errorRoundButtonStyle} />
            </div>
        </div>
    );
}
