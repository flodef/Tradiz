'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Currency } from '@/app/utils/interfaces';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionCard from '../SectionCard';
import ProductItem from '../items/ProductItem';
import {
    IconLayoutGrid,
    IconLayoutList,
    IconChevronUp,
    IconChevronDown,
    IconCheck,
    IconX,
    IconFolders,
    IconList,
} from '@tabler/icons-react';
import SearchableSelect from '../SearchableSelect';
import { useLocalStorage } from '@/app/utils/localStorage';

type SortField = 'order' | 'name' | 'category' | 'price' | 'availability';
type SortDirection = 'asc' | 'desc';

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
    isReadOnly,
}: {
    id: string;
    product: AdminProduct;
    onChange: (p: AdminProduct) => void;
    onDelete?: () => void;
    categories: { label: string; value: string }[];
    currencies: Currency[];
    isReadOnly: boolean;
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
                isReadOnly={isReadOnly}
                dragHandleProps={isReadOnly ? undefined : { ...attributes, ...listeners }}
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
    availFilter,
}: {
    cat: string;
    items: { p: AdminProduct; i: number }[];
    allProducts: AdminProduct[];
    onProductChange: (i: number, p: AdminProduct) => void;
    onProductDelete: (i: number) => void;
    onProductsReorder: (updated: AdminProduct[]) => void;
    onAddProduct: (cat: string) => void;
    categories: { label: string; value: string }[];
    currencies: Currency[];
    isReadOnly: boolean;
    hasFilter: boolean;
    availFilter: AvailabilityFilter;
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
                        {availFilter === 'all'
                            ? `(${items.filter(({ p }) => p.availability).length} / ${items.length} produit${items.length > 1 ? 's' : ''})`
                            : `(${items.length} produit${items.length > 1 ? 's' : ''})`}
                    </span>
                </div>
            </div>
            {open && (
                <div className="px-4 py-2">
                    {items.length === 0 ? (
                        <p className="text-md opacity-60 py-2">Aucun produit correspondant</p>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={itemIds}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {items.map(({ p, i }) => (
                                        <SortableProductItem
                                            key={i}
                                            id={String(i)}
                                            product={p}
                                            onChange={(updated) => onProductChange(i, updated)}
                                            onDelete={isReadOnly ? undefined : () => onProductDelete(i)}
                                            categories={categories}
                                            currencies={currencies}
                                            isReadOnly={isReadOnly}
                                        />
                                    ))}
                                </div>
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
    currencies: Currency[];
    isReadOnly?: boolean;
}) {
    const [products, setProducts] = useState(config || []);
    const [search, setSearch] = useState('');
    const [availFilter, setAvailFilter] = useState<AvailabilityFilter>('all');
    const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('products-view-mode', 'list');
    const [groupByCategory, setGroupByCategory] = useLocalStorage<boolean>('products-group-by-category', false);
    const [sortField, setSortField] = useState<SortField>('order');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const categoryOrder = useMemo(() => {
        const seen: string[] = [];
        for (const p of products) {
            const key = p.category || 'Sans catégorie';
            if (!seen.includes(key)) seen.push(key);
        }
        return seen;
    }, [products]);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(categoryOrder));

    useEffect(() => {
        setProducts(config || []);
    }, [config]);

    useEffect(() => {
        // Initialize all categories as expanded when component mounts or categories change
        setExpandedCategories(new Set(categoryOrder));
    }, [categoryOrder]);

    const toggleCategory = (cat: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) {
                next.delete(cat);
            } else {
                next.add(cat);
            }
            return next;
        });
    };

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

    const categoryGroups = useMemo(() => {
        const groups: Record<string, { p: AdminProduct; i: number }[]> = {};
        for (const item of filteredProducts) {
            const key = item.p.category || 'Sans catégorie';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }

        // Sort within each category if grouping is enabled
        if (groupByCategory && viewMode === 'list') {
            Object.keys(groups).forEach((cat) => {
                groups[cat].sort((a, b) => {
                    let comparison = 0;
                    if (sortField === 'order') {
                        comparison = a.i - b.i;
                    } else if (sortField === 'name') {
                        comparison = a.p.name.localeCompare(b.p.name);
                    } else if (sortField === 'category') {
                        comparison = a.p.category.localeCompare(b.p.category);
                    } else if (sortField === 'price') {
                        const priceA = parseFloat(a.p.currencies[0] || '0');
                        const priceB = parseFloat(b.p.currencies[0] || '0');
                        comparison = priceA - priceB;
                    } else if (sortField === 'availability') {
                        comparison = (a.p.availability ? 1 : 0) - (b.p.availability ? 1 : 0);
                    }
                    return sortDirection === 'asc' ? comparison : -comparison;
                });
            });
        }

        return groups;
    }, [filteredProducts, groupByCategory, viewMode, sortField, sortDirection]);

    const sortedFilteredProducts = useMemo(() => {
        if (viewMode !== 'list' || groupByCategory) return filteredProducts;

        const sorted = [...filteredProducts];
        sorted.sort((a, b) => {
            let comparison = 0;
            if (sortField === 'order') {
                comparison = a.i - b.i;
            } else if (sortField === 'name') {
                comparison = a.p.name.localeCompare(b.p.name);
            } else if (sortField === 'category') {
                comparison = a.p.category.localeCompare(b.p.category);
            } else if (sortField === 'price') {
                const priceA = parseFloat(a.p.currencies[0] || '0');
                const priceB = parseFloat(b.p.currencies[0] || '0');
                comparison = priceA - priceB;
            } else if (sortField === 'availability') {
                comparison = (a.p.availability ? 1 : 0) - (b.p.availability ? 1 : 0);
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        return sorted;
    }, [filteredProducts, sortField, sortDirection, viewMode, groupByCategory]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
    };

    const totalFiltered = filteredProducts.length;

    const viewToggle = (
        <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 transition ${
                    viewMode === 'grid'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title="Vue grille"
            >
                <IconLayoutGrid size={18} />
            </button>
            <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 transition ${
                    viewMode === 'list'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title="Vue liste"
            >
                <IconLayoutList size={18} />
            </button>
        </div>
    );

    const groupToggle = (
        <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <button
                onClick={() => setGroupByCategory(false)}
                className={`p-1.5 transition ${
                    !groupByCategory
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title="Sans groupement"
            >
                <IconList size={18} />
            </button>
            <button
                onClick={() => setGroupByCategory(true)}
                className={`p-1.5 transition ${
                    groupByCategory
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title="Grouper par catégorie"
            >
                <IconFolders size={18} />
            </button>
        </div>
    );

    const formatPrice = (price: string, currencyIndex = 0) => {
        if (!price || price === '' || price === '0') return '';
        const decimals = currencies[currencyIndex]?.decimals ?? 2;
        const numPrice = parseFloat(price);
        return numPrice.toFixed(decimals);
    };

    const headerControls = (
        <>
            {/* Desktop: all controls in one row */}
            <div className="hidden md:flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {viewToggle}
                {groupToggle}
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
            {/* Mobile: Row 1 - toggles only */}
            <div className="md:hidden flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {groupToggle}
                {viewToggle}
            </div>
        </>
    );

    const mobileSearchRow = (
        <div className="md:hidden pb-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex-1">
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
                    className="pl-7 pr-6 py-1.5 w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none"
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
            {mobileSearchRow}
            {totalFiltered === 0 && hasFilter ? (
                <p className="text-md opacity-60 py-4 text-center">Aucun produit correspondant</p>
            ) : viewMode === 'list' && !groupByCategory ? (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                <th
                                    className="text-center p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-16 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('order')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Ordre
                                        <SortIcon field="order" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-1">
                                        Nom
                                        <SortIcon field="name" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-40 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('category')}
                                >
                                    <div className="flex items-center gap-1">
                                        Catégorie
                                        <SortIcon field="category" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-24 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('price')}
                                >
                                    <div className="flex items-center gap-1">
                                        Prix {currencies[0] ? `(${currencies[0].symbol})` : ''}
                                        <SortIcon field="price" />
                                    </div>
                                </th>
                                <th
                                    className="text-center p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-24 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('availability')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Disponibilité
                                        <SortIcon field="availability" />
                                    </div>
                                </th>
                                {!isReadOnly && <th className="w-24"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedFilteredProducts.map(({ p, i }) => (
                                <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
                                    <td className="p-2 text-center">
                                        <div className="text-sm font-medium">{i + 1}</div>
                                    </td>
                                    <td className="p-2">
                                        {isReadOnly ? (
                                            <div className="text-sm">{p.name}</div>
                                        ) : (
                                            <input
                                                type="text"
                                                value={p.name}
                                                onChange={(e) => handleProductChange(i, { ...p, name: e.target.value })}
                                                maxLength={50}
                                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        )}
                                    </td>
                                    <td className="p-2">
                                        {isReadOnly ? (
                                            <div className="text-sm">{p.category}</div>
                                        ) : (
                                            <SearchableSelect
                                                options={categories}
                                                value={p.category}
                                                onChange={(value) =>
                                                    handleProductChange(i, {
                                                        ...p,
                                                        category: Array.isArray(value) ? value[0] : value,
                                                    })
                                                }
                                                placeholder="Catégorie"
                                                disabled={isReadOnly}
                                            />
                                        )}
                                    </td>
                                    <td className="p-2">
                                        {isReadOnly ? (
                                            <div className="text-sm">{formatPrice(p.currencies[0] ?? '0')}</div>
                                        ) : (
                                            <input
                                                type="number"
                                                value={p.currencies[0] ?? ''}
                                                onChange={(e) => {
                                                    const updated = [...p.currencies];
                                                    updated[0] = e.target.value;
                                                    handleProductChange(i, { ...p, currencies: updated });
                                                }}
                                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        )}
                                    </td>
                                    <td className="p-2 text-center">
                                        {isReadOnly ? (
                                            p.availability ? (
                                                <IconCheck className="inline text-green-500" size={28} stroke={3} />
                                            ) : (
                                                <IconX className="inline text-red-500" size={28} stroke={3} />
                                            )
                                        ) : (
                                            <button
                                                onClick={() =>
                                                    handleProductChange(i, { ...p, availability: !p.availability })
                                                }
                                                className="inline-flex items-center justify-center"
                                            >
                                                {p.availability ? (
                                                    <IconCheck
                                                        className="text-green-500 hover:text-green-600"
                                                        size={28}
                                                        stroke={3}
                                                    />
                                                ) : (
                                                    <IconX
                                                        className="text-red-500 hover:text-red-600"
                                                        size={28}
                                                        stroke={3}
                                                    />
                                                )}
                                            </button>
                                        )}
                                    </td>
                                    {!isReadOnly && (
                                        <td className="p-2 text-center">
                                            <button
                                                onClick={() => handleDeleteProduct(i)}
                                                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 text-sm"
                                            >
                                                Supprimer
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : viewMode === 'list' && groupByCategory ? (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                <th
                                    className="text-center p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-16 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('order')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Ordre
                                        <SortIcon field="order" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-1">
                                        Nom
                                        <SortIcon field="name" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-40 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('category')}
                                >
                                    <div className="flex items-center gap-1">
                                        Catégorie
                                        <SortIcon field="category" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-24 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('price')}
                                >
                                    <div className="flex items-center gap-1">
                                        Prix {currencies[0] ? `(${currencies[0].symbol})` : ''}
                                        <SortIcon field="price" />
                                    </div>
                                </th>
                                <th
                                    className="text-center p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-24 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('availability')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Disponibilité
                                        <SortIcon field="availability" />
                                    </div>
                                </th>
                                {!isReadOnly && <th className="w-24"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {categoryOrder
                                .filter((cat) => categoryGroups[cat] !== undefined)
                                .map((cat) => (
                                    <React.Fragment key={cat}>
                                        <tr
                                            className="bg-gray-100 dark:bg-gray-800 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                                            onClick={() => toggleCategory(cat)}
                                        >
                                            <td colSpan={isReadOnly ? 5 : 6} className="p-2 font-semibold text-sm">
                                                <div className="flex items-center gap-2">
                                                    <svg
                                                        className={`w-4 h-4 transition-transform duration-200 ${expandedCategories.has(cat) ? 'rotate-90' : ''}`}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                    {cat}{' '}
                                                    {availFilter === 'all'
                                                        ? `(${categoryGroups[cat].filter(({ p }) => p.availability).length} / ${categoryGroups[cat].length} produit${categoryGroups[cat].length > 1 ? 's' : ''})`
                                                        : `(${categoryGroups[cat].length} produit${categoryGroups[cat].length > 1 ? 's' : ''})`}
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedCategories.has(cat) &&
                                            categoryGroups[cat].map(({ p, i }) => (
                                                <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
                                                    <td className="p-2 text-center">
                                                        <div className="text-sm font-medium">{i + 1}</div>
                                                    </td>
                                                    <td className="p-2">
                                                        {isReadOnly ? (
                                                            <div className="text-sm">{p.name}</div>
                                                        ) : (
                                                            <input
                                                                type="text"
                                                                value={p.name}
                                                                onChange={(e) =>
                                                                    handleProductChange(i, {
                                                                        ...p,
                                                                        name: e.target.value,
                                                                    })
                                                                }
                                                                maxLength={50}
                                                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="p-2">
                                                        {isReadOnly ? (
                                                            <div className="text-sm">{p.category}</div>
                                                        ) : (
                                                            <SearchableSelect
                                                                options={categories}
                                                                value={p.category}
                                                                onChange={(val) =>
                                                                    handleProductChange(i, {
                                                                        ...p,
                                                                        category: Array.isArray(val) ? val[0] : val,
                                                                    })
                                                                }
                                                                placeholder="Catégorie"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="p-2">
                                                        {isReadOnly ? (
                                                            <div className="text-sm">
                                                                {formatPrice(p.currencies[0] ?? '0')}
                                                            </div>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                value={p.currencies[0] ?? ''}
                                                                onChange={(e) => {
                                                                    const updated = [...p.currencies];
                                                                    updated[0] = e.target.value;
                                                                    handleProductChange(i, {
                                                                        ...p,
                                                                        currencies: updated,
                                                                    });
                                                                }}
                                                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="p-2 text-center">
                                                        {isReadOnly ? (
                                                            p.availability ? (
                                                                <IconCheck
                                                                    className="inline text-green-500"
                                                                    size={32}
                                                                    stroke={3}
                                                                />
                                                            ) : (
                                                                <IconX
                                                                    className="inline text-red-500"
                                                                    size={32}
                                                                    stroke={3}
                                                                />
                                                            )
                                                        ) : (
                                                            <button
                                                                onClick={() =>
                                                                    handleProductChange(i, {
                                                                        ...p,
                                                                        availability: !p.availability,
                                                                    })
                                                                }
                                                                className="inline-flex items-center justify-center"
                                                            >
                                                                {p.availability ? (
                                                                    <IconCheck
                                                                        className="text-green-500 hover:text-green-600"
                                                                        size={32}
                                                                        stroke={3}
                                                                    />
                                                                ) : (
                                                                    <IconX
                                                                        className="text-red-500 hover:text-red-600"
                                                                        size={32}
                                                                        stroke={3}
                                                                    />
                                                                )}
                                                            </button>
                                                        )}
                                                    </td>
                                                    {!isReadOnly && (
                                                        <td className="p-2 text-center">
                                                            <button
                                                                onClick={() => handleDeleteProduct(i)}
                                                                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 text-sm"
                                                            >
                                                                Supprimer
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                    </React.Fragment>
                                ))}
                        </tbody>
                    </table>
                </div>
            ) : groupByCategory ? (
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
                            availFilter={availFilter}
                        />
                    ))
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredProducts.map(({ p, i }) => (
                        <ProductItem
                            key={i}
                            product={p}
                            onChange={(updated) => handleProductChange(i, updated)}
                            onDelete={isReadOnly ? undefined : () => handleDeleteProduct(i)}
                            categories={categories}
                            currencies={currencies}
                            isReadOnly={isReadOnly}
                        />
                    ))}
                </div>
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
