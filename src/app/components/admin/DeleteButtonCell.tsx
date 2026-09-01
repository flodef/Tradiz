'use client';

import { IconEdit } from '@tabler/icons-react';
import DeleteButton from './DeleteButton';

interface DeleteButtonCellProps {
    isReadOnly: boolean;
    onDelete?: () => void;
    onEdit?: () => void;
    title?: string;
    canDelete?: boolean;
}

export default function DeleteButtonCell({
    isReadOnly,
    onDelete,
    onEdit,
    title = 'Supprimer',
    canDelete = true,
}: DeleteButtonCellProps) {
    if (isReadOnly || !canDelete) return null;

    return (
        <td className="p-2 text-center">
            {onEdit ? (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-600 cursor-pointer"
                    title="Modifier"
                >
                    <IconEdit size={28} stroke={2} />
                </button>
            ) : (
                onDelete && <DeleteButton onClick={onDelete} title={title} />
            )}
        </td>
    );
}
