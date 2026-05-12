import DeleteButton from './DeleteButton';

interface DeleteButtonCellProps {
    isReadOnly: boolean;
    onDelete: () => void;
    title?: string;
    canDelete?: boolean;
}

export default function DeleteButtonCell({
    isReadOnly,
    onDelete,
    title = 'Supprimer',
    canDelete = true,
}: DeleteButtonCellProps) {
    if (isReadOnly || !canDelete) return null;

    return (
        <td className="p-2 text-center">
            <DeleteButton onClick={onDelete} title={title} />
        </td>
    );
}
