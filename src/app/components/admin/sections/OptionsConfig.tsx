'use client';

import { adminHeaderStyle } from '@/app/utils/constants';
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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminButton from '../AdminButton';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';
import { getMainCurrencyStep } from '@/app/utils/priceStep';

export interface ProductOption {
    value: string;
    price: number;
}

export interface ProductOptionGroup {
    category: string;
    product: string;
    type: string;
    options: ProductOption[];
}

interface InternalOptionGroup extends ProductOptionGroup {
    _id: number;
}

interface CategoryOption {
    label: string;
    value: string;
}

interface ProductOptionInfo {
    name: string;
    category: string;
}

interface SortableRowProps {
    group: InternalOptionGroup;
    isReadOnly: boolean;
    canDelete: boolean;
    priceStep: number;
    categories: CategoryOption[];
    products: ProductOptionInfo[];
    onCategoryChange: (id: number, category: string) => void;
    onProductChange: (id: number, product: string) => void;
    onTypeChange: (id: number, type: string) => void;
    onOptionsChange: (id: number, options: ProductOption[]) => void;
    onDelete: (id: number) => void;
    typeInputRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
    lastAddedIndexRef: React.MutableRefObject<number | null>;
    index: number;
}

const SortableRow = memo(function SortableRow({
    group,
    isReadOnly,
    canDelete,
    priceStep,
    categories,
    products,
    onCategoryChange,
    onProductChange,
    onTypeChange,
    onOptionsChange,
    onDelete,
    typeInputRefs,
    lastAddedIndexRef,
    index,
}: SortableRowProps) {
    // Filter products by selected category
    const filteredProducts = group.category ? products.filter((p) => p.category === group.category) : [];
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: group._id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const handleAddOption = () => {
        const newOptions = [...group.options, { value: '', price: 0 }];
        onOptionsChange(group._id, newOptions);
    };

    const handleRemoveOption = (index: number) => {
        const newOptions = group.options.filter((_, i) => i !== index);
        onOptionsChange(group._id, newOptions);
    };

    const handleOptionChange = (index: number, field: 'value' | 'price', value: string | number) => {
        const newOptions = group.options.map((opt, i) =>
            i === index ? { ...opt, [field]: field === 'price' ? Number(value) : value } : opt
        );
        onOptionsChange(group._id, newOptions);
    };

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700 align-top">
            <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
            {/* Category Select */}
            <td className="p-2">
                <AdminSelect
                    options={categories}
                    value={group.category}
                    onChange={(e) => onCategoryChange(group._id, e.target.value)}
                    isReadOnly={isReadOnly}
                />
            </td>
            {/* Product Select */}
            <td className="p-2">
                <AdminSelect
                    options={filteredProducts.map((p) => ({ label: p.name, value: p.name }))}
                    value={group.product}
                    onChange={(e) => onProductChange(group._id, e.target.value)}
                    isReadOnly={isReadOnly}
                />
            </td>
            {/* Type Input */}
            <td className="p-2">
                <ValidatedInput
                    type="text"
                    value={group.type}
                    ref={(el) => {
                        if (el) {
                            typeInputRefs.current.set(index, el);
                            if (lastAddedIndexRef.current === index) {
                                el.focus();
                                lastAddedIndexRef.current = null;
                            }
                        } else {
                            typeInputRefs.current.delete(index);
                        }
                    }}
                    onChange={(value) => onTypeChange(group._id, String(value))}
                    placeholder="Type (ex: Scoop, Size, Flavor)"
                    isReadOnly={isReadOnly}
                />
            </td>
            <td className="p-2">
                <div className="space-y-2">
                    {group.options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                            {isReadOnly ? (
                                <>
                                    <span className="text-sm">{option.value}</span>
                                    <span className="text-sm text-gray-500">({option.price}€)</span>
                                </>
                            ) : (
                                <>
                                    <ValidatedInput
                                        type="text"
                                        value={option.value}
                                        onChange={(value) => handleOptionChange(index, 'value', value)}
                                        placeholder="Valeur"
                                        className="flex-1 min-w-0"
                                        isReadOnly={isReadOnly}
                                    />
                                    <ValidatedInput
                                        type="number"
                                        value={option.price}
                                        onChange={(value) => handleOptionChange(index, 'price', value)}
                                        placeholder="Prix"
                                        min={0}
                                        step={priceStep}
                                        className="w-16"
                                        isReadOnly={isReadOnly}
                                    />
                                    {group.options.length > 1 && (
                                        <button
                                            onClick={() => handleRemoveOption(index)}
                                            className="text-red-500 hover:text-red-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            title="Supprimer cette option"
                                        >
                                            ×
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                    {!isReadOnly && (
                        <AdminButton variant="add" onClick={handleAddOption} className="text-xs py-1 px-2 mt-0">
                            + Option
                        </AdminButton>
                    )}
                </div>
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={() => onDelete(group._id)} canDelete={canDelete} />
        </tr>
    );
});

interface CurrencyInfo {
    rate: number;
    decimals: number;
    label?: string;
}

interface OptionsConfigProps {
    config: ProductOptionGroup[];
    categories: CategoryOption[];
    products: ProductOptionInfo[];
    currencies: CurrencyInfo[];
    onChange: (data: ProductOptionGroup[]) => void;
    onSave: (data: ProductOptionGroup[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

export default function OptionsConfig({
    config,
    categories,
    products,
    currencies,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
}: OptionsConfigProps) {
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const lastAddedIndexRef = useRef<number | null>(null);
    const typeInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const [groups, setGroups] = useState<InternalOptionGroup[]>(() =>
        (config || []).map((g) => ({ ...g, _id: nextIdRef.current++ }))
    );

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setGroups((config || []).map((g) => ({ ...g, _id: nextIdRef.current++ })));
    }, [config]);

    const strip = (items: InternalOptionGroup[]): ProductOptionGroup[] => items.map(({ _id: _, ...rest }) => rest);

    // Validate that each option group has at least 2 options with all fields filled
    const isValid = useMemo(() => {
        return groups.every((group) => {
            // Check that type is filled
            if (!group.type || group.type.trim() === '') return false;
            // Check that there are at least 2 options
            if (group.options.length < 2) return false;
            // Check that all options have value and price filled
            return group.options.every((opt) => {
                const hasValue = opt.value && opt.value.trim() !== '';
                const hasPrice = opt.price !== undefined && opt.price !== null && opt.price >= 0;
                return hasValue && hasPrice;
            });
        });
    }, [groups]);

    const notifyParent = useCallback(
        (items: InternalOptionGroup[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(items));
            }, 300);
        },
        [onChange]
    );

    const handleCategoryChange = useCallback(
        (id: number, category: string) => {
            setGroups((prev) => {
                const updated = prev.map((g) => (g._id === id ? { ...g, category, product: '' } : g));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleProductChange = useCallback(
        (id: number, product: string) => {
            setGroups((prev) => {
                const updated = prev.map((g) => (g._id === id ? { ...g, product } : g));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleTypeChange = useCallback(
        (id: number, type: string) => {
            setGroups((prev) => {
                const updated = prev.map((g) => (g._id === id ? { ...g, type } : g));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleOptionsChange = useCallback(
        (id: number, options: ProductOption[]) => {
            setGroups((prev) => {
                const updated = prev.map((g) => (g._id === id ? { ...g, options } : g));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddGroup = useCallback(() => {
        setGroups((prev) => {
            // Get first category and first product from that category as defaults
            const firstCategory = categories[0]?.value || '';
            const firstProduct = firstCategory ? products.find((p) => p.category === firstCategory)?.name || '' : '';
            const updated = [
                ...prev,
                {
                    category: firstCategory,
                    product: firstProduct,
                    type: '',
                    options: [{ value: '', price: 0 }],
                    _id: nextIdRef.current++,
                },
            ];
            lastAddedIndexRef.current = updated.length - 1;
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent, categories, products]);

    const handleDeleteGroup = useCallback(
        (id: number) => {
            setGroups((prev) => {
                const updated = prev.filter((g) => g._id !== id);
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setGroups((prev) => {
                const oldIdx = prev.findIndex((g) => g._id === active.id);
                const newIdx = prev.findIndex((g) => g._id === over.id);
                if (oldIdx === -1 || newIdx === -1) return prev;
                const reordered = arrayMove(prev, oldIdx, newIdx);
                notifyParent(reordered);
                return reordered;
            });
        },
        [notifyParent]
    );

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
                distance: 10,
            },
        })
    );

    // Calculate price step from main currency
    const priceStep = getMainCurrencyStep(currencies);

    return (
        <SectionCard
            title="Options"
            onSave={isReadOnly || !hasChanges ? undefined : () => onSave(strip(groups))}
            saveDisabled={!isValid}
            icon={icon}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            onAdd={handleAddGroup}
            isValid={isValid}
            addLabel="Ajouter un groupe d'options"
            isReadOnly={isReadOnly}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={groups.map((g) => g._id)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            {groups.length > 0 && (
                                <thead>
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        {!isReadOnly && <th className="w-12"></th>}
                                        <th className={adminHeaderStyle + ' min-w-32'}>Catégorie</th>
                                        <th className={adminHeaderStyle + ' min-w-32'}>Produit</th>
                                        <th className={adminHeaderStyle + ' min-w-32'}>Type</th>
                                        <th className={adminHeaderStyle + ' min-w-48'}>Options (Valeur / Prix)</th>
                                        {!isReadOnly && <th className="w-16"></th>}
                                    </tr>
                                </thead>
                            )}
                            <tbody>
                                {groups.map((group, index) => (
                                    <SortableRow
                                        key={group._id}
                                        group={group}
                                        isReadOnly={isReadOnly}
                                        canDelete={groups.length > 0}
                                        priceStep={priceStep}
                                        categories={categories}
                                        products={products}
                                        onCategoryChange={handleCategoryChange}
                                        onProductChange={handleProductChange}
                                        onTypeChange={handleTypeChange}
                                        onOptionsChange={handleOptionsChange}
                                        onDelete={handleDeleteGroup}
                                        typeInputRefs={typeInputRefs}
                                        lastAddedIndexRef={lastAddedIndexRef}
                                        index={index}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>
        </SectionCard>
    );
}
