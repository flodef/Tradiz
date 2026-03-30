import { AdminProduct } from '../sections/ProductsConfig';
import ValidatedInput from '../ValidatedInput';
import SearchableSelect from '../SearchableSelect';
import Switch from '../Switch';

interface ProductItemProps {
    product: AdminProduct;
    onChange: (product: AdminProduct) => void;
    onDelete?: () => void;
    categories: { label: string; value: string }[];
    currencies: { label: string; value: string }[];
}

export default function ProductItem({ product, onChange, onDelete, categories, currencies }: ProductItemProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4">
            {onDelete && (
                <div className="flex justify-end">
                    <button
                        onClick={onDelete}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600"
                    >
                        Supprimer
                    </button>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label>
                    <ValidatedInput
                        value={product.name}
                        onChange={(value) => onChange({ ...product, name: String(value) })}
                        placeholder="Nom du produit"
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
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Disponibilité
                    </label>
                    <Switch
                        checked={product.availability}
                        onChange={(checked) => onChange({ ...product, availability: checked })}
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
                    />
                </div>
            </div>
        </div>
    );
}
