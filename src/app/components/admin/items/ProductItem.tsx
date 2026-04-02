import SearchableSelect from '../SearchableSelect';
import { AdminProduct } from '../sections/ProductsConfig';
import Switch from '../Switch';
import ValidatedInput from '../ValidatedInput';

interface ProductItemProps {
    product: AdminProduct;
    onChange: (product: AdminProduct) => void;
    onDelete?: () => void;
    categories: { label: string; value: string }[];
    currencies: { label: string; value: string }[];
    isReadOnly?: boolean;
    dragHandleProps?: Record<string, unknown>;
}

export default function ProductItem({
    product,
    onChange,
    onDelete,
    categories,
    currencies,
    isReadOnly = false,
    dragHandleProps,
}: ProductItemProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4">
            <div className="flex justify-end items-center gap-2 mb-1">
                {dragHandleProps && (
                    <span
                        {...dragHandleProps}
                        className="cursor-grab text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none"
                        title="Déplacer"
                    >
                        ⠿
                    </span>
                )}
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 text-sm"
                    >
                        Supprimer
                    </button>
                )}
            </div>
            <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-32">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label>
                    <ValidatedInput
                        value={product.name}
                        onChange={(value) => onChange({ ...product, name: String(value) })}
                        placeholder="Nom du produit"
                        disabled={isReadOnly}
                    />
                </div>
                <div className="w-auto">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
                    <SearchableSelect
                        options={categories}
                        value={product.category}
                        onChange={(value) =>
                            onChange({ ...product, category: Array.isArray(value) ? value[0] : value })
                        }
                        placeholder="Catégorie"
                        disabled={isReadOnly}
                    />
                </div>
                <div className="w-24">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Prix {currencies[0] ? `(${currencies[0].label})` : ''}
                    </label>
                    <ValidatedInput
                        type="number"
                        value={product.currencies[0] ?? ''}
                        onChange={(value) => {
                            const updated = [...product.currencies];
                            updated[0] = String(value);
                            onChange({ ...product, currencies: updated });
                        }}
                        placeholder="0.00"
                        disabled={isReadOnly}
                    />
                </div>
                <div className="w-20 flex flex-col items-center justify-center gap-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {product.availability ? 'Disponible' : 'Indisponible'}
                    </label>
                    <div className="h-[42px] content-end">
                        <Switch
                            checked={product.availability}
                            onChange={(checked) => onChange({ ...product, availability: checked })}
                            disabled={isReadOnly}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
