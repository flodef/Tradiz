import { CloseButton } from '@/app/components/CloseButton';
import {
    adminContainerStyle,
    adminTextStyle,
    errorRoundButtonStyle,
    errorRoundContainerStyle,
} from '@/app/utils/constants';
import { Currency } from '@/app/utils/interfaces';
import AdminInput from '../AdminInput';

interface CurrencyItemProps {
    currency: Currency;
    onChange: (currency: Currency) => void;
    onDelete: () => void;
    isReadOnly?: boolean;
    canDelete?: boolean;
}

export default function CurrencyItem({
    currency,
    onChange,
    onDelete,
    isReadOnly = false,
    canDelete = true,
}: CurrencyItemProps) {
    if (isReadOnly) {
        const rateDisplay = currency.rate === 0 ? 'Auto' : currency.rate === 1 ? 'Aucun' : currency.rate;
        return (
            <div className={adminContainerStyle(true)}>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Label</span>
                    <span className="font-medium truncate max-w-[150px]">{currency.label}</span>
                </div>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Symb.</span>
                    <span className="font-medium">{currency.symbol}</span>
                </div>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Max</span>
                    <span className="font-medium">{currency.maxValue}</span>
                </div>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Déc.</span>
                    <span className="font-medium">{currency.decimals}</span>
                </div>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Taux</span>
                    <span className="font-medium">{rateDisplay}</span>
                </div>
                <div className="flex flex-col">
                    <span className={adminTextStyle}>Frais</span>
                    <span className="font-medium">{currency.fee}%</span>
                </div>
            </div>
        );
    }

    const step = 1 / Math.pow(10, currency.decimals);

    return (
        <div className={adminContainerStyle()}>
            <AdminInput
                label="Label"
                type="text"
                value={currency.label}
                maxLength={50}
                onChange={(e) => onChange({ ...currency, label: e.target.value })}
                className="min-w-[120px] flex-1"
                placeholder="ex: Euro"
                disabled={isReadOnly}
            />

            <AdminInput
                label="Symb."
                type="text"
                value={currency.symbol}
                maxLength={3}
                onChange={(e) => onChange({ ...currency, symbol: e.target.value })}
                className="w-12"
                placeholder="€"
                disabled={isReadOnly}
            />

            <AdminInput
                label="Max"
                type="number"
                value={currency.maxValue}
                min={0}
                max={1000000}
                step={step}
                onChange={(e) => onChange({ ...currency, maxValue: Number(e.target.value) })}
                className="w-24"
                disabled={isReadOnly}
            />

            <AdminInput
                label="Déc."
                type="number"
                value={currency.decimals}
                min={0}
                max={5}
                step={1}
                onChange={(e) => onChange({ ...currency, decimals: Number(e.target.value) })}
                className="w-14"
            />

            <div className="relative">
                <AdminInput
                    label="Taux"
                    type="number"
                    value={currency.rate}
                    step="any"
                    onChange={(e) => onChange({ ...currency, rate: Number(e.target.value) })}
                    className="w-20"
                    disabled={isReadOnly}
                />
                <div className="text-[9px] text-gray-400 absolute bottom-1 right-2 pointer-events-none">
                    {currency.rate === 0 ? 'Auto' : currency.rate === 1 ? 'Aucun' : ''}
                </div>
            </div>

            <AdminInput
                label="Frais %"
                type="number"
                value={currency.fee}
                min={0}
                max={100}
                step={0.01}
                onChange={(e) => onChange({ ...currency, fee: Number(e.target.value) })}
                className="w-16"
                disabled={isReadOnly}
            />

            {canDelete && (
                <div className={errorRoundContainerStyle}>
                    <CloseButton onClose={onDelete} size="xs" className={errorRoundButtonStyle} />
                </div>
            )}
        </div>
    );
}
