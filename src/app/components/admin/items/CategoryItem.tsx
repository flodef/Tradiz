import { adminTextStyle } from '@/app/utils/constants';
import { Category } from '@/app/utils/interfaces';
import React from 'react';
import AdminSelect from '../AdminSelect';
import ValidatedInput from '../ValidatedInput';

interface CategoryItemProps {
    category: Category;
    onChange: (category: Category) => void;
    onDelete?: () => void;
    isReadOnly?: boolean;
    dragHandleProps?: Record<string, unknown>;
}

export default function CategoryItem({
    category,
    onChange,
    onDelete,
    isReadOnly = false,
    dragHandleProps,
}: CategoryItemProps) {
    const vatRates = [20, 10, 5.5, 2.1, 0];

    if (isReadOnly) {
        return (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                <div className="flex gap-3">
                    <div className="flex-1 min-w-0">
                        <label className={adminTextStyle}>Label</label>
                        <div className="text-sm font-medium">{category.label}</div>
                    </div>
                    <div className="w-24 shrink-0">
                        <label className={adminTextStyle}>TVA</label>
                        <div className="text-sm font-medium">{category.vat}%</div>
                    </div>
                </div>
            </div>
        );
    }

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
                    <label className={adminTextStyle}>Label</label>
                    <ValidatedInput
                        value={category.label}
                        onChange={(value) => onChange({ ...category, label: String(value) })}
                        placeholder="Label de la catégorie"
                        maxLength={50}
                        isReadOnly={isReadOnly}
                    />
                </div>
                <div className="w-24 shrink-0">
                    <AdminSelect
                        label="TVA"
                        value={Number(category.vat)}
                        onChange={(value) => onChange({ ...category, vat: parseFloat(String(value)) })}
                        options={vatRates.map((rate) => ({ label: `${rate}%`, value: rate }))}
                        disabled={isReadOnly}
                    />
                </div>
            </div>
        </div>
    );
}
