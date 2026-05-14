'use client';

import { adminSortableHeaderStyle } from '@/app/utils/constants';
import { Category } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePopup } from '@/app/hooks/usePopup';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

type SortField = 'order' | 'label' | 'vat';
type SortDirection = 'asc' | 'desc';

// Internal category with a stable _id for React keys and originalLabel for rename tracking
interface InternalCategory extends Category {
    _id: number;
    _originalLabel: string;
}

// SortableRow is defined outside and memoized to prevent re-creation on every render
interface SortableRowProps {
    category: InternalCategory;
    isReadOnly: boolean;
    isInvalid: boolean;
    vatRates: number[];
    onLabelChange: (id: number, label: string) => void;
    onVatChange: (id: number, vat: number) => void;
    onDelete: (id: number) => void;
    inputRef?: (el: HTMLInputElement | null) => void;
}

const SortableRow = memo(function SortableRow({
    category,
    isReadOnly,
    isInvalid,
    vatRates,
    onLabelChange,
    onVatChange,
    onDelete,
    inputRef,
}: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: category._id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const handleLabelChange = useCallback(
        (value: string | number | boolean) => {
            onLabelChange(category._id, String(value));
        },
        [category._id, onLabelChange]
    );

    const handleVatChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            onVatChange(category._id, parseFloat(e.target.value));
        },
        [category._id, onVatChange]
    );

    const handleDelete = useCallback(() => {
        onDelete(category._id);
    }, [category._id, onDelete]);

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
            <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
            <td className="p-2">
                {isReadOnly ? (
                    <div className="text-sm">{category.label}</div>
                ) : (
                    <ValidatedInput
                        ref={inputRef}
                        type="text"
                        value={category.label}
                        onChange={handleLabelChange}
                        validation={() => !isInvalid}
                        maxLength={50}
                        disabled={isReadOnly}
                    />
                )}
            </td>
            <td className="p-2">
                <AdminSelect
                    value={String(category.vat)}
                    onChange={handleVatChange}
                    options={vatRates.map((rate) => ({ value: String(rate), label: `${rate}%` }))}
                    disabled={isReadOnly}
                />
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={handleDelete} />
        </tr>
    );
});

export default function CategoriesConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    productCategories,
    onDeleteCategoryProducts,
}: {
    config: Category[];
    onChange: (data: Category[]) => void;
    onSave?: (data: Category[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    productCategories?: string[];
    onDeleteCategoryProducts?: (categoryLabel: string, moveToEmpty: boolean) => void;
}) {
    const { openFullscreenPopup } = usePopup();
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [categories, setCategories] = useState<InternalCategory[]>(() =>
        (config || []).map((c) => ({ ...c, _id: nextIdRef.current++, _originalLabel: c.label }))
    );
    const [sortField, setSortField] = useState<SortField>('order');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const sensors = useSensors(useSensor(PointerSensor));
    const vatRates = useMemo(() => [20, 10, 5.5, 2.1, 0], []);

    // Sync from parent config only when the change comes from outside (e.g. cancel or initial load)
    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        const incoming = config || [];
        setCategories(incoming.map((c) => ({ ...c, _id: nextIdRef.current++, _originalLabel: c.label })));
    }, [config]);

    // Strip _id before notifying parent, mark as self-update to avoid useEffect re-sync
    // Debounced to avoid full page re-render on every keystroke
    const notifyParent = useCallback(
        (cats: InternalCategory[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(cats.map(({ _id: _, _originalLabel: __, ...rest }) => rest));
            }, 300);
        },
        [onChange]
    );

    // Compute invalid set: empty labels or duplicate labels
    const invalidIds = useMemo(() => {
        const ids = new Set<number>();
        const labelCount = new Map<string, number[]>();
        for (const cat of categories) {
            const trimmed = cat.label.trim().toLowerCase();
            if (!trimmed) {
                ids.add(cat._id);
            } else {
                const existing = labelCount.get(trimmed) || [];
                existing.push(cat._id);
                labelCount.set(trimmed, existing);
            }
        }
        for (const group of labelCount.values()) {
            if (group.length > 1) {
                for (const id of group) ids.add(id);
            }
        }
        return ids;
    }, [categories]);

    const hasInvalidCategories = invalidIds.size > 0;

    // Handlers use _id for stable identity
    const handleLabelChange = useCallback(
        (id: number, label: string) => {
            setCategories((prev) => {
                const updated = prev.map((c) => (c._id === id ? { ...c, label } : c));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleVatChange = useCallback(
        (id: number, vat: number) => {
            setCategories((prev) => {
                const updated = prev.map((c) => (c._id === id ? { ...c, vat } : c));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddCategory = useCallback(() => {
        setCategories((prev) => {
            const updated = [...prev, { label: '', vat: 20, _id: nextIdRef.current++, _originalLabel: '' }];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent]);

    const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

    const handleDeleteCategory = useCallback(
        (id: number) => {
            const category = categories.find((c) => c._id === id);
            if (!category) return;

            const categoryLabel = category._originalLabel || category.label;
            const hasProducts = productCategories?.includes(categoryLabel);

            if (hasProducts) {
                openFullscreenPopup(
                    `La catégorie "${category.label}" contient des produits`,
                    [
                        'Supprimer tous les produits de la catégorie',
                        'Déplacer les produits sans catégorie',
                        'Renommer la catégorie',
                    ],
                    (index) => {
                        if (index === 0) {
                            // Delete all products in this category
                            onDeleteCategoryProducts?.(categoryLabel, false);
                            setCategories((prev) => {
                                const updated = prev.filter((c) => c._id !== id);
                                notifyParent(updated);
                                return updated;
                            });
                        } else if (index === 1) {
                            // Move products to empty category
                            onDeleteCategoryProducts?.(categoryLabel, true);
                            setCategories((prev) => {
                                const updated = prev.filter((c) => c._id !== id);
                                notifyParent(updated);
                                return updated;
                            });
                        } else if (index === 2) {
                            // Focus on the category name input
                            const input = inputRefs.current.get(id);
                            if (input) {
                                input.focus();
                                input.select();
                            }
                        }
                    }
                );
            } else {
                setCategories((prev) => {
                    const updated = prev.filter((c) => c._id !== id);
                    notifyParent(updated);
                    return updated;
                });
            }
        },
        [categories, notifyParent, productCategories, onDeleteCategoryProducts, openFullscreenPopup]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setCategories((prev) => {
                const oldIdx = prev.findIndex((c) => c._id === active.id);
                const newIdx = prev.findIndex((c) => c._id === over.id);
                if (oldIdx === -1 || newIdx === -1) return prev;
                const reordered = arrayMove(prev, oldIdx, newIdx);
                notifyParent(reordered);
                return reordered;
            });
        },
        [notifyParent]
    );

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
        setSortField((prev) => {
            if (prev === field) {
                setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
                return prev;
            }
            setSortDirection('asc');
            return field;
        });
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
    };

    // Strip _id, keep _originalLabel for rename tracking
    const handleSave = onSave
        ? () => onSave(categories.map(({ _id: _, _originalLabel, ...rest }) => ({ ...rest, _originalLabel })))
        : undefined;

    return (
        <SectionCard
            title="Catégories"
            onSave={isReadOnly || !hasChanges || hasInvalidCategories || !handleSave ? undefined : handleSave}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={categories.map((c) => c._id)} strategy={verticalListSortingStrategy}>
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
                                {sortedCategories.map((category) => (
                                    <SortableRow
                                        key={category._id}
                                        category={category}
                                        isReadOnly={isReadOnly}
                                        isInvalid={invalidIds.has(category._id)}
                                        vatRates={vatRates}
                                        onLabelChange={handleLabelChange}
                                        onVatChange={handleVatChange}
                                        onDelete={handleDeleteCategory}
                                        inputRef={(el) => {
                                            if (el) inputRefs.current.set(category._id, el);
                                            else inputRefs.current.delete(category._id);
                                        }}
                                    />
                                ))}
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
