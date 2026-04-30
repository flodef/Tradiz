'use client';

import { Category } from '@/app/utils/interfaces';
import { useEffect, useState, useMemo } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionCard from '../SectionCard';
import CategoryItem from '../items/CategoryItem';
import AdminButton from '../AdminButton';
import { IconLayoutGrid, IconLayoutList, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { useLocalStorage } from '@/app/utils/localStorage';

type SortField = 'order' | 'label' | 'vat';
type SortDirection = 'asc' | 'desc';

function SortableCategoryItem({
    id,
    category,
    onChange,
    onDelete,
    isReadOnly,
}: {
    id: string;
    category: Category;
    onChange: (c: Category) => void;
    onDelete?: () => void;
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
            <CategoryItem
                category={category}
                onChange={onChange}
                onDelete={onDelete}
                isReadOnly={isReadOnly}
                dragHandleProps={isReadOnly ? undefined : { ...attributes, ...listeners }}
            />
        </div>
    );
}

export default function CategoriesConfig({
    config,
    onChange,
    onSave,
    isReadOnly = false,
}: {
    config: Category[];
    onChange: (data: Category[]) => void;
    onSave?: (data: Category[]) => void;
    isReadOnly?: boolean;
}) {
    const [categories, setCategories] = useState(config || []);
    const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('categories-view-mode', 'list');
    const [sortField, setSortField] = useState<SortField>('order');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const sensors = useSensors(useSensor(PointerSensor));
    const vatRates = [20, 10, 5.5, 2.1, 0];

    useEffect(() => {
        setCategories(config || []);
    }, [config]);

    const handleCategoryChange = (index: number, updatedCategory: Category) => {
        const newCategories = [...categories];
        newCategories[index] = updatedCategory;
        setCategories(newCategories);
        onChange(newCategories);
    };

    const handleAddCategory = () => {
        const newCategory: Category = { label: '', vat: 20 };
        const updated = [...categories, newCategory];
        setCategories(updated);
        onChange(updated);
    };

    const handleDeleteCategory = (index: number) => {
        const newCategories = categories.filter((_, i) => i !== index);
        setCategories(newCategories);
        onChange(newCategories);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = categories.findIndex((_, i) => String(i) === String(active.id));
        const newIdx = categories.findIndex((_, i) => String(i) === String(over.id));
        const reordered = arrayMove(categories, oldIdx, newIdx);
        setCategories(reordered);
        onChange(reordered);
    };

    const sortedCategories = useMemo(() => {
        if (viewMode !== 'list') return categories;

        const sorted = [...categories];
        sorted.sort((a, b) => {
            let comparison = 0;
            const indexA = categories.indexOf(a);
            const indexB = categories.indexOf(b);

            if (sortField === 'order') {
                comparison = indexA - indexB;
            } else if (sortField === 'label') {
                comparison = a.label.localeCompare(b.label);
            } else if (sortField === 'vat') {
                comparison = a.vat - b.vat;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        return sorted;
    }, [categories, sortField, sortDirection, viewMode]);

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

    const itemIds = categories.map((_, i) => String(i));

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

    return (
        <SectionCard title="Catégories" onSave={onSave ? () => onSave(categories) : undefined} headerExtra={viewToggle}>
            {viewMode === 'list' ? (
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
                                    onClick={() => handleSort('label')}
                                >
                                    <div className="flex items-center gap-1">
                                        Label
                                        <SortIcon field="label" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-24 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => handleSort('vat')}
                                >
                                    <div className="flex items-center gap-1">
                                        TVA
                                        <SortIcon field="vat" />
                                    </div>
                                </th>
                                {!isReadOnly && <th className="w-24"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedCategories.map((category, index) => {
                                const originalIndex = categories.findIndex((c) => c === category);
                                return (
                                    <tr key={originalIndex} className="border-b border-gray-200 dark:border-gray-700">
                                        <td className="p-2 text-center">
                                            <div className="text-sm font-medium">{originalIndex + 1}</div>
                                        </td>
                                        <td className="p-2">
                                            {isReadOnly ? (
                                                <div className="text-sm">{category.label}</div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={category.label}
                                                    onChange={(e) =>
                                                        handleCategoryChange(originalIndex, {
                                                            ...category,
                                                            label: e.target.value,
                                                        })
                                                    }
                                                    maxLength={50}
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            )}
                                        </td>
                                        <td className="p-2">
                                            {isReadOnly ? (
                                                <div className="text-sm">{category.vat}%</div>
                                            ) : (
                                                <select
                                                    value={Number(category.vat)}
                                                    onChange={(e) =>
                                                        handleCategoryChange(index, {
                                                            ...category,
                                                            vat: parseFloat(e.target.value),
                                                        })
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                >
                                                    {vatRates.map((rate) => (
                                                        <option key={rate} value={rate}>
                                                            {rate}%
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                        {!isReadOnly && (
                                            <td className="p-2 text-center">
                                                <button
                                                    onClick={() => handleDeleteCategory(originalIndex)}
                                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 text-sm"
                                                >
                                                    Supprimer
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {categories.map((category, index) => (
                                <SortableCategoryItem
                                    key={index}
                                    id={String(index)}
                                    category={category}
                                    onChange={(updated) => handleCategoryChange(index, updated)}
                                    onDelete={isReadOnly ? undefined : () => handleDeleteCategory(index)}
                                    isReadOnly={isReadOnly}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCategory}>
                    Ajouter une catégorie
                </AdminButton>
            )}
        </SectionCard>
    );
}
