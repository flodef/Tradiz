'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { IconChevronLeft, IconChevronRight, IconCopy, IconX } from '@tabler/icons-react';
import { AdminProduct } from './ProductsConfig';
import { Currency } from '@/app/utils/interfaces';
import { colorToHex } from '@/app/utils/colors';
import { DEFAULT_CATEGORY } from '@/app/utils/constants';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';
import PriceInput from '../PriceInput';
import ColorSwatchPicker from '../ColorSwatchPicker';
import DeleteButton from '../DeleteButton';

const GRID_COLS = 6;
const GRID_ROWS = 6;
const MAX_PRODUCTS = GRID_COLS * GRID_ROWS;

interface CatalogEditorProps {
    products: AdminProduct[];
    categories: { label: string; value: string }[];
    currencies: Currency[];
    onChange: (data: AdminProduct[]) => void;
    onSave?: (data: AdminProduct[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

interface GridProduct extends AdminProduct {
    _gridId: string;
}

interface SortableTileProps {
    product: GridProduct;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    currencySymbol: string;
}

function TileContent({
    product,
    index,
    currencySymbol,
}: {
    product: GridProduct;
    index: number;
    currencySymbol: string;
}) {
    const price = parseFloat(product.currencies[0] || '0') || 0;

    return (
        <>
            <div
                className="h-15 flex items-center justify-center line-clamp-3 leading-tight hyphens-auto text-center"
                lang="fr"
            >
                {product.name || `#${index + 1}`}
            </div>
            {price > 0 && (
                <div className="h-5 flex items-center justify-end text-sm font-normal leading-none pr-2">
                    {price.toFixed(2)}
                    {currencySymbol}
                </div>
            )}
        </>
    );
}

function SortableTile({ product, index, isSelected, onSelect, currencySymbol }: SortableTileProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useSortable({
        id: product._gridId,
    });
    // No transform/transition — with DragOverlay, tiles stay in place while dragging
    // touch-action: none is critical — without it, touch-screen browsers (especially
    // Windows 10) fire pointercancel when they detect a scroll gesture, aborting the drag.
    const style: React.CSSProperties = {
        opacity: isDragging ? 0 : 1,
        touchAction: 'none',
    };

    const bgColor = colorToHex(product.color);

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={twMerge(
                'relative h-20 flex flex-col text-center font-semibold text-base border-[3px] rounded-2xl select-none cursor-pointer shadow-xl touch-none',
                isSelected ? 'border-blue-500 animate-pulse' : 'border-secondary-light dark:border-secondary-dark',
                bgColor ? 'text-black dark:text-white' : 'hover:bg-active-light dark:hover:bg-active-dark'
            )}
            style={bgColor ? { ...style, backgroundColor: bgColor } : style}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
        >
            <TileContent product={product} index={index} currencySymbol={currencySymbol} />
        </div>
    );
}

function DroppableEmptyTile({ slotIndex }: { slotIndex: number }) {
    const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotIndex}` });
    return (
        <div
            ref={setNodeRef}
            className={twMerge(
                'h-20 border-[3px] border-dashed rounded-2xl transition-colors',
                isOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 opacity-80'
                    : 'border-gray-200 dark:border-gray-700 opacity-50'
            )}
        />
    );
}

export default function CatalogEditor({
    products,
    categories,
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
}: CatalogEditorProps) {
    const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [activeProductId, setActiveProductId] = useState<string | null>(null);
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const [focusCounter, setFocusCounter] = useState(0);
    const categoryBarRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement | null>(null);

    // Track CTRL key state for drag-to-duplicate
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control') setIsCtrlPressed(true);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control') setIsCtrlPressed(false);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    // Only PointerSensor — it handles both mouse and touch via the Pointer Events API.
    // Using TouchSensor alongside PointerSensor causes conflicts on touch-enabled
    // Windows devices (both sensors fire, one cancels the other's drag).
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

    const categoryLabels = useMemo(() => categories.map((c) => c.label), [categories]);

    // Group products by category, preserving array order
    const productsByCategory = useMemo(() => {
        const groups: Record<string, AdminProduct[]> = {};
        for (const cat of categoryLabels) {
            groups[cat] = [];
        }
        for (const p of products) {
            const cat = p.category || DEFAULT_CATEGORY;
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        }
        return groups;
    }, [products, categoryLabels]);

    const currentCategory = categoryLabels[selectedCategoryIndex] ?? categoryLabels[0] ?? DEFAULT_CATEGORY;
    const currentProducts = useMemo(
        () => productsByCategory[currentCategory] ?? [],
        [productsByCategory, currentCategory]
    );

    // Assign grid IDs for dnd-kit
    const gridProducts: GridProduct[] = useMemo(
        () => currentProducts.map((p, i) => ({ ...p, _gridId: `grid-${i}` })),
        [currentProducts]
    );

    // Build the 6×6 grid slots using gridPosition for sparse placement.
    // Products with an explicit gridPosition go to their slot; others fill
    // remaining empty slots in array order.
    const gridSlots = useMemo(() => {
        const slots: (GridProduct | null)[] = new Array(MAX_PRODUCTS).fill(null);
        const unpositioned: GridProduct[] = [];
        for (const p of gridProducts) {
            if (
                p.gridPosition != null &&
                p.gridPosition >= 0 &&
                p.gridPosition < MAX_PRODUCTS &&
                !slots[p.gridPosition]
            ) {
                slots[p.gridPosition] = p;
            } else {
                unpositioned.push(p);
            }
        }
        let fillIdx = 0;
        for (const p of unpositioned) {
            while (fillIdx < MAX_PRODUCTS && slots[fillIdx]) fillIdx++;
            if (fillIdx < MAX_PRODUCTS) {
                slots[fillIdx] = p;
            }
        }
        return slots;
    }, [gridProducts]);

    // The product currently being dragged (for DragOverlay rendering)
    const activeProduct = activeProductId ? gridSlots.find((s) => s?._gridId === activeProductId) ?? null : null;

    const selectedProduct = useMemo(() => {
        if (!selectedProductId) return null;
        return gridProducts.find((p) => p._gridId === selectedProductId) ?? null;
    }, [selectedProductId, gridProducts]);

    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollState = useCallback(() => {
        const el = categoryBarRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        // 4px tolerance so a near-but-not-exact scroll at the end still hides
        // the arrow without the user having to press twice.
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }, []);

    const scrollCategoryBar = useCallback((direction: 'left' | 'right') => {
        const el = categoryBarRef.current;
        if (!el) return;
        const visibleWidth = el.clientWidth;
        const maxScroll = el.scrollWidth - visibleWidth;
        let target: number;
        if (direction === 'right') {
            const remaining = maxScroll - el.scrollLeft;
            // If the remaining distance is one page or less, snap directly to the
            // end with an instant scroll so we don't end up just short due to
            // non-uniform tab widths or smooth-scroll rounding.
            if (remaining <= visibleWidth + 4) {
                el.scrollTo({ left: maxScroll, behavior: 'auto' });
                return;
            }
            target = el.scrollLeft + visibleWidth;
        } else {
            const fromStart = el.scrollLeft;
            if (fromStart <= visibleWidth + 4) {
                el.scrollTo({ left: 0, behavior: 'auto' });
                return;
            }
            target = el.scrollLeft - visibleWidth;
        }
        el.scrollTo({ left: target, behavior: 'smooth' });
    }, []);

    useEffect(() => {
        // Delay to ensure DOM is laid out before measuring scrollWidth
        const raf = requestAnimationFrame(() => updateScrollState());
        return () => cancelAnimationFrame(raf);
    }, [categoryLabels, updateScrollState]);

    // Re-measure on resize
    useEffect(() => {
        const el = categoryBarRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => updateScrollState());
        observer.observe(el);
        return () => observer.disconnect();
    }, [updateScrollState]);

    // Reset selected category if out of bounds
    useEffect(() => {
        if (selectedCategoryIndex >= categoryLabels.length) {
            setSelectedCategoryIndex(0);
        }
    }, [categoryLabels.length, selectedCategoryIndex]);

    // Deselect product when switching categories
    useEffect(() => {
        setSelectedProductId(null);
    }, [selectedCategoryIndex]);

    // Focus the name input when the inline edit panel opens or product changes
    useEffect(() => {
        if (selectedProductId && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [selectedProductId, focusCounter]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveProductId(String(event.active.id));
    }, []);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            setActiveProductId(null);
            if (!over || active.id === over.id) return;

            // Find the dragged product's current slot index in the grid
            const fromSlot = gridSlots.findIndex((s) => s?._gridId === active.id);
            if (fromSlot === -1) return;

            const overId = String(over.id);
            const toSlot = overId.startsWith('slot-')
                ? parseInt(overId.slice(5), 10)
                : gridSlots.findIndex((s) => s?._gridId === overId);

            if (toSlot === -1 || toSlot === fromSlot) return;

            const dragged = gridSlots[fromSlot];
            if (!dragged) return;

            // CTRL-drag: duplicate the product to the target slot (if empty)
            if (isCtrlPressed) {
                const targetSlot = gridSlots[toSlot];
                if (targetSlot) return; // can only duplicate into an empty slot

                const duplicate: AdminProduct = {
                    ...dragged,
                    name: `${dragged.name} (copie)`,
                    reference: undefined, // clear — reference has a unique DB constraint
                    gridPosition: toSlot,
                };
                onChange([...products, duplicate]);
                return;
            }

            // Normal drag: swap or move
            const slotMap = [...gridSlots];
            const target = slotMap[toSlot];
            slotMap[fromSlot] = target; // may be null (empty slot)
            slotMap[toSlot] = dragged;

            // Rebuild the category's products in slot order, assigning gridPosition
            const reorderedCatProducts: AdminProduct[] = [];
            for (let i = 0; i < MAX_PRODUCTS; i++) {
                const p = slotMap[i];
                if (p) {
                    reorderedCatProducts.push({ ...p, gridPosition: i });
                }
            }

            // Rebuild the full products array: replace this category's products in place
            const catIndices = products
                .map((p, i) => ((p.category || DEFAULT_CATEGORY) === currentCategory ? i : -1))
                .filter((i) => i !== -1);

            const result = [...products];
            catIndices.forEach((origIdx, slot) => {
                if (slot < reorderedCatProducts.length) {
                    result[origIdx] = reorderedCatProducts[slot];
                }
            });

            onChange(result);
        },
        [gridSlots, products, currentCategory, onChange, isCtrlPressed]
    );

    const handleProductUpdate = useCallback(
        (updated: AdminProduct) => {
            if (!selectedProduct) return;
            const idx = gridProducts.findIndex((g) => g._gridId === selectedProductId);
            if (idx === -1) return;
            const target = currentProducts[idx];
            const result = products.map((p) => (p === target ? updated : p));
            onChange(result);
        },
        [selectedProduct, selectedProductId, products, currentProducts, gridProducts, onChange]
    );

    const handleAddProduct = useCallback(() => {
        // Find the first empty slot in the current category's grid
        const usedSlots = new Set(
            currentProducts
                .map((p) => p.gridPosition)
                .filter((gp): gp is number => gp != null && gp >= 0 && gp < MAX_PRODUCTS)
        );
        let firstEmpty = 0;
        while (firstEmpty < MAX_PRODUCTS && usedSlots.has(firstEmpty)) firstEmpty++;

        const newProduct: AdminProduct = {
            name: '',
            category: currentCategory,
            stock: null,
            currencies: [],
            gridPosition: firstEmpty < MAX_PRODUCTS ? firstEmpty : undefined,
        };
        onChange([...products, newProduct]);
        // Open the inline edit panel for the new product.
        // The new product will be at index currentProducts.length in gridProducts,
        // so its _gridId will be `grid-${currentProducts.length}`.
        setSelectedProductId(`grid-${currentProducts.length}`);
    }, [currentCategory, currentProducts, products, onChange]);

    const handleDeleteProduct = useCallback(() => {
        if (!selectedProduct) return;
        const idx = gridProducts.findIndex((g) => g._gridId === selectedProductId);
        if (idx === -1) return;
        const catProduct = currentProducts[idx];
        const result = products.filter((p) => p !== catProduct);
        setSelectedProductId(null);
        onChange(result);
    }, [selectedProduct, selectedProductId, gridProducts, currentProducts, products, onChange]);

    const handleDuplicateProduct = useCallback(() => {
        if (!selectedProduct) return;
        // Find the first empty grid slot for the duplicate
        const usedSlots = new Set(
            currentProducts
                .map((p) => p.gridPosition)
                .filter((gp): gp is number => gp != null && gp >= 0 && gp < MAX_PRODUCTS)
        );
        let firstEmpty = 0;
        while (firstEmpty < MAX_PRODUCTS && usedSlots.has(firstEmpty)) firstEmpty++;

        const duplicate: AdminProduct = {
            ...selectedProduct,
            name: `${selectedProduct.name} (copie)`,
            reference: undefined, // clear — reference has a unique DB constraint
            gridPosition: firstEmpty < MAX_PRODUCTS ? firstEmpty : undefined,
        };
        onChange([...products, duplicate]);
        // Select the duplicate — it will be at index currentProducts.length
        setSelectedProductId(`grid-${currentProducts.length}`);
        setFocusCounter((c) => c + 1);
    }, [selectedProduct, currentProducts, products, onChange]);

    const currencySymbol = currencies[0]?.symbol ?? '€';
    const isValid = products.every((p) => p.name?.trim());

    const sortableItems = gridSlots.filter((p): p is GridProduct => p !== null).map((p) => p._gridId);

    return (
        <SectionCard
            title="Catalogue"
            onSave={onSave ? () => onSave(products) : undefined}
            onCancel={onCancel}
            hasChanges={hasChanges}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            icon={icon}
            onAdd={isReadOnly ? undefined : handleAddProduct}
            isValid={isValid}
            addLabel="Ajouter un produit"
            isReadOnly={isReadOnly}
        >
            <div className="flex flex-col gap-4">
                {/* Horizontal category bar */}
                <div className="flex items-center border-b-[3px] border-active-light dark:border-active-dark shrink-0">
                    {canScrollLeft && (
                        <button
                            type="button"
                            onClick={() => scrollCategoryBar('left')}
                            className="shrink-0 p-1 h-11 hover:bg-active-light dark:hover:bg-active-dark text-light dark:text-dark cursor-pointer"
                        >
                            <IconChevronLeft size={24} />
                        </button>
                    )}
                    <div
                        ref={categoryBarRef}
                        onScroll={updateScrollState}
                        className="flex overflow-x-auto border-none scrollbar-none"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {categoryLabels.map((category, index) => (
                            <div
                                key={category}
                                className={twMerge(
                                    'min-w-fit px-4 py-2 font-semibold text-lg text-center cursor-pointer whitespace-nowrap',
                                    'hover:bg-active-light dark:hover:bg-active-dark',
                                    index === selectedCategoryIndex
                                        ? 'bg-active-light dark:bg-active-dark text-popup-dark dark:text-popup-light'
                                        : ''
                                )}
                                onClick={() => setSelectedCategoryIndex(index)}
                            >
                                {category}
                            </div>
                        ))}
                    </div>
                    {canScrollRight && (
                        <button
                            type="button"
                            onClick={() => scrollCategoryBar('right')}
                            className="shrink-0 p-1 h-11 hover:bg-active-light dark:hover:bg-active-dark text-light dark:text-dark cursor-pointer"
                        >
                            <IconChevronRight size={24} />
                        </button>
                    )}
                </div>

                <div className="flex gap-4" onClick={() => setSelectedProductId(null)}>
                    {/* 6×6 product grid */}
                    <div className="flex-1">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
                                <div className="grid grid-cols-6 auto-rows-20 gap-1 p-1 touch-none">
                                    {gridSlots.map((product, index) => {
                                        if (!product) {
                                            return <DroppableEmptyTile key={`empty-${index}`} slotIndex={index} />;
                                        }
                                        return (
                                            <SortableTile
                                                key={product._gridId}
                                                product={product}
                                                index={index}
                                                isSelected={selectedProductId === product._gridId}
                                                onSelect={() =>
                                                    setSelectedProductId(
                                                        selectedProductId === product._gridId ? null : product._gridId
                                                    )
                                                }
                                                currencySymbol={currencySymbol}
                                            />
                                        );
                                    })}
                                </div>
                            </SortableContext>
                            <DragOverlay dropAnimation={null}>
                                {activeProduct ? (
                                    <div
                                        className={twMerge(
                                            'relative h-20 flex flex-col text-center font-semibold text-base border-[3px] rounded-2xl select-none cursor-pointer shadow-2xl rotate-2 scale-105',
                                            isCtrlPressed ? 'border-green-500' : 'border-blue-500',
                                            activeProduct.color ? 'text-black dark:text-white' : ''
                                        )}
                                        style={
                                            activeProduct.color
                                                ? { backgroundColor: colorToHex(activeProduct.color) }
                                                : undefined
                                        }
                                    >
                                        {isCtrlPressed && (
                                            <div className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg">
                                                <IconCopy size={14} />
                                            </div>
                                        )}
                                        <TileContent
                                            product={activeProduct}
                                            index={gridSlots.findIndex((s) => s?._gridId === activeProduct._gridId)}
                                            currencySymbol={currencySymbol}
                                        />
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </div>

                    {/* Inline edit panel */}
                    {selectedProduct && !isReadOnly && (
                        <div
                            className="w-64 shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-white dark:bg-gray-800 overflow-visible"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">Édition produit</h3>
                                <button
                                    onClick={() => setSelectedProductId(null)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                                >
                                    <IconX size={28} />
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Nom
                                </label>
                                <ValidatedInput
                                    type="text"
                                    value={selectedProduct.name}
                                    onChange={(value) =>
                                        handleProductUpdate({ ...selectedProduct, name: String(value) })
                                    }
                                    placeholder="Nom du produit"
                                    maxLength={50}
                                    isReadOnly={isReadOnly}
                                    ref={(el) => {
                                        nameInputRef.current = el;
                                    }}
                                />
                            </div>

                            <div>
                                <PriceInput
                                    value={selectedProduct.currencies[0] ?? '0'}
                                    onChange={(value) => {
                                        const updated = [...selectedProduct.currencies];
                                        updated[0] = String(value);
                                        handleProductUpdate({ ...selectedProduct, currencies: updated });
                                    }}
                                    currencies={currencies}
                                    isReadOnly={isReadOnly}
                                    label={`Prix (en ${currencySymbol})`}
                                />
                            </div>

                            <div className="flex items-end justify-between overflow-visible">
                                <div className="shrink-0">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        Couleur
                                    </label>
                                    <ColorSwatchPicker
                                        color={selectedProduct.color ?? ''}
                                        onChange={(color) => handleProductUpdate({ ...selectedProduct, color })}
                                        isReadOnly={isReadOnly}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleDuplicateProduct}
                                        className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer p-1"
                                        title="Dupliquer le produit"
                                    >
                                        <IconCopy size={22} />
                                    </button>
                                    <DeleteButton onClick={handleDeleteProduct} title="Supprimer le produit" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {currentProducts.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                        Aucun produit dans cette catégorie. Cliquez sur « Ajouter un produit » pour commencer.
                    </div>
                )}
            </div>
        </SectionCard>
    );
}
