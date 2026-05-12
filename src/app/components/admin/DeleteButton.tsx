import { IconTrash } from '@tabler/icons-react';

interface DeleteButtonProps {
    onClick: () => void;
    title?: string;
}

export default function DeleteButton({ onClick, title = 'Supprimer' }: DeleteButtonProps) {
    return (
        <button
            onClick={onClick}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 cursor-pointer"
            title={title}
        >
            <IconTrash size={28} stroke={2} />
        </button>
    );
}
