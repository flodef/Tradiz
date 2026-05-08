'use client';

import { adminHeaderStyle } from '@/app/utils/constants';
import { Currency } from '@/app/utils/interfaces';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import AdminButton from '../AdminButton';
import DeleteButton from '../DeleteButton';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

export default function CurrenciesConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
}: {
    config: Currency[];
    onChange: (data: Currency[]) => void;
    onSave: (data: Currency[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
}) {
    const [currencies, setCurrencies] = useState(config || []);

    useEffect(() => {
        setCurrencies(config || []);
    }, [config]);

    const handleCurrencyChange = (index: number, updatedCurrency: Currency) => {
        const newCurrencies = [...currencies];
        newCurrencies[index] = updatedCurrency;
        setCurrencies(newCurrencies);
        onChange(newCurrencies);
    };

    const handleAddCurrency = () => {
        const newCurrency: Currency = {
            label: '',
            maxValue: 1000,
            symbol: '',
            decimals: 2,
            rate: 1,
            fee: 0,
        };
        const updated = [...currencies, newCurrency];
        setCurrencies(updated);
        onChange(updated);
    };

    const handleDeleteCurrency = (index: number) => {
        const updated = currencies.filter((_, i) => i !== index);
        setCurrencies(updated);
        onChange(updated);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = currencies.findIndex((_, i) => i === Number(active.id));
        const newIndex = currencies.findIndex((_, i) => i === Number(over.id));
        const reordered = arrayMove(currencies, oldIndex, newIndex);
        setCurrencies(reordered);
        onChange(reordered);
    };

    const sensors = useSensors(useSensor(PointerSensor));

    function SortableRow({ currency, index, isReadOnly }: { currency: Currency; index: number; isReadOnly: boolean }) {
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
                        <div className="text-sm">{currency.label}</div>
                    ) : (
                        <ValidatedInput
                            type="text"
                            value={currency.label}
                            onChange={(value) =>
                                handleCurrencyChange(index, {
                                    ...currency,
                                    label: String(value),
                                })
                            }
                        />
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{currency.symbol}</div>
                    ) : (
                        <ValidatedInput
                            type="text"
                            value={currency.symbol}
                            onChange={(value) =>
                                handleCurrencyChange(index, {
                                    ...currency,
                                    symbol: String(value),
                                })
                            }
                        />
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{currency.maxValue}</div>
                    ) : (
                        <ValidatedInput
                            type="number"
                            value={currency.maxValue}
                            onChange={(value) =>
                                handleCurrencyChange(index, {
                                    ...currency,
                                    maxValue: Number(value),
                                })
                            }
                            min={0}
                        />
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{currency.decimals}</div>
                    ) : (
                        <ValidatedInput
                            type="number"
                            value={currency.decimals}
                            onChange={(value) =>
                                handleCurrencyChange(index, {
                                    ...currency,
                                    decimals: Number(value),
                                })
                            }
                            min={0}
                            max={8}
                        />
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{currency.rate}</div>
                    ) : (
                        <ValidatedInput
                            type="number"
                            value={currency.rate}
                            onChange={(value) =>
                                handleCurrencyChange(index, {
                                    ...currency,
                                    rate: Number(value),
                                })
                            }
                            min={0}
                            step={0.01}
                        />
                    )}
                </td>
                <td className="p-2">
                    {isReadOnly ? (
                        <div className="text-sm">{currency.fee}</div>
                    ) : (
                        <ValidatedInput
                            type="number"
                            value={currency.fee}
                            onChange={(value) =>
                                handleCurrencyChange(index, {
                                    ...currency,
                                    fee: Number(value),
                                })
                            }
                            min={0}
                            step={0.01}
                        />
                    )}
                </td>
                {!isReadOnly && (
                    <td className="p-2 text-center">
                        {currencies.length > 1 && <DeleteButton onClick={() => handleDeleteCurrency(index)} />}
                    </td>
                )}
            </tr>
        );
    }

    return (
        <SectionCard
            title="Devises"
            onSave={isReadOnly || !hasChanges ? undefined : () => onSave(currencies)}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            isLoading={isLoading}
        >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={currencies.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="w-12"></th>}
                                    <th className={adminHeaderStyle + ' min-w-24'}>Label</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Symbole</th>
                                    <th className={adminHeaderStyle + ' min-w-32'}>Max</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Décimales</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Taux</th>
                                    <th className={adminHeaderStyle + ' min-w-24'}>Frais (%)</th>
                                    {!isReadOnly && <th className="w-16"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {currencies.map((currency, index) => (
                                    <SortableRow
                                        key={index}
                                        currency={currency}
                                        index={index}
                                        isReadOnly={isReadOnly}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddCurrency}>
                    Ajouter une devise
                </AdminButton>
            )}
        </SectionCard>
    );
}
