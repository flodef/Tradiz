'use client';

import { useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionCard from '../SectionCard';
import ProductItem from '../items/ProductItem';

export interface AdminProduct {
    name: string;
    category: string;
    availability: boolean;
    currencies: string[];
}

type AvailabilityFilter = 'all' | 'available' | 'unavailable';

function SortableProductItem({
    id,
    product,
    onChange,
    onDelete,
    categories,
    currencies,
    readOnly,
}: {
    id: string;
    product: AdminProduct;
    onChange: (p: AdminProduct) => void;
    onDelete?: () => void;
    categories: { label: string; value: string }[];
    currencies: { label: string; value: string }[];
    readOnly: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    return (
        <div ref={setNodeRef} style={style}>
            <ProductItem
                product={product}
                onChange={onChange}
                onDelete={onDelete}
                categories={categories}
                currencies={currencies}
                readOnly={readOnly}
                dragHandleProps={readOnly ? undefined : { ...attributes, ...listeners }}
            />
        </div>
    );
}

function CategoryAccordion({
    cat,
    items,
    allProducts,
    onProductChange,
    onProductDelete,
    onProductsReorder,
    onAddProduct,
    categories,
    currencies,
    isReadOnly,
    hasFilter,
}: {
    cat: string;
    items: { p: AdminProduct; i: number }[];
    allProducts: AdminProduct[];
    onProductChange: (i: number, p: AdminProduct) => void;
    onProductDelete: (i: number) => void;
    onProductsReorder: (updated: AdminProduct[]) => void;
    onAddProduct: (cat: string) => void;
    categories: { label: string; value: string }[];
    currencies: { label: string; value: string }[];
    isReadOnly: boolean;
    hasFilter: boolean;
}) {
    const [open, setOpen] = useState(false);
    const sensors = useSensors(useSensor(PointerSensor));

    const itemIds = items.map(({ i }) => String(i));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = itemIds.indexOf(String(active.id));
        const newIdx = itemIds.indexOf(String(over.id));
        const reordered = arrayMove(items, oldIdx, newIdx);
        // Replace this category's items in their original positions with the reordered versions
        const catProducts = reordered.map(({ p }) => p);
        const catIndices = allProducts
            .map((p, i) => ((p.category || 'Sans catégorie') === cat ? i : -1))
            .filter((i) => i !== -1);
        const result = [...allProducts];
        catIndices.forEach((origIdx, slot) => {
            result[origIdx] = catProducts[slot];
        });
        onProductsReorder(result);
    };

    return (
        <div className="mb-2 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
            <div
                className="flex items-center justify-between px-4 py-2 cursor-pointer select-none bg-white/20 dark:bg-black/20"
                onClick={() => setOpen((o) => !o)}
            >
                <div className="flex items-center gap-2">
                    <svg
                        className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-semibold">{cat}</span>
                    <span className="text-xs opacity-60">
                        ({items.length} produit{items.length > 1 ? 's' : ''})
                    </span>
                </div>
            </div>
            {open && (
                <div className="px-4 py-2">
                    {items.length === 0 ? (
                        <p className="text-md opacity-60 py-2">Aucun produit correspondant</p>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                                {items.map(({ p, i }) => (
                                    <SortableProductItem
                                        key={i}
                                        id={String(i)}
                                        product={p}
                                        onChange={(updated) => onProductChange(i, updated)}
                                        onDelete={isReadOnly ? undefined : () => onProductDelete(i)}
                                        categories={categories}
                                        currencies={currencies}
                                        readOnly={isReadOnly}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                    {!isReadOnly && !hasFilter && (
                        <button
                            onClick={() => onAddProduct(cat === 'Sans catégorie' ? '' : cat)}
                            className="mt-1 mb-1 text-sm bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-sm"
                        >
                            + Ajouter dans &quot;{cat}&quot;
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ProductsConfig({
    config,
    onChange,
    onSave,
    categories,
    currencies,
    isReadOnly = false,
}: {
    config: AdminProduct[];
    onChange: (data: AdminProduct[]) => void;
    onSave?: (data: AdminProduct[]) => void;
    categories: { label: string; value: string }[];
    currencies: { label: string; value: string }[];
    isReadOnly?: boolean;
}) {
    const [products, setProducts] = useState(config || []);
    const [search, setSearch] = useState('');
    const [availFilter, setAvailFilter] = useState<AvailabilityFilter>('all');

    useEffect(() => {
        setProducts(config || []);
    }, [config]);

    const handleProductChange = (index: number, updatedProduct: AdminProduct) => {
        const newProducts = [...products];
        newProducts[index] = updatedProduct;
        setProducts(newProducts);
        onChange(newProducts);
    };

    const handleDeleteProduct = (index: number) => {
        const newProducts = products.filter((_, i) => i !== index);
        setProducts(newProducts);
        onChange(newProducts);
    };

    const handleReorder = (updated: AdminProduct[]) => {
        setProducts(updated);
        onChange(updated);
    };

    const handleAddProduct = (category = '') => {
        const newProduct: AdminProduct = { name: '', category, availability: false, currencies: [] };
        const updated = [...products, newProduct];
        setProducts(updated);
        onChange(updated);
    };

    const hasFilter = !!(search || availFilter !== 'all');

    const filteredProducts = useMemo(() => {
        return products
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => {
                if (availFilter === 'available' && !p.availability) return false;
                if (availFilter === 'unavailable' && p.availability) return false;
                if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
                return true;
            });
    }, [products, search, availFilter]);

    const categoryOrder = useMemo(() => {
        const seen: string[] = [];
        for (const p of products) {
            const key = p.category || 'Sans catégorie';
            if (!seen.includes(key)) seen.push(key);
        }
        return seen;
    }, [products]);

    const categoryGroups = useMemo(() => {
        const groups: Record<string, { p: AdminProduct; i: number }[]> = {};
        for (const item of filteredProducts) {
            const key = item.p.category || 'Sans catégorie';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }
        return groups;
    }, [filteredProducts]);

    const totalFiltered = filteredProducts.length;

    const headerControls = (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
                <svg
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                    />
                </svg>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher..."
                    maxLength={15}
                    className="pl-7 pr-6 py-1.5 w-40 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none"
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        aria-label="Effacer la recherche"
                    >
                        ×
                    </button>
                )}
            </div>
            <select
                value={availFilter}
                onChange={(e) => setAvailFilter(e.target.value as AvailabilityFilter)}
                className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200"
            >
                <option value="all">Tous</option>
                <option value="available">Disponibles</option>
                <option value="unavailable">Indisponibles</option>
            </select>
        </div>
    );

    return (
        <SectionCard title="Produits" onSave={onSave ? () => onSave(products) : undefined} headerExtra={headerControls}>
            {totalFiltered === 0 && hasFilter ? (
                <p className="text-md opacity-60 py-4 text-center">Aucun produit correspondant</p>
            ) : (
                categoryOrder
                    .filter((cat) => categoryGroups[cat] !== undefined)
                    .map((cat) => (
                        <CategoryAccordion
                            key={cat}
                            cat={cat}
                            items={categoryGroups[cat]}
                            allProducts={products}
                            onProductChange={handleProductChange}
                            onProductDelete={handleDeleteProduct}
                            onProductsReorder={handleReorder}
                            onAddProduct={handleAddProduct}
                            categories={categories}
                            currencies={currencies}
                            isReadOnly={isReadOnly}
                            hasFilter={hasFilter}
                        />
                    ))
            )}
            {!isReadOnly && !hasFilter && (
                <button
                    onClick={() => handleAddProduct()}
                    className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-sm"
                >
                    Ajouter un produit
                </button>
            )}
        </SectionCard>
    );
}
