import { IconGripVertical } from '@tabler/icons-react';

interface DragHandleCellProps {
    isReadOnly: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Allow any dnd-kit attributes
    attributes?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Allow any dnd-kit listeners
    listeners?: any;
}

export default function DragHandleCell({ isReadOnly, attributes, listeners }: DragHandleCellProps) {
    if (isReadOnly) return null;

    return (
        <td className="p-2 text-center cursor-grab active:cursor-grabbing touch-none" {...attributes} {...listeners}>
            <IconGripVertical size={18} className="mx-auto text-gray-400" />
        </td>
    );
}
