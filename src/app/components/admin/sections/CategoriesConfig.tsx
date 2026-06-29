'use client';

import { Category } from '@/app/utils/interfaces';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePopup } from '@/app/hooks/usePopup';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';
import { adminHeaderStyle } from '@/app/utils/constants';

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
    productCount: { total: number; available: number };
    onLabelChange: (id: number, label: string) => void;
    onLabelBlur: (id: number) => void;
    onVatChange: (id: number, vat: number) => void;
    onDelete: (id: number) => void;
    inputRef?: (el: HTMLInputElement | null) => void;
}

const SortableRow = memo(function SortableRow({
    category,
    isReadOnly,
    isInvalid,
    vatRates,
    productCount,
    onLabelChange,
    onLabelBlur,
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

    const handleLabelBlur = useCallback(() => {
        onLabelBlur(category._id);
    }, [category._id, onLabelBlur]);

    const handleVatChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onVatChange(category._id, val);
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
                        onBlur={handleLabelBlur}
                        validation={() => !isInvalid}
                        maxLength={50}
                        disabled={isReadOnly}
                    />
                )}
            </td>
            <td className="p-2">
                {category.vat === null ? (
                    <AdminSelect
                        value="divers"
                        onChange={handleVatChange}
                        options={[
                            { value: 'divers', label: 'Divers' },
                            ...vatRates.map((rate) => ({ value: String(rate), label: `${rate}%` })),
                        ]}
                        disabled={isReadOnly}
                    />
                ) : (
                    <AdminSelect
                        value={String(category.vat)}
                        onChange={handleVatChange}
                        options={vatRates.map((rate) => ({ value: String(rate), label: `${rate}%` }))}
                        disabled={isReadOnly}
                    />
                )}
            </td>
            <td className="p-2 text-center text-sm">
                {productCount.available} / {productCount.total}
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={handleDelete} />
        </tr>
    );
});

export default function CategoriesConfig({
    config,
    isReadOnly = false,
    isOpen,
    onToggle,
    productCategories,
    onDeleteCategoryProducts,
    onRenameCategory,
    onCategoryVatChange,
    onReorderCategories,
    onLocalCategoriesChange,
    icon,
}: {
    config: Category[];
    isReadOnly?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    productCategories?: { category: string; available: boolean }[];
    onDeleteCategoryProducts?: (categoryLabel: string, moveToEmpty: boolean) => void;
    onRenameCategory?: (oldLabel: string, newLabel: string) => void;
    onCategoryVatChange?: (categoryLabel: string, vat: number) => void;
    onReorderCategories?: (orderedLabels: string[]) => void;
    onLocalCategoriesChange?: (labels: string[]) => void;
    icon?: React.ReactNode;
}) {
    const { openFullscreenPopup } = usePopup();
    const nextIdRef = useRef(0);
    const [categories, setCategories] = useState<InternalCategory[]>(() =>
        (config || []).map((c) => ({ ...c, _id: nextIdRef.current++, _originalLabel: c.label }))
    );
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
                distance: 10,
            },
        })
    );
    const vatRates = useMemo(() => [20, 10, 5.5, 2.1, 0], []);

    // Compute product count per category: { total, available }
    const productCountMap = useMemo(() => {
        const map = new Map<string, { total: number; available: number }>();
        if (productCategories) {
            for (const { category: cat, available } of productCategories) {
                const entry = map.get(cat) ?? { total: 0, available: 0 };
                entry.total++;
                if (available) entry.available++;
                map.set(cat, entry);
            }
        }
        return map;
    }, [productCategories]);

    // Notify parent whenever local categories change (for new locally-added ones)
    useEffect(() => {
        onLocalCategoriesChange?.(categories.map((c) => c.label).filter(Boolean));
    }, [categories, onLocalCategoriesChange]);

    const handleAddCategory = useCallback(() => {
        const newCat: InternalCategory = {
            label: '',
            vat: 20,
            _id: nextIdRef.current++,
            _originalLabel: '',
        };
        setCategories((prev) => [...prev, newCat]);
    }, []);

    // Sync from parent config (categories derived from products)
    useEffect(() => {
        const incoming = config || [];
        setCategories((prev) => {
            // Preserve existing _id for categories that still exist, assign new _id for new ones
            const result: InternalCategory[] = [];
            for (const c of incoming) {
                const existing = prev.find((p) => p._originalLabel === c.label || p.label === c.label);
                if (existing) {
                    result.push({ ...existing, label: c.label, vat: c.vat, _originalLabel: c.label });
                } else {
                    result.push({ ...c, _id: nextIdRef.current++, _originalLabel: c.label });
                }
            }
            // Preserve locally-added categories not yet linked to any product
            for (const p of prev) {
                if (!p._originalLabel && !result.find((r) => r._id === p._id)) {
                    result.push(p);
                }
            }
            return result;
        });
    }, [config]);

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

    // Handlers use _id for stable identity
    const handleLabelChange = useCallback((id: number, label: string) => {
        setCategories((prev) => prev.map((c) => (c._id === id ? { ...c, label } : c)));
    }, []);

    const handleLabelBlur = useCallback(
        (id: number) => {
            const cat = categories.find((c) => c._id === id);
            if (!cat || !cat._originalLabel || cat._originalLabel === cat.label) return;
            const oldLabel = cat._originalLabel;
            const newLabel = cat.label;
            const hasProducts = productCategories?.some((p) => p.category === oldLabel);
            if (!hasProducts) {
                // No products — just update the label silently
                setCategories((p) => p.map((c) => (c._id === id ? { ...c, _originalLabel: newLabel } : c)));
                return;
            }
            openFullscreenPopup(
                `Renommer "${oldLabel}" en "${newLabel}" pour tous les produits ?`,
                ['Confirmer', 'Annuler'],
                (index) => {
                    if (index === 0) {
                        onRenameCategory?.(oldLabel, newLabel);
                        setCategories((p) => p.map((c) => (c._id === id ? { ...c, _originalLabel: newLabel } : c)));
                    } else {
                        setCategories((p) => p.map((c) => (c._id === id ? { ...c, label: oldLabel } : c)));
                    }
                }
            );
        },
        [categories, productCategories, onRenameCategory, openFullscreenPopup]
    );

    const handleVatChange = useCallback(
        (id: number, vat: number) => {
            const category = categories.find((c) => c._id === id);
            if (!category) return;
            const categoryLabel = category._originalLabel || category.label;
            const hasProducts = productCategories?.some((p) => p.category === categoryLabel);

            if (!hasProducts) {
                // No products — just update the local display silently
                setCategories((prev) => prev.map((c) => (c._id === id ? { ...c, vat } : c)));
                return;
            }

            openFullscreenPopup(
                `Changer la TVA de "${category.label}" à ${vat}%`,
                ['Appliquer à tous les produits de la catégorie', 'Utiliser comme TVA par défaut uniquement'],
                (index) => {
                    if (index === 0) {
                        onCategoryVatChange?.(categoryLabel, vat);
                    }
                    setCategories((prev) => prev.map((c) => (c._id === id ? { ...c, vat } : c)));
                }
            );
        },
        [categories, productCategories, openFullscreenPopup, onCategoryVatChange]
    );

    const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

    const handleDeleteCategory = useCallback(
        (id: number) => {
            const category = categories.find((c) => c._id === id);
            if (!category) return;

            const categoryLabel = category._originalLabel || category.label;
            const hasProducts = productCategories?.some((p) => p.category === categoryLabel);

            if (hasProducts) {
                const isSansCategorie = categoryLabel === 'Sans catégorie';
                const options = isSansCategorie
                    ? ['Supprimer tous les produits de la catégorie', 'Renommer la catégorie']
                    : [
                          'Supprimer tous les produits de la catégorie',
                          'Déplacer les produits sans catégorie',
                          'Renommer la catégorie',
                      ];
                openFullscreenPopup(`La catégorie "${category.label}" contient des produits`, options, (index) => {
                    if (index === 0) {
                        onDeleteCategoryProducts?.(categoryLabel, false);
                    } else if (!isSansCategorie && index === 1) {
                        onDeleteCategoryProducts?.(categoryLabel, true);
                    } else {
                        const input = inputRefs.current.get(id);
                        if (input) {
                            input.focus();
                            input.select();
                        }
                    }
                });
            } else {
                // No products — just remove locally (it will disappear from derived categories)
                setCategories((prev) => prev.filter((c) => c._id !== id));
            }
        },
        [categories, productCategories, onDeleteCategoryProducts, openFullscreenPopup]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const oldIdx = categories.findIndex((c) => c._id === active.id);
            const newIdx = categories.findIndex((c) => c._id === over.id);
            if (oldIdx === -1 || newIdx === -1) return;

            const reordered = arrayMove(categories, oldIdx, newIdx);

            // Apply visually immediately
            setCategories(reordered);

            if (onReorderCategories) {
                openFullscreenPopup(
                    'Réorganiser les catégories',
                    ["Appliquer et sauvegarder l'ordre des produits", 'Annuler'],
                    (index) => {
                        if (index === 0) {
                            onReorderCategories(reordered.map((c) => c._originalLabel || c.label));
                        } else {
                            // Rollback to original order
                            setCategories(categories);
                        }
                    }
                );
            }
        },
        [categories, onReorderCategories, openFullscreenPopup]
    );

    return (
        <SectionCard title="Catégories" isOpen={isOpen} onToggle={onToggle} icon={icon}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={categories.map((c) => c._id)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="w-12"></th>}
                                    <th className={adminHeaderStyle + ' min-w-32'}>Label</th>
                                    <th className={adminHeaderStyle + ' min-w-20 w-20'}>TVA</th>
                                    <th className={adminHeaderStyle + ' min-w-16 w-16'}>Produits</th>
                                    {!isReadOnly && <th className="w-16"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((category) => (
                                    <SortableRow
                                        key={category._id}
                                        category={category}
                                        isReadOnly={isReadOnly}
                                        isInvalid={invalidIds.has(category._id)}
                                        vatRates={vatRates}
                                        productCount={
                                            productCountMap.get(category._originalLabel || category.label) ?? {
                                                total: 0,
                                                available: 0,
                                            }
                                        }
                                        onLabelChange={handleLabelChange}
                                        onLabelBlur={handleLabelBlur}
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
