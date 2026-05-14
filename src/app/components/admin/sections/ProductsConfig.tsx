'use client';

import { adminSortableHeaderStyle } from '@/app/utils/constants';
import { Currency } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChevronDown, IconChevronUp, IconInfoCircle, IconSelector } from '@tabler/icons-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminSelect from '../AdminSelect';
import AvailabilityToggle from '../AvailabilityToggle';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

type SortField =
    | 'order'
    | 'name'
    | 'category'
    | 'reference'
    | 'price'
    | 'vat'
    | 'stock'
    | 'photo'
    | 'description'
    | 'options'
    | 'availability';
type SortDirection = 'asc' | 'desc' | 'none';

export interface AdminProduct {
    name: string;
    category: string;
    stock: number | null;
    currencies: string[];
    vat?: number;
    reference?: string;
    photo?: string;
    description?: string;
    options?: string;
}

type AvailabilityFilter = 'all' | 'available' | 'unavailable';

function SortableRow({ id, children, isReadOnly }: { id: string; children: React.ReactNode; isReadOnly: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
            <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
            {children}
        </tr>
    );
}

export default function ProductsConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    categories,
    currencies,
    isReadOnly = false,
    isLoading = false,
    productsSettings,
    isOpen,
    onToggle,
}: {
    config: AdminProduct[];
    onChange: (data: AdminProduct[]) => void;
    onSave?: (data: AdminProduct[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    categories: { label: string; value: string }[];
    currencies: Currency[];
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    productsSettings?: {
        useVatPerProduct: boolean;
        useReference: boolean;
        useStock: boolean;
        usePhoto: boolean;
        useDescription: boolean;
        useOptions: boolean;
    };
}) {
    const [products, setProducts] = useState(config || []);
    const [search, setSearch] = useState('');
    const [availFilter, setAvailFilter] = useState<AvailabilityFilter>('all');
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('none');
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const selfUpdateRef = useRef(false);
    const lastAddedIndexRef = useRef<number | null>(null);
    const nameInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const priceInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const focusPriceIndexRef = useRef<number | null>(null);

    const sensors = useSensors(useSensor(PointerSensor));

    const categoryOrder = useMemo(() => {
        // Use categories prop order as the stable base order
        const order = categories.map((c) => c.label);
        // Add any categories from products that aren't in the prop (e.g. "Sans catégorie")
        for (const p of products) {
            const key = p.category || 'Sans catégorie';
            if (!order.includes(key)) order.push(key);
        }
        return order;
    }, [categories, products]);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(categoryOrder));

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
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

    const notifyParent = useCallback(
        (data: AdminProduct[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(data);
            }, 300);
        },
        [onChange]
    );

    const handleProductChange = (index: number, updatedProduct: AdminProduct) => {
        const prev = products[index];
        if (prev && prev.category !== updatedProduct.category) {
            focusPriceIndexRef.current = index;
        }
        const newProducts = [...products];
        newProducts[index] = updatedProduct;
        setProducts(newProducts);
        notifyParent(newProducts);
    };

    const handleDeleteProduct = (index: number) => {
        const newProducts = products.filter((_, i) => i !== index);
        setProducts(newProducts);
        notifyParent(newProducts);
    };

    const handleReorder = (updated: AdminProduct[]) => {
        setProducts(updated);
        notifyParent(updated);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        // Find the category and indices
        const activeCat = Object.keys(categoryGroups).find((cat) =>
            categoryGroups[cat].some(({ i }) => String(i) === activeId)
        );
        const overCat = Object.keys(categoryGroups).find((cat) =>
            categoryGroups[cat].some(({ i }) => String(i) === overId)
        );

        if (!activeCat || !overCat) return;

        // Get all product indices in their original order
        const catProducts = categoryGroups[activeCat];
        const oldIdx = catProducts.findIndex(({ i }) => String(i) === activeId);
        const newIdx = catProducts.findIndex(({ i }) => String(i) === overId);

        // Reorder within category
        const reordered = arrayMove(catProducts, oldIdx, newIdx);

        // Replace this category's items in their original positions
        const catIndices = products
            .map((p, i) => ((p.category || 'Sans catégorie') === activeCat ? i : -1))
            .filter((i) => i !== -1);
        const result = [...products];
        catIndices.forEach((origIdx, slot) => {
            result[origIdx] = reordered[slot].p;
        });
        handleReorder(result);
    };

    const handleAddProduct = (category = 'Sans catégorie') => {
        const newProduct: AdminProduct = { name: '', category, stock: null, currencies: [] };
        const updated = [...products, newProduct];
        lastAddedIndexRef.current = updated.length - 1;
        setProducts(updated);
        notifyParent(updated);
    };

    const hasFilter = !!(search || availFilter !== 'all');

    const filteredProducts = useMemo(() => {
        return products
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => {
                if (availFilter === 'available' && p.stock === 0) return false;
                if (availFilter === 'unavailable' && p.stock !== 0) return false;
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

        // Sort within each category
        Object.keys(groups).forEach((cat) => {
            groups[cat].sort((a, b) => {
                let comparison = 0;
                if (!sortField || sortField === 'category' || sortDirection === 'none') {
                    comparison = a.i - b.i;
                } else if (sortField === 'name') {
                    comparison = a.p.name.localeCompare(b.p.name);
                } else if (sortField === 'reference') {
                    comparison = (a.p.reference ?? '').localeCompare(b.p.reference ?? '');
                } else if (sortField === 'price') {
                    const priceA = parseFloat(a.p.currencies[0] || '0');
                    const priceB = parseFloat(b.p.currencies[0] || '0');
                    comparison = priceA - priceB;
                } else if (sortField === 'vat') {
                    comparison = (a.p.vat ?? 0) - (b.p.vat ?? 0);
                } else if (sortField === 'stock') {
                    const stockA = a.p.stock === null ? Infinity : a.p.stock;
                    const stockB = b.p.stock === null ? Infinity : b.p.stock;
                    comparison = stockA - stockB;
                } else if (sortField === 'photo') {
                    comparison = (a.p.photo ?? '').localeCompare(b.p.photo ?? '');
                } else if (sortField === 'description') {
                    comparison = (a.p.description ?? '').localeCompare(b.p.description ?? '');
                } else if (sortField === 'options') {
                    comparison = (a.p.options ?? '').localeCompare(b.p.options ?? '');
                } else if (sortField === 'availability') {
                    comparison = (a.p.stock === 0 ? 1 : 0) - (b.p.stock === 0 ? 1 : 0); // null = available, 0 = unavailable
                }
                return sortDirection === 'desc' ? -comparison : comparison;
            });
        });

        return groups;
    }, [filteredProducts, sortField, sortDirection]);

    const sortedCategoryOrder = useMemo(() => {
        if (sortField !== 'category' || sortDirection === 'none') return categoryOrder;
        const sorted = [...categoryOrder].sort((a, b) => a.localeCompare(b));
        return sortDirection === 'asc' ? sorted : sorted.reverse();
    }, [categoryOrder, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else if (sortDirection === 'desc') {
                setSortDirection('none');
                setSortField(null);
            }
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <IconSelector size={14} className="opacity-30" />;
        if (sortDirection === 'none') return <IconSelector size={14} className="opacity-30" />;
        return sortDirection === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
    };

    const totalFiltered = filteredProducts.length;

    const duplicateNames = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of products) {
            const key = p.name.trim().toLowerCase();
            if (key) counts[key] = (counts[key] || 0) + 1;
        }
        return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
    }, [products]);

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
        <SectionCard
            title="Produits"
            onSave={isReadOnly || !hasChanges || !onSave ? undefined : () => onSave(products)}
            saveDisabled={duplicateNames.size > 0}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            headerExtra={headerControls}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {mobileSearchRow}
            {totalFiltered === 0 && hasFilter ? (
                <p className="text-md opacity-60 py-4 text-center">Aucun produit correspondant</p>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className="overflow-auto max-h-[calc(100vh-16rem)]">
                        <table className="w-full border-collapse">
                            <thead className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="w-12"></th>}
                                    <th
                                        className={adminSortableHeaderStyle + ' min-w-40'}
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Nom
                                            <SortIcon field="name" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminSortableHeaderStyle + ' min-w-32 w-32'}
                                        onClick={() => handleSort('category')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Catégorie
                                            <SortIcon field="category" />
                                        </div>
                                    </th>
                                    {productsSettings?.useReference && (
                                        <th
                                            className={adminSortableHeaderStyle + ' min-w-24 w-24'}
                                            onClick={() => handleSort('reference')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Référence
                                                <SortIcon field="reference" />
                                            </div>
                                        </th>
                                    )}
                                    <th
                                        className={adminSortableHeaderStyle + ' min-w-20 w-20'}
                                        onClick={() => handleSort('price')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Prix {currencies[0] ? `(${currencies[0].symbol})` : ''}
                                            <SortIcon field="price" />
                                        </div>
                                    </th>
                                    {productsSettings?.useVatPerProduct && (
                                        <th
                                            className={adminSortableHeaderStyle + ' min-w-16 w-16'}
                                            onClick={() => handleSort('vat')}
                                        >
                                            <div className="flex items-center gap-1">
                                                TVA (%)
                                                <SortIcon field="vat" />
                                            </div>
                                        </th>
                                    )}
                                    {productsSettings?.useStock && (
                                        <th
                                            className={adminSortableHeaderStyle + ' min-w-20 w-20'}
                                            onClick={() => handleSort('stock')}
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                Stock
                                                <SortIcon field="stock" />
                                                <span title="Un stock vide signifie un stock infini">
                                                    <IconInfoCircle size={14} className="opacity-50" />
                                                </span>
                                            </div>
                                        </th>
                                    )}
                                    {productsSettings?.usePhoto && (
                                        <th
                                            className={adminSortableHeaderStyle + ' min-w-20 w-20'}
                                            onClick={() => handleSort('photo')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Photo
                                                <SortIcon field="photo" />
                                            </div>
                                        </th>
                                    )}
                                    {productsSettings?.useDescription && (
                                        <th
                                            className={adminSortableHeaderStyle + ' min-w-32 w-32'}
                                            onClick={() => handleSort('description')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Description
                                                <SortIcon field="description" />
                                            </div>
                                        </th>
                                    )}
                                    {productsSettings?.useOptions && (
                                        <th
                                            className={adminSortableHeaderStyle + ' min-w-32 w-32'}
                                            onClick={() => handleSort('options')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Options
                                                <SortIcon field="options" />
                                            </div>
                                        </th>
                                    )}
                                    {!productsSettings?.useStock && (
                                        <th
                                            className={adminSortableHeaderStyle + ' min-w-20 w-20'}
                                            onClick={() => handleSort('availability')}
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                Disponibilité
                                                <SortIcon field="availability" />
                                            </div>
                                        </th>
                                    )}
                                    {!isReadOnly && <th className="w-8"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedCategoryOrder
                                    .filter((cat) => categoryGroups[cat] !== undefined)
                                    .map((cat, catIdx) => (
                                        <React.Fragment key={`${cat}-${catIdx}`}>
                                            <tr
                                                className="bg-gray-100 dark:bg-gray-800 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                                                onClick={() => toggleCategory(cat)}
                                            >
                                                <td
                                                    colSpan={(() => {
                                                        let count = isReadOnly ? 5 : 6; // base: drag + name + category + price + stock/availability + delete
                                                        if (productsSettings?.useReference) count++;
                                                        if (productsSettings?.useVatPerProduct) count++;
                                                        if (productsSettings?.usePhoto) count++;
                                                        if (productsSettings?.useDescription) count++;
                                                        if (productsSettings?.useOptions) count++;
                                                        return count;
                                                    })()}
                                                    className="p-2 font-semibold text-sm"
                                                >
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
                                                            ? `(${categoryGroups[cat].filter(({ p }) => p.stock !== 0).length} / ${categoryGroups[cat].length} produit${categoryGroups[cat].length > 1 ? 's' : ''})`
                                                            : `(${categoryGroups[cat].length} produit${categoryGroups[cat].length > 1 ? 's' : ''})`}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedCategories.has(cat) && (
                                                <SortableContext items={categoryGroups[cat].map(({ i }) => String(i))}>
                                                    {categoryGroups[cat].map(({ p, i }) => (
                                                        <SortableRow key={i} id={String(i)} isReadOnly={isReadOnly}>
                                                            <td className="p-2">
                                                                <ValidatedInput
                                                                    disabled={isReadOnly}
                                                                    type="text"
                                                                    value={p.name}
                                                                    onChange={(value) =>
                                                                        handleProductChange(i, {
                                                                            ...p,
                                                                            name: String(value),
                                                                        })
                                                                    }
                                                                    maxLength={50}
                                                                    validation={(v) =>
                                                                        !duplicateNames.has(
                                                                            String(v).trim().toLowerCase()
                                                                        )
                                                                    }
                                                                    ref={(el) => {
                                                                        if (el) {
                                                                            nameInputRefs.current.set(i, el);
                                                                            if (lastAddedIndexRef.current === i) {
                                                                                el.focus();
                                                                                lastAddedIndexRef.current = null;
                                                                            }
                                                                        } else {
                                                                            nameInputRefs.current.delete(i);
                                                                        }
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="p-2">
                                                                <AdminSelect
                                                                    options={categories}
                                                                    value={p.category}
                                                                    onChange={(e) =>
                                                                        handleProductChange(i, {
                                                                            ...p,
                                                                            category: e.target.value,
                                                                        })
                                                                    }
                                                                    disabled={isReadOnly}
                                                                />
                                                            </td>
                                                            {productsSettings?.useReference && (
                                                                <td className="p-2">
                                                                    <ValidatedInput
                                                                        disabled={isReadOnly}
                                                                        type="text"
                                                                        value={p.reference ?? ''}
                                                                        onChange={(value) =>
                                                                            handleProductChange(i, {
                                                                                ...p,
                                                                                reference: String(value),
                                                                            })
                                                                        }
                                                                        maxLength={50}
                                                                    />
                                                                </td>
                                                            )}
                                                            <td className="p-2">
                                                                {isReadOnly ? (
                                                                    <div className="text-sm">
                                                                        {formatPrice(p.currencies[0] ?? '0')}
                                                                    </div>
                                                                ) : (
                                                                    <ValidatedInput
                                                                        type="number"
                                                                        value={p.currencies[0] ?? ''}
                                                                        onChange={(value) => {
                                                                            const updated = [...p.currencies];
                                                                            updated[0] = String(value);
                                                                            handleProductChange(i, {
                                                                                ...p,
                                                                                currencies: updated,
                                                                            });
                                                                        }}
                                                                        ref={(el) => {
                                                                            if (el) {
                                                                                priceInputRefs.current.set(i, el);
                                                                                if (focusPriceIndexRef.current === i) {
                                                                                    el.focus();
                                                                                    focusPriceIndexRef.current = null;
                                                                                }
                                                                            } else {
                                                                                priceInputRefs.current.delete(i);
                                                                            }
                                                                        }}
                                                                    />
                                                                )}
                                                            </td>
                                                            {productsSettings?.useVatPerProduct && (
                                                                <td className="p-2">
                                                                    {isReadOnly ? (
                                                                        <div className="text-sm text-center">
                                                                            {p.vat ?? 0}%
                                                                        </div>
                                                                    ) : (
                                                                        <ValidatedInput
                                                                            type="number"
                                                                            value={String(p.vat ?? 0)}
                                                                            onChange={(value) =>
                                                                                handleProductChange(i, {
                                                                                    ...p,
                                                                                    vat: Number(value) || 0,
                                                                                })
                                                                            }
                                                                        />
                                                                    )}
                                                                </td>
                                                            )}
                                                            {productsSettings?.useStock && (
                                                                <td className="p-2">
                                                                    {isReadOnly ? (
                                                                        <div className="text-sm text-center">
                                                                            {p.stock === null ? '∞' : p.stock}
                                                                        </div>
                                                                    ) : (
                                                                        <ValidatedInput
                                                                            type="number"
                                                                            value={
                                                                                p.stock === null ? '' : String(p.stock)
                                                                            }
                                                                            onChange={(value) => {
                                                                                handleProductChange(i, {
                                                                                    ...p,
                                                                                    stock:
                                                                                        value === ''
                                                                                            ? null
                                                                                            : Number(value),
                                                                                });
                                                                            }}
                                                                            placeholder="∞"
                                                                        />
                                                                    )}
                                                                </td>
                                                            )}
                                                            {productsSettings?.usePhoto && (
                                                                <td className="p-2">
                                                                    <ValidatedInput
                                                                        disabled={isReadOnly}
                                                                        type="text"
                                                                        value={p.photo ?? ''}
                                                                        onChange={(value) =>
                                                                            handleProductChange(i, {
                                                                                ...p,
                                                                                photo: String(value),
                                                                            })
                                                                        }
                                                                        maxLength={50}
                                                                    />
                                                                </td>
                                                            )}
                                                            {productsSettings?.useDescription && (
                                                                <td className="p-2">
                                                                    <ValidatedInput
                                                                        disabled={isReadOnly}
                                                                        type="text"
                                                                        value={p.description ?? ''}
                                                                        onChange={(value) =>
                                                                            handleProductChange(i, {
                                                                                ...p,
                                                                                description: String(value),
                                                                            })
                                                                        }
                                                                        maxLength={300}
                                                                    />
                                                                </td>
                                                            )}
                                                            {productsSettings?.useOptions && (
                                                                <td className="p-2">
                                                                    <ValidatedInput
                                                                        disabled={isReadOnly}
                                                                        type="text"
                                                                        value={p.options ?? ''}
                                                                        onChange={(value) =>
                                                                            handleProductChange(i, {
                                                                                ...p,
                                                                                options: String(value),
                                                                            })
                                                                        }
                                                                        maxLength={300}
                                                                    />
                                                                </td>
                                                            )}
                                                            {!productsSettings?.useStock && (
                                                                <td className="p-2 text-center">
                                                                    <div className="flex justify-center">
                                                                        <AvailabilityToggle
                                                                            availability={p.stock !== 0}
                                                                            isReadOnly={isReadOnly}
                                                                            onChange={(newValue) =>
                                                                                handleProductChange(i, {
                                                                                    ...p,
                                                                                    stock: newValue ? null : 0,
                                                                                })
                                                                            }
                                                                        />
                                                                    </div>
                                                                </td>
                                                            )}
                                                            <DeleteButtonCell
                                                                isReadOnly={isReadOnly}
                                                                onDelete={() => handleDeleteProduct(i)}
                                                            />
                                                        </SortableRow>
                                                    ))}
                                                </SortableContext>
                                            )}
                                        </React.Fragment>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </DndContext>
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
