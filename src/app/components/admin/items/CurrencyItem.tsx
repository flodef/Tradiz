import { Currency } from '@/app/utils/interfaces';
import { CloseButton } from '@/app/components/CloseButton';
import AdminInput from '../AdminInput';

interface CurrencyItemProps {
    currency: Currency;
    onChange: (currency: Currency) => void;
    onDelete: () => void;
    isReadOnly?: boolean;
}

export default function CurrencyItem({ currency, onChange, onDelete, isReadOnly = false }: CurrencyItemProps) {
    if (isReadOnly) {
        const rateDisplay = currency.rate === 0 ? 'Auto' : currency.rate === 1 ? 'Aucun' : currency.rate;
        return (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm bg-white dark:bg-gray-800">
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Label</span>
                    <span className="font-medium truncate max-w-[150px]">{currency.label}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Symb.</span>
                    <span className="font-medium">{currency.symbol}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Max</span>
                    <span className="font-medium">{currency.maxValue}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Déc.</span>
                    <span className="font-medium">{currency.decimals}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Taux</span>
                    <span className="font-medium">{rateDisplay}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Frais</span>
                    <span className="font-medium">{currency.fee}%</span>
                </div>
            </div>
        );
    }

    const step = 1 / Math.pow(10, currency.decimals);

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 flex flex-wrap items-center gap-x-3 gap-y-2 bg-white dark:bg-gray-800 relative group">
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
