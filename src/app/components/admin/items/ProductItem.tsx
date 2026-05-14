import { adminTextStyle } from '@/app/utils/constants';
import { Currency } from '@/app/utils/interfaces';
import AdminSelect from '../AdminSelect';
import AvailabilityToggle from '../AvailabilityToggle';
import { AdminProduct } from '../sections/ProductsConfig';
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
                        <label className={adminTextStyle}>Nom</label>
                        <div className="text-sm font-medium">{product.name}</div>
                    </div>
                    <div>
                        <label className={adminTextStyle}>
                            Prix {currencies[0] ? `(${currencies[0].symbol})` : ''}
                        </label>
                        <div className="text-sm font-medium">
                            {product.currencies[0] && product.currencies[0] !== '0'
                                ? parseFloat(product.currencies[0]).toFixed(currencies[0]?.decimals ?? 2)
                                : ''}
                        </div>
                    </div>
                    <div>
                        <label className={adminTextStyle}>Catégorie</label>
                        <div className="text-sm font-medium">{product.category}</div>
                    </div>
                    <div>
                        <label className={adminTextStyle}>Disponibilité</label>
                        <AvailabilityToggle availability={product.stock !== 0} isReadOnly={true} />
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
                    <ValidatedInput
                        label="Nom"
                        value={product.name}
                        onChange={(value) => onChange({ ...product, name: String(value) })}
                        placeholder="Nom du produit"
                        maxLength={50}
                        disabled={isReadOnly}
                    />
                </div>
                <div>
                    <ValidatedInput
                        label={`Prix ${currencies[0] ? `(${currencies[0].symbol})` : ''}`}
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
                    <AdminSelect
                        label="Catégorie"
                        options={categories}
                        value={product.category}
                        onChange={(value) =>
                            onChange({ ...product, category: Array.isArray(value) ? value[0] : value })
                        }
                        disabled={isReadOnly}
                    />
                </div>
                <div className="flex flex-col">
                    <label className={adminTextStyle}>Disponibilité</label>
                    <AvailabilityToggle
                        availability={product.stock !== 0}
                        isReadOnly={isReadOnly}
                        onChange={(newValue) => onChange({ ...product, stock: newValue ? null : 0 })}
                    />
                </div>
            </div>
        </div>
    );
}
