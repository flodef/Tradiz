import ValidatedInput from '../ValidatedInput';
import { Category } from '@/app/hooks/useConfig';

interface CategoryItemProps {
    category: Category;
    onChange: (category: Category) => void;
    onDelete: () => void;
}

export default function CategoryItem({ category, onChange, onDelete }: CategoryItemProps) {
    const vatRates = [20, 10, 5.5, 2.1, 0];

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
                        value={category.label}
                        onChange={(value) => onChange({ ...category, label: String(value) })}
                        placeholder="Label de la catégorie"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TVA</label>
                    <select
                        value={category.vat}
                        onChange={(e) => onChange({ ...category, vat: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        {vatRates.map((rate) => (
                            <option key={rate} value={rate}>
                                {rate}%
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
