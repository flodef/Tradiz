'use client';

import { adminSortableHeaderStyle } from '@/app/utils/constants';
import { Category } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChevronDown, IconChevronUp, IconGripVertical } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import DeleteButton from '../DeleteButton';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

type SortField = 'order' | 'label' | 'vat';
type SortDirection = 'asc' | 'desc';

export default function CategoriesConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
}: {
    config: Category[];
    onChange: (data: Category[]) => void;
    onSave?: (data: Category[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
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
                        <ValidatedInput
                            type="text"
                            value={category.label}
                            onChange={(value) =>
                                handleCategoryChange(index, {
                                    ...category,
                                    label: String(value),
                                })
                            }
                            maxLength={50}
                            disabled={isReadOnly}
                        />
                    )}
                </td>
                <td className="p-2">
                    <AdminSelect
                        value={String(category.vat)}
                        onChange={(e) =>
                            handleCategoryChange(index, {
                                ...category,
                                vat: parseFloat(e.target.value),
                            })
                        }
                        options={vatRates.map((rate) => ({ value: String(rate), label: `${rate}%` }))}
                        disabled={isReadOnly}
                    />
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
        <SectionCard
            title="Catégories"
            onSave={isReadOnly || !hasChanges || !onSave ? undefined : () => onSave(categories)}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={categories.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="w-12"></th>}
                                    <th
                                        className={adminSortableHeaderStyle + ' min-w-32'}
                                        onClick={() => handleSort('label')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Label
                                            <SortIcon field="label" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminSortableHeaderStyle + ' min-w-20 w-20'}
                                        onClick={() => handleSort('vat')}
                                    >
                                        <div className="flex items-center gap-1">
                                            TVA
                                            <SortIcon field="vat" />
                                        </div>
                                    </th>
                                    {!isReadOnly && <th className="w-16"></th>}
                                </tr>
                            </thead>
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
                        </table>
                    </div>
                </SortableContext>
            </DndContext>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCategory}>
                    Ajouter une catégorie
                </AdminButton>
            )}
        </SectionCard>
    );
}
