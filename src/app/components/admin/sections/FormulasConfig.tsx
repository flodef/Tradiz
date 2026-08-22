'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Currency } from '@/app/utils/interfaces';
import { AdminProduct } from './ProductsConfig';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import ValidatedInput from '../ValidatedInput';
import PriceInput from '../PriceInput';
import AdminSelect from '../AdminSelect';
import DeleteButton from '../DeleteButton';
import { usePopup } from '@/app/hooks/usePopup';
import { IconGripVertical } from '@tabler/icons-react';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface FormulaElement {
    name: string;
    category?: string;
    products?: string[];
}

export interface AdminFormula {
    name: string;
    price: string;
    mode: 'category' | 'products';
    category: string;
    elements: FormulaElement[];
}

interface InternalFormula extends AdminFormula {
    _id: number;
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

function hasElements(formula: AdminFormula): boolean {
    return formula.elements.length > 0;
}

export function computeMaxFormulaPrice(formula: AdminFormula, products: AdminProduct[]): number {
    return formula.elements.reduce((total, element) => {
        if (element.category) {
            // For category mode, take the max price from that category
            const choices = products.filter((p) => p.category === element.category);
            const max = Math.max(0, ...choices.map((p) => parseFloat(p.currencies[0] || '0') || 0));
            return total + max;
        } else if (element.products?.length) {
            // For specific products mode, sum all the selected products
            const selectedProducts = products.filter((p) => element.products?.includes(p.name));
            const sum = selectedProducts.reduce((sum, p) => sum + (parseFloat(p.currencies[0] || '0') || 0), 0);
            return total + sum;
        }
        return total;
    }, 0);
}

const SortableFormula = memo(function SortableFormula({
    formula,
    isReadOnly,
    children,
    currencies,
    categories,
    onNameChange,
    onAutoName,
    onPriceChange,
    onApplyMaxPrice,
    onModeChange,
    onCategoryChange,
    onDelete,
    hasElements,
    nameInputRef,
}: {
    formula: InternalFormula;
    isReadOnly: boolean;
    children: React.ReactNode;
    currencies: Currency[];
    categories: string[];
    onNameChange: (value: string) => void;
    onAutoName: () => void;
    onPriceChange: (value: string) => void;
    onApplyMaxPrice: () => void;
    onModeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onCategoryChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onDelete: () => void;
    hasElements: boolean;
    nameInputRef?: (el: HTMLInputElement | null) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: formula._id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-white/20 dark:bg-black/10 space-y-3"
        >
            <div className="flex flex-wrap items-center gap-2">
                {!isReadOnly && (
                    <span
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing shrink-0 touch-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <IconGripVertical size={18} stroke={2} />
                    </span>
                )}
                <div className="flex-1 min-w-48">
                    <ValidatedInput
                        type="text"
                        value={formula.name}
                        onChange={(value) => onNameChange(String(value))}
                        placeholder="Nom de la formule"
                        isReadOnly={isReadOnly}
                        isNameField
                        maxLength={50}
                        validation={(value) => value.toString().trim().length > 0}
                        ref={nameInputRef}
                    />
                </div>
                {!isReadOnly && (
                    <AdminButton
                        variant="secondary"
                        className="py-1 px-2 text-xs"
                        onClick={onAutoName}
                        disabled={!hasElements}
                    >
                        Nom auto.
                    </AdminButton>
                )}
                <div className="flex items-center gap-2">
                    <PriceInput
                        value={formula.price}
                        onChange={(value) => onPriceChange(String(value))}
                        currencies={currencies}
                        isReadOnly={isReadOnly}
                        className="w-18"
                        validation={(value) => parseFloat(String(value)) > 0}
                    />
                    {!isReadOnly && (
                        <AdminButton
                            variant="secondary"
                            className="py-1 px-2 text-xs"
                            onClick={onApplyMaxPrice}
                            disabled={!hasElements}
                        >
                            Prix max
                        </AdminButton>
                    )}
                    <AdminSelect
                        options={[
                            { label: 'Catégories', value: 'category' },
                            { label: 'Produits', value: 'products' },
                        ]}
                        value={formula.mode}
                        onChange={onModeChange}
                        isReadOnly={isReadOnly}
                        className="w-36 shrink-0"
                    />
                    <AdminSelect
                        options={[
                            { label: '— Catégorie —', value: '' },
                            ...categories.map((c) => ({ label: c, value: c })),
                        ]}
                        value={formula.category}
                        onChange={onCategoryChange}
                        isReadOnly={isReadOnly}
                        className="w-36 shrink-0"
                    />
                    {!isReadOnly && <DeleteButton onClick={onDelete} title="Supprimer la formule" />}
                </div>
            </div>
            {children}
        </div>
    );
});

const SortableProduct = memo(function SortableProduct({
    productIndex,
    product,
    availableOptions,
    isReadOnly,
    onUpdate,
    onDelete,
}: {
    productIndex: number;
    product: string;
    availableOptions: { label: string; value: string }[];
    isReadOnly: boolean;
    onUpdate: (value: string) => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: productIndex,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-1">
            {!isReadOnly && (
                <span
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing shrink-0 touch-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                    <IconGripVertical size={14} stroke={2} />
                </span>
            )}
            <AdminSelect
                options={availableOptions}
                value={product}
                onChange={(e) => onUpdate(e.target.value)}
                isReadOnly={isReadOnly}
                className="flex-1"
            />
            {!isReadOnly && (
                <button
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-700 text-3xl font-bold w-6 h-6 flex items-center justify-center shrink-0 cursor-pointer"
                    title="Supprimer ce produit"
                >
                    ×
                </button>
            )}
        </div>
    );
});

const SortableElement = memo(function SortableElement({
    elementIndex,
    element,
    availableCategoryOptions,
    isReadOnly,
    onUpdate,
    onDelete,
}: {
    elementIndex: number;
    element: FormulaElement;
    availableCategoryOptions: { label: string; value: string }[];
    isReadOnly: boolean;
    onUpdate: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: elementIndex,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-1">
            {!isReadOnly && (
                <span
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing shrink-0 touch-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                    <IconGripVertical size={14} stroke={2} />
                </span>
            )}
            <AdminSelect
                options={availableCategoryOptions}
                value={element.category || ''}
                onChange={onUpdate}
                isReadOnly={isReadOnly}
                className="flex-1"
            />
            {!isReadOnly && (
                <button
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-700 text-3xl font-bold w-6 h-6 flex items-center justify-center shrink-0 cursor-pointer"
                    title="Supprimer l'étape"
                >
                    ×
                </button>
            )}
        </div>
    );
});

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
    const nextIdRef = useRef(0);
    const [formulas, setFormulas] = useState<InternalFormula[]>(
        (config || []).map((f) => ({ ...f, _id: nextIdRef.current++ }))
    );
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const selfUpdateRef = useRef(false);
    const { openFullscreenPopup } = usePopup();
    const formulaNameInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const focusAfterDeleteRef = useRef<number | null>(null);

    // Only PointerSensor — it handles both mouse and touch via the Pointer Events API.
    // Using TouchSensor alongside PointerSensor causes conflicts on touch-enabled
    // Windows devices (both sensors fire, one cancels the other's drag).
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

    const decimals = useMemo(() => getDecimals(currencies), [currencies]);

    const categoryOptions = useMemo(() => categories.map((c) => ({ label: c, value: c })), [categories]);
    const productOptions = useMemo(() => products.map((p) => ({ label: p.name, value: p.name })), [products]);

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setFormulas((config || []).map((f) => ({ ...f, _id: nextIdRef.current++ })));
    }, [config]);

    // Ref callbacks run before effects, so a target that is still set here was never rendered
    // and must be dropped to avoid stealing focus later.
    useEffect(() => {
        focusAfterDeleteRef.current = null;
    }, [formulas]);

    const strip = (items: InternalFormula[]): AdminFormula[] => items.map(({ _id: _, ...rest }) => rest);

    const notifyParent = useCallback(
        (data: InternalFormula[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(data));
            }, 300);
        },
        [onChange]
    );

    const isValid = useMemo(() => {
        return formulas.every((f) => {
            if (!f.name.trim()) return false;
            if (!f.category.trim()) return false;
            const price = parseFloat(f.price);
            if (isNaN(price) || price <= 0) return false;
            if (f.elements.length === 0) return false;
            return f.elements.every((el) => {
                if (f.mode === 'category') return !!el.category;
                return !!el.products && el.products.length > 0 && el.products.some((p) => p.trim());
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
            const mode = (categories.length > 0 ? 'category' : 'products') as 'category' | 'products';
            const updated = [
                ...prev,
                {
                    name: '',
                    price: (0).toFixed(decimals),
                    mode,
                    category: '',
                    elements: [],
                    _id: nextIdRef.current++,
                },
            ];
            notifyParent(updated);
            return updated;
        });
    };

    const handleDeleteFormula = (index: number) => {
        setFormulas((prev) => {
            const updated = prev.filter((_, i) => i !== index);
            if (updated.length > 0) {
                focusAfterDeleteRef.current = Math.max(0, index - 1);
            }
            notifyParent(updated);
            return updated;
        });
    };

    const handleAddElement = (formulaIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                // Only category mode uses steps
                const usedCategories = new Set(f.elements.map((el) => el.category).filter(Boolean) as string[]);
                const availableCategory = categories.find((c) => !usedCategories.has(c)) || '';
                return { ...f, elements: [...f.elements, { name: '', category: availableCategory }] };
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

    const handleAddProduct = (formulaIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                // Product mode: single element with all products
                const element = f.elements[0] || { name: '', products: [] };
                const allUsedProducts = new Set(element.products || []);
                const availableProduct = productOptions.find((opt) => !allUsedProducts.has(opt.value));
                const newProduct = availableProduct?.value || '';
                return {
                    ...f,
                    elements: [{ ...element, products: [...(element.products || []), newProduct] }],
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleUpdateProduct = (formulaIndex: number, productIndex: number, value: string) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                const element = f.elements[0];
                if (!element) return f;
                const products = [...(element.products || [])];
                products[productIndex] = value;
                return { ...f, elements: [{ ...element, products }] };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleDeleteProduct = (formulaIndex: number, productIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                const element = f.elements[0];
                if (!element) return f;
                return {
                    ...f,
                    elements: [{ ...element, products: (element.products || []).filter((_, k) => k !== productIndex) }],
                };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleFormulaDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setFormulas((prev) => {
                const oldIdx = prev.findIndex((f) => f._id === active.id);
                const newIdx = prev.findIndex((f) => f._id === over.id);
                if (oldIdx === -1 || newIdx === -1) return prev;
                const reordered = arrayMove(prev, oldIdx, newIdx);
                notifyParent(reordered);
                return reordered;
            });
        },
        [notifyParent]
    );

    const handleProductDragEnd = useCallback(
        (formulaId: number) => (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setFormulas((prev) => {
                const updated = prev.map((f) => {
                    if (f._id !== formulaId) return f;
                    const element = f.elements[0];
                    if (!element) return f;
                    const products = [...(element.products || [])];
                    const oldIdx = Number(active.id);
                    const newIdx = Number(over.id);
                    if (oldIdx < 0 || newIdx < 0 || oldIdx >= products.length || newIdx >= products.length) return f;
                    const reordered = arrayMove(products, oldIdx, newIdx);
                    return { ...f, elements: [{ ...element, products: reordered }] };
                });
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleElementDragEnd = useCallback(
        (formulaId: number) => (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setFormulas((prev) => {
                const updated = prev.map((f) => {
                    if (f._id !== formulaId) return f;
                    const oldIdx = Number(active.id);
                    const newIdx = Number(over.id);
                    if (oldIdx < 0 || newIdx < 0 || oldIdx >= f.elements.length || newIdx >= f.elements.length)
                        return f;
                    return { ...f, elements: arrayMove(f.elements, oldIdx, newIdx) };
                });
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

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

    const handleAutoName = (formulaIndex: number) => {
        setFormulas((prev) => {
            const updated = prev.map((f, i) => {
                if (i !== formulaIndex) return f;
                const names: string[] = [];
                f.elements.forEach((element) => {
                    if (element.category) {
                        names.push(element.category.trim());
                    } else if (element.products?.length) {
                        element.products.forEach((productName) => {
                            if (productName.trim()) {
                                names.push(productName.trim());
                            }
                        });
                    }
                });
                const autoName = names.length > 0 ? names.join(' + ') : '';
                return { ...f, name: autoName };
            });
            notifyParent(updated);
            return updated;
        });
    };

    const handleCancel = () => {
        openFullscreenPopup(
            'Êtes-vous sûr de vouloir annuler les modifications ?',
            ['Confirmer', 'Annuler'],
            (index: number) => {
                if (index === 0 && onCancel) {
                    onCancel();
                }
            }
        );
    };

    const handleFormulaModeChange = (formulaIndex: number, mode: 'category' | 'products') => {
        const formula = formulas[formulaIndex];
        if (!formula || mode === formula.mode) return;

        // If the formula already has content, warn before resetting
        const hasContent = formula.name.trim() || parseFloat(formula.price) > 0 || formula.elements.length > 0;
        if (hasContent) {
            openFullscreenPopup(
                'Changer le mode réinitialisera le nom, le prix et les étapes de la formule. Continuer ?',
                ['Confirmer', 'Annuler'],
                (index: number) => {
                    if (index === 0) {
                        setFormulas((prev) => {
                            const updated = prev.map((f, i) =>
                                i === formulaIndex
                                    ? {
                                          ...f,
                                          mode,
                                          name: '',
                                          price: (0).toFixed(decimals),
                                          elements: [],
                                      }
                                    : f
                            );
                            notifyParent(updated);
                            return updated;
                        });
                    }
                }
            );
            return;
        }

        setFormulas((prev) => {
            const updated = prev.map((f, i) => (i === formulaIndex ? { ...f, mode, elements: [] } : f));
            notifyParent(updated);
            return updated;
        });
    };

    return (
        <SectionCard
            title="Formules"
            onSave={onSave ? () => onSave(strip(formulas)) : undefined}
            saveDisabled={!isValid}
            icon={icon}
            onCancel={isReadOnly || !hasChanges ? undefined : handleCancel}
            hasChanges={hasChanges}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            onAdd={handleAddFormula}
            isValid={isValid}
            addLabel="Ajouter une formule"
            isReadOnly={isReadOnly}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFormulaDragEnd}>
                <SortableContext items={formulas.map((f) => f._id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4">
                        {formulas.map((formula, formulaIndex) => (
                            <SortableFormula
                                key={formula._id}
                                formula={formula}
                                isReadOnly={isReadOnly}
                                currencies={currencies}
                                categories={categories}
                                onNameChange={(value) => updateFormula(formulaIndex, { name: String(value) })}
                                onAutoName={() => handleAutoName(formulaIndex)}
                                onPriceChange={(value) => updateFormula(formulaIndex, { price: String(value) })}
                                onApplyMaxPrice={() => handleApplyMaxPrice(formulaIndex)}
                                onModeChange={(e) =>
                                    handleFormulaModeChange(formulaIndex, e.target.value as 'category' | 'products')
                                }
                                onCategoryChange={(e) => updateFormula(formulaIndex, { category: e.target.value })}
                                onDelete={() => handleDeleteFormula(formulaIndex)}
                                hasElements={hasElements(formula)}
                                nameInputRef={(el) => {
                                    if (el) {
                                        formulaNameInputRefs.current.set(formulaIndex, el);
                                        if (focusAfterDeleteRef.current === formulaIndex) {
                                            el.focus();
                                            el.select();
                                            focusAfterDeleteRef.current = null;
                                        }
                                    } else {
                                        formulaNameInputRefs.current.delete(formulaIndex);
                                    }
                                }}
                            >
                                <div className="space-y-2 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                                    {formula.mode === 'products' ? (
                                        <DndContext
                                            sensors={sensors}
                                            collisionDetection={closestCenter}
                                            onDragEnd={handleProductDragEnd(formula._id)}
                                        >
                                            <SortableContext
                                                items={(formula.elements[0]?.products || []).map((_, i) => i)}
                                                strategy={verticalListSortingStrategy}
                                            >
                                                <div className="space-y-2 flex flex-col">
                                                    {(() => {
                                                        const element = formula.elements[0];
                                                        const products = element?.products || [];
                                                        const usedProducts = new Set(products);
                                                        return products.map((product, productIndex) => {
                                                            const availableOptions = productOptions.filter(
                                                                (opt) =>
                                                                    !usedProducts.has(opt.value) ||
                                                                    opt.value === product
                                                            );
                                                            return (
                                                                <SortableProduct
                                                                    // Must match SortableProduct's dnd id (productIndex);
                                                                    // product values can be '' when options run out.
                                                                    key={productIndex}
                                                                    productIndex={productIndex}
                                                                    product={product}
                                                                    availableOptions={availableOptions}
                                                                    isReadOnly={isReadOnly}
                                                                    onUpdate={(value) =>
                                                                        handleUpdateProduct(
                                                                            formulaIndex,
                                                                            productIndex,
                                                                            value
                                                                        )
                                                                    }
                                                                    onDelete={() =>
                                                                        handleDeleteProduct(formulaIndex, productIndex)
                                                                    }
                                                                />
                                                            );
                                                        });
                                                    })()}
                                                    {!isReadOnly &&
                                                        (() => {
                                                            const allUsedProducts = new Set(
                                                                formula.elements[0]?.products || []
                                                            );
                                                            const hasAvailable = productOptions.some(
                                                                (opt) => !allUsedProducts.has(opt.value)
                                                            );
                                                            return (
                                                                <AdminButton
                                                                    variant="add"
                                                                    className="py-1 px-2 text-xs shrink-0 w-fit mt-1"
                                                                    onClick={() => handleAddProduct(formulaIndex)}
                                                                    disabled={!hasAvailable}
                                                                >
                                                                    + Produit
                                                                </AdminButton>
                                                            );
                                                        })()}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                    ) : (
                                        <DndContext
                                            sensors={sensors}
                                            collisionDetection={closestCenter}
                                            onDragEnd={handleElementDragEnd(formula._id)}
                                        >
                                            <SortableContext
                                                items={formula.elements.map((_, i) => i)}
                                                strategy={verticalListSortingStrategy}
                                            >
                                                <div className="space-y-2 flex flex-col">
                                                    {formula.elements.map((element, elementIndex) => {
                                                        const usedCategories = new Set(
                                                            formula.elements
                                                                .map((el, j) =>
                                                                    j !== elementIndex ? el.category : undefined
                                                                )
                                                                .filter(Boolean) as string[]
                                                        );
                                                        const availableCategoryOptions = categoryOptions.filter(
                                                            (opt) =>
                                                                !usedCategories.has(opt.value) ||
                                                                opt.value === element.category
                                                        );
                                                        return (
                                                            <SortableElement
                                                                key={elementIndex}
                                                                elementIndex={elementIndex}
                                                                element={element}
                                                                availableCategoryOptions={availableCategoryOptions}
                                                                isReadOnly={isReadOnly}
                                                                onUpdate={(e) =>
                                                                    updateElement(formulaIndex, elementIndex, {
                                                                        category: e.target.value,
                                                                    })
                                                                }
                                                                onDelete={() =>
                                                                    handleDeleteElement(formulaIndex, elementIndex)
                                                                }
                                                            />
                                                        );
                                                    })}
                                                    {!isReadOnly && (
                                                        <AdminButton
                                                            variant="add"
                                                            className="py-1 px-2 text-xs shrink-0 w-fit mt-1"
                                                            onClick={() => handleAddElement(formulaIndex)}
                                                            disabled={formula.elements.length >= categories.length}
                                                        >
                                                            + Étape
                                                        </AdminButton>
                                                    )}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                    )}
                                </div>
                            </SortableFormula>
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </SectionCard>
    );
}
