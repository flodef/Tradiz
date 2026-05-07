'use client';

import { Category } from '@/app/utils/interfaces';
import { useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import { IconChevronDown, IconChevronUp, IconGripVertical } from '@tabler/icons-react';
import DeleteButton from '../DeleteButton';

type SortField = 'order' | 'label' | 'vat';
type SortDirection = 'asc' | 'desc';

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
    }, [categories, sortField, sortDirection]);

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

    function SortableRow({ category, index, isReadOnly }: { category: Category; index: number; isReadOnly: boolean }) {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
            id: index,
        });
        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
        };

        return (
            <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
                {!isReadOnly && (
                    <td className="p-2 text-center cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
                        <IconGripVertical size={18} className="mx-auto text-gray-400" />
                    </td>
                )}
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{category.label}</div>
                    ) : (
                        <input
                            type="text"
                            value={category.label}
                            onChange={(e) =>
                                handleCategoryChange(index, {
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
                        <DeleteButton onClick={() => handleDeleteCategory(index)} />
                    </td>
                )}
            </tr>
        );
    }

    return (
        <SectionCard title="Catégories" onSave={onSave ? () => onSave(categories) : undefined}>
            {
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                {!isReadOnly && (
                                    <th className="text-center p-2 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 w-12"></th>
                                )}
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
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={categories.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                                <tbody>
                                    {sortedCategories.map((category) => {
                                        const originalIndex = categories.findIndex((c) => c === category);
                                        return (
                                            <SortableRow
                                                key={originalIndex}
                                                category={category}
                                                index={originalIndex}
                                                isReadOnly={isReadOnly}
                                            />
                                        );
                                    })}
                                </tbody>
                            </SortableContext>
                        </DndContext>
                    </table>
                </div>
            }
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCategory}>
                    Ajouter une catégorie
                </AdminButton>
            )}
        </SectionCard>
    );
}
