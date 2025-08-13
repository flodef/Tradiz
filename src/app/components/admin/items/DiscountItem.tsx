import ValidatedInput from '../ValidatedInput';

interface DiscountItemProps {
    discount: any;
    onChange: (discount: any) => void;
    onDelete: () => void;
    currencies: { label: string; value: any }[];
}

export default function DiscountItem({
    discount,
    onChange,
    onDelete,
    currencies,
}: DiscountItemProps) {
    const units = ['%', ...currencies.map(c => c.label)];

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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant</label>
                    <ValidatedInput
                        type="number"
                        value={discount.Amount}
                        onChange={(value) => onChange({ ...discount, Amount: value })}
                        placeholder="Montant de la réduction"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unité</label>
                    <select
                        value={discount.Unity}
                        onChange={(e) => onChange({ ...discount, Unity: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        {units.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
