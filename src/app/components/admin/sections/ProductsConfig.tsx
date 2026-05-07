'use client';

import { adminSortableHeaderStyle } from '@/app/utils/constants';
import { Currency } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChevronDown, IconChevronUp, IconGripVertical } from '@tabler/icons-react';
import React, { useEffect, useMemo, useState } from 'react';
import AvailabilityToggle from '../AvailabilityToggle';
import DeleteButton from '../DeleteButton';
import SearchableSelect from '../SearchableSelect';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

type SortField = 'order' | 'name' | 'category' | 'price' | 'availability';
type SortDirection = 'asc' | 'desc';

export interface AdminProduct {
    name: string;
    category: string;
    availability: boolean;
    currencies: string[];
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
            {!isReadOnly && (
                <td className="p-2 text-center">
                    <IconGripVertical
                        size={18}
                        className="mx-auto text-gray-400 cursor-grab"
                        {...attributes}
                        {...listeners}
                    />
                </td>
            )}
            {children}
        </tr>
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
    const [sortField, setSortField] = useState<SortField>('order');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const sensors = useSensors(useSensor(PointerSensor));

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

        return groups;
    }, [filteredProducts, sortField, sortDirection]);

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
        <SectionCard title="Produits" onSave={onSave ? () => onSave(products) : undefined} headerExtra={headerControls}>
            {mobileSearchRow}
            {totalFiltered === 0 && hasFilter ? (
                <p className="text-md opacity-60 py-4 text-center">Aucun produit correspondant</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
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
                                <th
                                    className={adminSortableHeaderStyle + ' min-w-20 w-20'}
                                    onClick={() => handleSort('price')}
                                >
                                    <div className="flex items-center gap-1">
                                        Prix {currencies[0] ? `(${currencies[0].symbol})` : ''}
                                        <SortIcon field="price" />
                                    </div>
                                </th>
                                <th
                                    className={adminSortableHeaderStyle + ' min-w-20 w-20'}
                                    onClick={() => handleSort('availability')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Disponibilité
                                        <SortIcon field="availability" />
                                    </div>
                                </th>
                                {!isReadOnly && <th className="w-8"></th>}
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
                                        {expandedCategories.has(cat) && (
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={handleDragEnd}
                                            >
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
                                                                />
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
                                                                                category: Array.isArray(val)
                                                                                    ? val[0]
                                                                                    : val,
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
                                                                    />
                                                                )}
                                                            </td>
                                                            <td className="p-2 text-center">
                                                                <div className="flex justify-center">
                                                                    <AvailabilityToggle
                                                                        availability={p.availability}
                                                                        isReadOnly={isReadOnly}
                                                                        onChange={(newValue) =>
                                                                            handleProductChange(i, {
                                                                                ...p,
                                                                                availability: newValue,
                                                                            })
                                                                        }
                                                                    />
                                                                </div>
                                                            </td>
                                                            {!isReadOnly && (
                                                                <td className="p-2 text-center">
                                                                    <DeleteButton
                                                                        onClick={() => handleDeleteProduct(i)}
                                                                    />
                                                                </td>
                                                            )}
                                                        </SortableRow>
                                                    ))}
                                                </SortableContext>
                                            </DndContext>
                                        )}
                                    </React.Fragment>
                                ))}
                        </tbody>
                    </table>
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
