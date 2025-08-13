import ValidatedInput from '../ValidatedInput';
import { Currency } from '@/app/hooks/useConfig';

interface CurrencyItemProps {
    currency: Currency;
    onChange: (currency: Currency) => void;
    onDelete: () => void;
}

export default function CurrencyItem({ currency, onChange, onDelete }: CurrencyItemProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4">
            <div className="flex justify-end">
                <button
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600"
                >
                    Supprimer
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                    <ValidatedInput
                        value={currency.label}
                        onChange={(value) => onChange({ ...currency, label: String(value) })}
                        placeholder="Label de la devise"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Symbole</label>
                    <ValidatedInput
                        value={currency.symbol}
                        onChange={(value) => onChange({ ...currency, symbol: String(value) })}
                        placeholder="Symbole de la devise"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Valeur Maximale
                    </label>
                    <ValidatedInput
                        type="number"
                        value={currency.maxValue}
                        onChange={(value) => onChange({ ...currency, maxValue: Number(value) })}
                        placeholder="Valeur maximale"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Décimales</label>
                    <ValidatedInput
                        type="number"
                        value={currency.decimals}
                        onChange={(value) => onChange({ ...currency, decimals: Number(value) })}
                        placeholder="Nombre de décimales"
                    />
                </div>
            </div>
        </div>
    );
}
