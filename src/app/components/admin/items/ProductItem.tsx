import { Currency } from '@/app/utils/interfaces';
import { IconCheck, IconX } from '@tabler/icons-react';
import SearchableSelect from '../SearchableSelect';
import { AdminProduct } from '../sections/ProductsConfig';
import Switch from '../Switch';
import ValidatedInput from '../ValidatedInput';

interface ProductItemProps {
    product: AdminProduct;
    onChange: (product: AdminProduct) => void;
    onDelete?: () => void;
    categories: { label: string; value: string }[];
    currencies: Currency[];
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
    if (isReadOnly) {
        return (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                            Nom
                        </label>
                        <div className="text-sm font-medium">{product.name}</div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                            Prix {currencies[0] ? `(${currencies[0].symbol})` : ''}
                        </label>
                        <div className="text-sm font-medium">
                            {product.currencies[0] && product.currencies[0] !== '0'
                                ? parseFloat(product.currencies[0]).toFixed(currencies[0]?.decimals ?? 2)
                                : ''}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                            Catégorie
                        </label>
                        <div className="text-sm font-medium">{product.category}</div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                            Disponibilité
                        </label>
                        <div className="flex items-center gap-2">
                            {product.availability ? (
                                <IconCheck className="text-green-500" size={24} stroke={3} />
                            ) : (
                                <IconX className="text-red-500" size={24} stroke={3} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
            <div className="flex justify-end items-center gap-2 mb-2">
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
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                        Nom
                    </label>
                    <ValidatedInput
                        value={product.name}
                        onChange={(value) => onChange({ ...product, name: String(value) })}
                        placeholder="Nom du produit"
                        maxLength={50}
                        disabled={isReadOnly}
                    />
                </div>
                <div>
                    <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                        Prix {currencies[0] ? `(${currencies[0].symbol})` : ''}
                    </label>
                    <ValidatedInput
                        type="number"
                        value={product.currencies[0] ?? ''}
                        onChange={(value) => {
                            const updated = [...product.currencies];
                            updated[0] = String(value);
                            onChange({ ...product, currencies: updated });
                        }}
                        placeholder={(0).toFixed(currencies[0]?.decimals ?? 2)}
                        disabled={isReadOnly}
                    />
                </div>
                <div>
                    <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                        Catégorie
                    </label>
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
                <div className="flex flex-col">
                    <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                        Disponibilité
                    </label>
                    <div className="flex items-center h-[42px]">
                        <Switch
                            checked={product.availability}
                            onChange={(checked) => onChange({ ...product, availability: checked })}
                            disabled={isReadOnly}
                        />
                        <span className="ml-2 text-sm">{product.availability ? 'Oui' : 'Non'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
