import React from 'react';
import ValidatedInput from '../ValidatedInput';
import { Category } from '@/app/utils/interfaces';

interface CategoryItemProps {
    category: Category;
    onChange: (category: Category) => void;
    onDelete?: () => void;
    readOnly?: boolean;
    dragHandleProps?: Record<string, unknown>;
}

export default function CategoryItem({
    category,
    onChange,
    onDelete,
    readOnly = false,
    dragHandleProps,
}: CategoryItemProps) {
    const vatRates = [20, 10, 5.5, 2.1, 0];

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
            <div className="flex justify-end items-center gap-2 mb-1">
                {dragHandleProps && (
                    <span
                        {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
                        className="cursor-grab text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none"
                        title="Déplacer"
                    >
                        ⠿
                    </span>
                )}
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 text-sm"
                    >
                        Supprimer
                    </button>
                )}
            </div>
            <div className="flex gap-3 items-end">
                <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                    <ValidatedInput
                        value={category.label}
                        onChange={(value) => onChange({ ...category, label: String(value) })}
                        placeholder="Label de la catégorie"
                        maxLength={50}
                        disabled={readOnly}
                    />
                </div>
                <div className="w-24 shrink-0">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TVA</label>
                    <select
                        value={Number(category.vat)}
                        onChange={(e) => onChange({ ...category, vat: parseFloat(e.target.value) })}
                        disabled={readOnly}
                        className="w-full px-2 py-2 border rounded-md border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:select-none"
                    >
                        {vatRates.map((rate) => (
                            <option key={rate} value={rate}>
                                {rate}%
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
