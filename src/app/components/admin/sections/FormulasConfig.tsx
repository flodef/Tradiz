'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Currency } from '@/app/utils/interfaces';
import { AdminProduct } from './ProductsConfig';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';
import { getMainCurrencyStep } from '@/app/utils/priceStep';

export interface FormulaElement {
    name: string;
    category?: string;
    products?: string[];
}

export interface AdminFormula {
    name: string;
    price: string;
    elements: FormulaElement[];
}

interface FormulasConfigProps {
    config: AdminFormula[];
    categories: string[];
    products: AdminProduct[];
    currencies: Currency[];
    onChange: (data: AdminFormula[]) => void;
    onSave?: (data: AdminFormula[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

function getDecimals(currencies: Currency[]) {
    return currencies.find((c) => c.rate === 1)?.decimals ?? 2;
}

export function computeMaxFormulaPrice(formula: AdminFormula, products: AdminProduct[]): number {
    return formula.elements.reduce((total, element) => {
        let choices: AdminProduct[] = [];
        if (element.category) {
            choices = products.filter((p) => p.category === element.category);
        } else if (element.products?.length) {
            choices = products.filter((p) => element.products?.includes(p.name));
        }
        const max = Math.max(0, ...choices.map((p) => parseFloat(p.currencies[0] || '0') || 0));
        return total + max;
    }, 0);
}

export default function FormulasConfig({
    config,
    categories,
    products,
    currencies,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
}: FormulasConfigProps) {
    const [formulas, setFormulas] = useState<AdminFormula[]>(config || []);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const selfUpdateRef = useRef(false);

    const mainCurrency = useMemo(() => currencies.find((c) => c.rate === 1) ?? currencies[0], [currencies]);
    const decimals = useMemo(() => getDecimals(currencies), [currencies]);
    const priceStep = useMemo(() => getMainCurrencyStep(currencies), [currencies]);

    const categoryOptions = useMemo(() => categories.map((c) => ({ label: c, value: c })), [categories]);
    const productOptions = useMemo(() => products.map((p) => ({ label: p.name, value: p.name })), [products]);

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setFormulas(config || []);
    }, [config]);

    const notifyParent = useCallback(
        (data: AdminFormula[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(data);
            }, 300);
        },
        [onChange]
    );

    const isValid = useMemo(() => {
        return formulas.every((f) => {
            if (!f.name.trim()) return false;
            if (isNaN(parseFloat(f.price))) return false;
            if (f.elements.length === 0) return false;
            return f.elements.every((el) => {
                if (!el.name.trim()) return false;
                if (el.category) return true;
                return !!el.products && el.products.length > 0 && el.products.every((p) => p.trim());
            });
        });
    }, [formulas]);

    const updateFormula = (index: number, patch: Partial<AdminFormula>) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => (i === index ? { ...f, ...patch } : f));
            notifyParent(updated);
            return updated;
        });
    };

    const updateElement = (formulaIndex: number, elementIndex: number, patch: Partial<FormulaElement>) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                return {
                    ...f,
                    elements: f.elements.map((el, j) => (j === elementIndex ? { ...el, ...patch } : el)),
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleAddFormula = () => {
        setFormulas((prev) => {
            const updated = [
                ...prev,
                {
                    name: '',
                    price: (0).toFixed(decimals),
                    elements: [],
                },
            ];
            notifyParent(updated);
            return updated;
        });
    };

    const handleDeleteFormula = (index: number) => {
        setFormulas((prev) => {
            const updated = prev.filter((_, i) => i !== index);
            notifyParent(updated);
            return updated;
        });
    };

    const handleAddElement = (formulaIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                const firstCategory = categories[0] || '';
                return {
                    ...f,
                    elements: [
                        ...f.elements,
                        firstCategory ? { name: '', category: firstCategory } : { name: '', products: [''] },
                    ],
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleDeleteElement = (formulaIndex: number, elementIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                return { ...f, elements: f.elements.filter((_, j) => j !== elementIndex) };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleAddProduct = (formulaIndex: number, elementIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                return {
                    ...f,
                    elements: f.elements.map((el, j) => {
                        if (j !== elementIndex) return el;
                        return { ...el, products: [...(el.products || []), ''] };
                    }),
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleUpdateProduct = (formulaIndex: number, elementIndex: number, productIndex: number, value: string) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                return {
                    ...f,
                    elements: f.elements.map((el, j) => {
                        if (j !== elementIndex) return el;
                        const products = [...(el.products || [])];
                        products[productIndex] = value;
                        return { ...el, products };
                    }),
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleDeleteProduct = (formulaIndex: number, elementIndex: number, productIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                return {
                    ...f,
                    elements: f.elements.map((el, j) => {
                        if (j !== elementIndex) return el;
                        return { ...el, products: (el.products || []).filter((_, k) => k !== productIndex) };
                    }),
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleApplyMaxPrice = (formulaIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                const max = computeMaxFormulaPrice(f, products);
                return { ...f, price: max.toFixed(decimals) };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleTargetModeChange = (formulaIndex: number, elementIndex: number, mode: 'category' | 'products') => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                return {
                    ...f,
                    elements: f.elements.map((el, j) => {
                        if (j !== elementIndex) return el;
                        if (mode === 'category') {
                            return { name: el.name, category: categories[0] || '' };
                        }
                        return { name: el.name, products: [''] };
                    }),
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    return (
        <SectionCard
            title="Formules"
            onSave={onSave ? () => onSave(formulas) : undefined}
            saveDisabled={!isValid}
            icon={icon}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            hasChanges={hasChanges}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            onAdd={handleAddFormula}
            isValid={isValid}
            addLabel="Ajouter une formule"
            isReadOnly={isReadOnly}
        >
            <div className="space-y-4">
                {formulas.map((formula, formulaIndex) => (
                    <div
                        key={formulaIndex}
                        className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-white/20 dark:bg-black/10 space-y-3"
                    >
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-48">
                                <ValidatedInput
                                    type="text"
                                    value={formula.name}
                                    onChange={(value) => updateFormula(formulaIndex, { name: String(value) })}
                                    placeholder="Nom de la formule"
                                    isReadOnly={isReadOnly}
                                    isNameField
                                    maxLength={50}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <ValidatedInput
                                    type="number"
                                    value={formula.price}
                                    onChange={(value) => updateFormula(formulaIndex, { price: String(value) })}
                                    placeholder="Prix"
                                    min={0}
                                    step={priceStep}
                                    isReadOnly={isReadOnly}
                                    className="w-28"
                                />
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {mainCurrency ? mainCurrency.symbol : ''}
                                </span>
                                {!isReadOnly && (
                                    <AdminButton
                                        variant="secondary"
                                        className="py-1 px-2 text-xs"
                                        onClick={() => handleApplyMaxPrice(formulaIndex)}
                                    >
                                        Prix max
                                    </AdminButton>
                                )}
                                {!isReadOnly && (
                                    <AdminButton
                                        variant="danger"
                                        className="py-1 px-2 text-xs"
                                        onClick={() => handleDeleteFormula(formulaIndex)}
                                    >
                                        Supprimer
                                    </AdminButton>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                            {formula.elements.map((element, elementIndex) => {
                                const mode = element.category !== undefined ? 'category' : 'products';
                                return (
                                    <div
                                        key={elementIndex}
                                        className="bg-white/30 dark:bg-black/20 rounded p-3 space-y-2"
                                    >
                                        <div className="flex flex-wrap items-end gap-2">
                                            <div className="flex-1 min-w-40">
                                                <ValidatedInput
                                                    type="text"
                                                    value={element.name}
                                                    onChange={(value) =>
                                                        updateElement(formulaIndex, elementIndex, {
                                                            name: String(value),
                                                        })
                                                    }
                                                    placeholder="Étape (ex: Entrée, Plat, Dessert)"
                                                    isReadOnly={isReadOnly}
                                                    isNameField
                                                    maxLength={50}
                                                />
                                            </div>
                                            {!isReadOnly && (
                                                <AdminButton
                                                    variant="danger"
                                                    className="py-1 px-2 text-xs"
                                                    onClick={() => handleDeleteElement(formulaIndex, elementIndex)}
                                                >
                                                    Supprimer
                                                </AdminButton>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <AdminSelect
                                                options={[
                                                    { label: 'Toute une catégorie', value: 'category' },
                                                    { label: 'Produits spécifiques', value: 'products' },
                                                ]}
                                                value={mode}
                                                onChange={(e) =>
                                                    handleTargetModeChange(
                                                        formulaIndex,
                                                        elementIndex,
                                                        e.target.value as 'category' | 'products'
                                                    )
                                                }
                                                isReadOnly={isReadOnly}
                                                className="w-48"
                                            />

                                            {mode === 'category' ? (
                                                <AdminSelect
                                                    options={categoryOptions}
                                                    value={element.category || ''}
                                                    onChange={(e) =>
                                                        updateElement(formulaIndex, elementIndex, {
                                                            category: e.target.value,
                                                        })
                                                    }
                                                    isReadOnly={isReadOnly}
                                                    className="flex-1 min-w-48"
                                                />
                                            ) : (
                                                <div className="flex-1 min-w-48 space-y-2">
                                                    {(element.products || []).map((product, productIndex) => (
                                                        <div key={productIndex} className="flex items-center gap-2">
                                                            <AdminSelect
                                                                options={productOptions}
                                                                value={product}
                                                                onChange={(e) =>
                                                                    handleUpdateProduct(
                                                                        formulaIndex,
                                                                        elementIndex,
                                                                        productIndex,
                                                                        e.target.value
                                                                    )
                                                                }
                                                                isReadOnly={isReadOnly}
                                                                className="flex-1"
                                                            />
                                                            {!isReadOnly && (
                                                                <button
                                                                    onClick={() =>
                                                                        handleDeleteProduct(
                                                                            formulaIndex,
                                                                            elementIndex,
                                                                            productIndex
                                                                        )
                                                                    }
                                                                    className="text-red-500 hover:text-red-700 text-xl font-bold w-6 h-6 flex items-center justify-center"
                                                                    title="Supprimer ce produit"
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {!isReadOnly && (
                                                        <AdminButton
                                                            variant="add"
                                                            className="py-1 px-2 text-xs mt-0"
                                                            onClick={() => handleAddProduct(formulaIndex, elementIndex)}
                                                        >
                                                            + Produit
                                                        </AdminButton>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {!isReadOnly && (
                                <AdminButton
                                    variant="add"
                                    className="py-1 px-2 text-xs mt-0"
                                    onClick={() => handleAddElement(formulaIndex)}
                                >
                                    + Étape
                                </AdminButton>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}
