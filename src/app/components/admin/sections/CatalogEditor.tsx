'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import { AdminProduct } from './ProductsConfig';
import { Currency } from '@/app/utils/interfaces';
import { colorToHex } from '@/app/utils/colors';
import { DEFAULT_CATEGORY } from '@/app/utils/constants';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';
import PriceInput from '../PriceInput';
import ColorSwatchPicker from '../ColorSwatchPicker';

const GRID_COLS = 6;
const GRID_ROWS = 6;
const MAX_PRODUCTS = GRID_COLS * GRID_ROWS;

interface CatalogEditorProps {
    products: AdminProduct[];
    categories: { label: string; value: string }[];
    currencies: Currency[];
    onChange: (data: AdminProduct[]) => void;
    onSave?: (data: AdminProduct[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

interface GridProduct extends AdminProduct {
    _gridId: string;
}

interface SortableTileProps {
    product: GridProduct;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    currencySymbol: string;
}

function SortableTile({ product, index, isSelected, onSelect, currencySymbol }: SortableTileProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: product._gridId,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const bgColor = colorToHex(product.color);
    const price = parseFloat(product.currencies[0] || '0') || 0;

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={twMerge(
                'relative h-20 flex flex-col text-center font-semibold text-base border-[3px] rounded-2xl select-none cursor-pointer',
                'border-secondary-light dark:border-secondary-dark shadow-xl',
                bgColor ? 'text-black dark:text-white' : 'hover:bg-active-light dark:hover:bg-active-dark',
                isSelected && 'ring-2 ring-blue-500 ring-offset-1'
            )}
            style={bgColor ? { ...style, backgroundColor: bgColor } : style}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
        >
            <div
                className="h-15 flex items-center justify-center line-clamp-3 leading-tight hyphens-auto text-center"
                lang="fr"
            >
                {product.name || `#${index + 1}`}
            </div>
            {price > 0 && (
                <div className="h-5 flex items-center justify-end text-sm font-normal leading-none pr-2">
                    {price.toFixed(2)}
                    {currencySymbol}
                </div>
            )}
        </div>
    );
}

function EmptyTile() {
    return (
        <div className="h-20 border-[3px] border-dashed border-gray-200 dark:border-gray-700 rounded-2xl opacity-50" />
    );
}

export default function CatalogEditor({
    products,
    categories,
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
}: CatalogEditorProps) {
    const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const categoryBarRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { distance: 10 } })
    );

    const categoryLabels = useMemo(() => categories.map((c) => c.label), [categories]);

    // Group products by category, preserving array order
    const productsByCategory = useMemo(() => {
        const groups: Record<string, AdminProduct[]> = {};
        for (const cat of categoryLabels) {
            groups[cat] = [];
        }
        for (const p of products) {
            const cat = p.category || DEFAULT_CATEGORY;
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        }
        return groups;
    }, [products, categoryLabels]);

    const currentCategory = categoryLabels[selectedCategoryIndex] ?? categoryLabels[0] ?? DEFAULT_CATEGORY;
    const currentProducts = useMemo(
        () => productsByCategory[currentCategory] ?? [],
        [productsByCategory, currentCategory]
    );

    // Assign grid IDs for dnd-kit
    const gridProducts: GridProduct[] = useMemo(
        () => currentProducts.map((p, i) => ({ ...p, _gridId: `grid-${i}` })),
        [currentProducts]
    );

    // Build the 6×6 grid slots
    const gridSlots = useMemo(() => {
        const slots: (GridProduct | null)[] = new Array(MAX_PRODUCTS).fill(null);
        for (let i = 0; i < Math.min(gridProducts.length, MAX_PRODUCTS); i++) {
            slots[i] = gridProducts[i];
        }
        return slots;
    }, [gridProducts]);

    const selectedProduct = useMemo(() => {
        if (!selectedProductId) return null;
        return gridProducts.find((p) => p._gridId === selectedProductId) ?? null;
    }, [selectedProductId, gridProducts]);

    const updateScrollState = useCallback(() => {
        const el = categoryBarRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }, []);

    const scrollCategoryBar = useCallback((direction: 'left' | 'right') => {
        const el = categoryBarRef.current;
        if (!el) return;
        el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
    }, []);

    useEffect(() => {
        updateScrollState();
    }, [categoryLabels, updateScrollState]);

    // Reset selected category if out of bounds
    useEffect(() => {
        if (selectedCategoryIndex >= categoryLabels.length) {
            setSelectedCategoryIndex(0);
        }
    }, [categoryLabels.length, selectedCategoryIndex]);

    // Deselect product when switching categories
    useEffect(() => {
        setSelectedProductId(null);
    }, [selectedCategoryIndex]);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const oldIndex = gridProducts.findIndex((p) => p._gridId === active.id);
            const newIndex = gridProducts.findIndex((p) => p._gridId === over.id);
            if (oldIndex === -1 || newIndex === -1) return;

            // Reorder within the current category's products
            const reorderedCatProducts = arrayMove(currentProducts, oldIndex, newIndex);

            // Rebuild the full products array: replace this category's products in place
            const catIndices = products
                .map((p, i) => ((p.category || DEFAULT_CATEGORY) === currentCategory ? i : -1))
                .filter((i) => i !== -1);

            const result = [...products];
            catIndices.forEach((origIdx, slot) => {
                if (slot < reorderedCatProducts.length) {
                    result[origIdx] = reorderedCatProducts[slot];
                }
            });

            onChange(result);
        },
        [gridProducts, currentProducts, products, currentCategory, onChange]
    );

    const handleProductUpdate = useCallback(
        (updated: AdminProduct) => {
            if (!selectedProduct) return;
            // Find the product in the full products array by matching the same object
            const result = products.map((p) =>
                p === currentProducts[gridProducts.findIndex((g) => g._gridId === selectedProductId)] ? updated : p
            );
            onChange(result);
        },
        [selectedProduct, selectedProductId, products, currentProducts, gridProducts, onChange]
    );

    const handleAddProduct = useCallback(() => {
        const newProduct: AdminProduct = {
            name: '',
            category: currentCategory,
            stock: null,
            currencies: [],
        };
        onChange([...products, newProduct]);
    }, [currentCategory, products, onChange]);

    const handleDeleteProduct = useCallback(() => {
        if (!selectedProduct) return;
        const idx = gridProducts.findIndex((g) => g._gridId === selectedProductId);
        if (idx === -1) return;
        const catProduct = currentProducts[idx];
        const result = products.filter((p) => p !== catProduct);
        setSelectedProductId(null);
        onChange(result);
    }, [selectedProduct, selectedProductId, gridProducts, currentProducts, products, onChange]);

    const currencySymbol = currencies[0]?.symbol ?? '€';
    const isValid = products.every((p) => p.name?.trim());

    const sortableItems = gridSlots.filter((p): p is GridProduct => p !== null).map((p) => p._gridId);

    return (
        <SectionCard
            title="Aperçu catalogue (WYSIWYG)"
            onSave={onSave ? () => onSave(products) : undefined}
            onCancel={onCancel}
            hasChanges={hasChanges}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            icon={icon}
            onAdd={isReadOnly ? undefined : handleAddProduct}
            isValid={isValid}
            addLabel="Ajouter un produit"
            isReadOnly={isReadOnly}
        >
            <div className="flex flex-col gap-4">
                {/* Horizontal category bar */}
                <div className="flex items-center border-b-[3px] border-active-light dark:border-active-dark shrink-0">
                    {canScrollLeft && (
                        <button
                            type="button"
                            onClick={() => scrollCategoryBar('left')}
                            className="shrink-0 p-1 hover:bg-active-light dark:hover:bg-active-dark text-light dark:text-dark"
                        >
                            <IconChevronLeft size={24} />
                        </button>
                    )}
                    <div
                        ref={categoryBarRef}
                        onScroll={updateScrollState}
                        className="flex overflow-x-auto border-none scrollbar-none"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {categoryLabels.map((category, index) => (
                            <div
                                key={index}
                                className={twMerge(
                                    'flex-1 min-w-fit px-4 py-2 font-semibold text-lg text-center cursor-pointer whitespace-nowrap',
                                    'hover:bg-active-light dark:hover:bg-active-dark',
                                    index === selectedCategoryIndex
                                        ? 'bg-active-light dark:bg-active-dark text-popup-dark dark:text-popup-light'
                                        : ''
                                )}
                                onClick={() => setSelectedCategoryIndex(index)}
                            >
                                {category}
                            </div>
                        ))}
                    </div>
                    {canScrollRight && (
                        <button
                            type="button"
                            onClick={() => scrollCategoryBar('right')}
                            className="shrink-0 p-1 hover:bg-active-light dark:hover:bg-active-dark text-light dark:text-dark"
                        >
                            <IconChevronRight size={24} />
                        </button>
                    )}
                </div>

                <div className="flex gap-4">
                    {/* 6×6 product grid */}
                    <div className="flex-1">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
                                <div className="grid grid-cols-6 auto-rows-20 gap-1 p-1">
                                    {gridSlots.map((product, index) => {
                                        if (!product) {
                                            return <EmptyTile key={`empty-${index}`} />;
                                        }
                                        return (
                                            <SortableTile
                                                key={product._gridId}
                                                product={product}
                                                index={index}
                                                isSelected={selectedProductId === product._gridId}
                                                onSelect={() =>
                                                    setSelectedProductId(
                                                        selectedProductId === product._gridId ? null : product._gridId
                                                    )
                                                }
                                                currencySymbol={currencySymbol}
                                            />
                                        );
                                    })}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>

                    {/* Inline edit panel */}
                    {selectedProduct && !isReadOnly && (
                        <div className="w-64 shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-white dark:bg-gray-800">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">Édition produit</h3>
                                <button
                                    onClick={() => setSelectedProductId(null)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                    <IconX size={18} />
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Nom
                                </label>
                                <ValidatedInput
                                    type="text"
                                    value={selectedProduct.name}
                                    onChange={(value) =>
                                        handleProductUpdate({ ...selectedProduct, name: String(value) })
                                    }
                                    placeholder="Nom du produit"
                                    maxLength={50}
                                    isReadOnly={isReadOnly}
                                    isNameField
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Prix
                                </label>
                                <PriceInput
                                    value={selectedProduct.currencies[0] ?? '0'}
                                    onChange={(value) => {
                                        const updated = [...selectedProduct.currencies];
                                        updated[0] = String(value);
                                        handleProductUpdate({ ...selectedProduct, currencies: updated });
                                    }}
                                    currencies={currencies}
                                    isReadOnly={isReadOnly}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Couleur
                                </label>
                                <ColorSwatchPicker
                                    color={selectedProduct.color ?? ''}
                                    onChange={(color) => handleProductUpdate({ ...selectedProduct, color })}
                                    isReadOnly={isReadOnly}
                                />
                            </div>

                            <button
                                onClick={handleDeleteProduct}
                                className="w-full text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 py-1.5 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                                Supprimer le produit
                            </button>
                        </div>
                    )}
                </div>

                {currentProducts.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                        Aucun produit dans cette catégorie. Cliquez sur « Ajouter un produit » pour commencer.
                    </div>
                )}
            </div>
        </SectionCard>
    );
}
