'use client';

import { Role, User } from '@/app/utils/interfaces';
import { useEffect, useState, useMemo } from 'react';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import DeleteButton from '../DeleteButton';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';

interface UsersConfigProps {
    config: User[];
    onChange: (data: User[]) => void;
    onSave?: (data: User[]) => void;
    onCancel?: () => void;
    isReadOnly?: boolean;
    isLoading?: boolean;
}

function SortableRow({
    user,
    index,
    isReadOnly,
    onChange,
    onDelete,
}: {
    user: User;
    index: number;
    isReadOnly: boolean;
    onChange: (user: User) => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: index });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const roles = Object.values(Role).filter((role) => role !== Role.admin);

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
            {!isReadOnly && (
                <td className="p-2 w-10">
                    <span
                        {...attributes}
                        {...listeners}
                        className="cursor-grab text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none"
                        title="Déplacer"
                    >
                        <IconGripVertical size={20} />
                    </span>
                </td>
            )}
            <td className="p-2">
                <ValidatedInput
                    value={user.key ?? ''}
                    onChange={(value) => onChange({ ...user, key: String(value) })}
                    placeholder="Clé de l'utilisateur"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={user.name}
                    onChange={(value) => onChange({ ...user, name: String(value) })}
                    placeholder="Nom de l'utilisateur"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={user.role}
                    onChange={(e) => onChange({ ...user, role: e.target.value as Role })}
                    disabled={isReadOnly}
                    options={roles.map((role) => ({ value: role, label: role }))}
                />
            </td>
            {!isReadOnly && (
                <td className="p-2 w-10 text-center">
                    <DeleteButton onClick={onDelete} title="Supprimer l'utilisateur" />
                </td>
            )}
        </tr>
    );
}

export default function UsersConfig({
    config,
    onChange,
    onSave,
    onCancel,
    isReadOnly = false,
    isLoading = false,
}: UsersConfigProps) {
    const [users, setUsers] = useState<User[]>(config || []);
    // Store original config to track changes against (not the live-updating config prop)
    const [originalConfig, setOriginalConfig] = useState<User[]>(config || []);

    // On mount: capture initial state
    useEffect(() => {
        setUsers(config || []);
        setOriginalConfig(config || []);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally only run on mount
    }, []);

    // Listen for external config changes (e.g., when parent confirms cancel and sends back original data)
    // Compare against current users state to detect external changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally only react to config prop changes, not users
    useEffect(() => {
        const configJson = JSON.stringify(config || []);
        const usersJson = JSON.stringify(users);
        if (configJson !== usersJson) {
            const newConfig = config || [];
            setUsers(newConfig);
            setOriginalConfig(newConfig);
        }
    }, [config]);

    // Filter out admin users from display
    const nonAdminUsers = useMemo(() => users.filter((user) => user.role !== Role.admin), [users]);
    const nonAdminOriginal = useMemo(() => originalConfig.filter((user) => user.role !== Role.admin), [originalConfig]);

    const hasChanges = JSON.stringify(nonAdminUsers) !== JSON.stringify(nonAdminOriginal);

    // Check if all non-admin users have valid key and name
    const isValid = useMemo(() => {
        return nonAdminUsers.every((user) => user.key?.trim() && user.name?.trim());
    }, [nonAdminUsers]);

    const handleUserChange = (index: number, updatedUser: User) => {
        // Find the actual index in the full users array (accounting for filtered admin)
        const visibleIndex = nonAdminUsers[index];
        const actualIndex = users.findIndex((u) => u === visibleIndex);
        const newUsers = [...users];
        newUsers[actualIndex] = updatedUser;
        setUsers(newUsers);
        onChange(newUsers);
    };

    const handleAddUser = () => {
        const newUser: User = {
            key: '',
            name: '',
            role: Role.service,
        };
        const updated = [...users, newUser];
        setUsers(updated);
        onChange(updated);
    };

    const handleDeleteUser = (index: number) => {
        // Find the actual index in the full users array (accounting for filtered admin)
        const visibleUser = nonAdminUsers[index];
        const actualIndex = users.findIndex((u) => u === visibleUser);
        const newUsers = users.filter((_, i) => i !== actualIndex);
        setUsers(newUsers);
        onChange(newUsers);
    };

    const handleSave = () => {
        onSave?.(users);
        setOriginalConfig(users); // Update original to current on save
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = Number(active.id);
        const newIndex = Number(over.id);
        // Reorder within the non-admin users, then reconstruct full array
        const reorderedNonAdmin = arrayMove(nonAdminUsers, oldIndex, newIndex);
        const adminUsers = users.filter((user) => user.role === Role.admin);
        const updated = [...adminUsers, ...reorderedNonAdmin];
        setUsers(updated);
        onChange(updated);
    };

    const sensors = useSensors(useSensor(PointerSensor));

    const hasNoUsers = nonAdminUsers.length === 0;

    return (
        <SectionCard
            title="Utilisateurs"
            onSave={onSave ? handleSave : undefined}
            onCancel={hasChanges && onCancel ? () => onCancel() : undefined}
            saveDisabled={!hasChanges || !isValid || isReadOnly || isLoading}
            isLoading={isLoading}
        >
            {hasNoUsers && (
                <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">
                        <strong>Attention :</strong> Aucun utilisateur configuré. L'application peut être accessible par
                        n'importe qui depuis n'importe où. Veuillez ajouter au moins un utilisateur pour sécuriser
                        l'accès.
                    </p>
                </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={users.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-gray-300 dark:border-gray-600">
                                    {!isReadOnly && <th className="p-2 w-10"></th>}
                                    <th className="p-2 text-left">Clé</th>
                                    <th className="p-2 text-left">Nom</th>
                                    <th className="p-2 text-left">Rôle</th>
                                    {!isReadOnly && <th className="p-2 w-10"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {nonAdminUsers.map((user, index) => (
                                    <SortableRow
                                        key={index}
                                        user={user}
                                        index={index}
                                        isReadOnly={isReadOnly}
                                        onChange={(updated) => handleUserChange(index, updated)}
                                        onDelete={() => handleDeleteUser(index)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SortableContext>
            </DndContext>

            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddUser} disabled={!isValid || isLoading}>
                    Ajouter un utilisateur
                </AdminButton>
            )}
        </SectionCard>
    );
}
