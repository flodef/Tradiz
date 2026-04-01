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
    readOnly?: boolean;
    dragHandleProps?: Record<string, unknown>;
}

export default function ProductItem({
    product,
    onChange,
    onDelete,
    categories,
    currencies,
    readOnly = false,
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label>
                    <ValidatedInput
                        value={product.name}
                        onChange={(value) => onChange({ ...product, name: String(value) })}
                        placeholder="Nom du produit"
                        disabled={readOnly}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
                    <SearchableSelect
                        options={categories}
                        value={product.category}
                        onChange={(value) =>
                            onChange({ ...product, category: Array.isArray(value) ? value[0] : value })
                        }
                        placeholder="Sélectionner une catégorie"
                        disabled={readOnly}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Disponibilité
                    </label>
                    <Switch
                        checked={product.availability}
                        onChange={(checked) => onChange({ ...product, availability: checked })}
                        disabled={readOnly}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Devises</label>
                    <SearchableSelect
                        options={currencies}
                        value={product.currencies}
                        onChange={(value) =>
                            onChange({ ...product, currencies: Array.isArray(value) ? value : [value] })
                        }
                        placeholder="Sélectionner les devises"
                        isMulti={true}
                        disabled={readOnly}
                    />
                </div>
            </div>
        </div>
    );
}
