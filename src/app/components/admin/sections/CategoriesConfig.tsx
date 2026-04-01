'use client';

import { Category } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionCard from '../SectionCard';
import CategoryItem from '../items/CategoryItem';

function SortableCategoryItem({
    id,
    category,
    onChange,
    onDelete,
    readOnly,
}: {
    id: string;
    category: Category;
    onChange: (c: Category) => void;
    onDelete?: () => void;
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
            <CategoryItem
                category={category}
                onChange={onChange}
                onDelete={onDelete}
                readOnly={readOnly}
                dragHandleProps={readOnly ? undefined : { ...attributes, ...listeners }}
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
    const sensors = useSensors(useSensor(PointerSensor));

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

    const itemIds = categories.map((_, i) => String(i));

    return (
        <SectionCard title="Catégories" onSave={onSave ? () => onSave(categories) : undefined}>
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
                                readOnly={isReadOnly}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
            {!isReadOnly && (
                <button
                    onClick={handleAddCategory}
                    className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-sm"
                >
                    Ajouter une catégorie
                </button>
            )}
        </SectionCard>
    );
}
