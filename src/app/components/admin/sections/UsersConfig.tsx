'use client';

import { Role, User } from '@/app/utils/interfaces';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
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

interface InternalUser extends User {
    _id: number;
}

function SortableRow({
    user,
    isReadOnly,
    onChange,
    onDelete,
}: {
    user: InternalUser;
    isReadOnly: boolean;
    onChange: (user: InternalUser) => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: user._id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const roles = Object.values(Role).filter((role) => role !== Role.admin);

    const roleLabels: Record<Role, string> = {
        [Role.cashier]: 'Caisse',
        [Role.service]: 'Service',
        [Role.kitchen]: 'Cuisine',
        [Role.admin]: 'Administrateur',
    };

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
            <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
            <td className="p-2">
                <ValidatedInput
                    value={user.name}
                    onChange={(value) => onChange({ ...user, name: String(value) })}
                    placeholder="Nom de l'utilisateur"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                    className="min-w-40"
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={user.key ?? ''}
                    onChange={(value) => onChange({ ...user, key: String(value) })}
                    placeholder="Clé de l'utilisateur"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                    className="min-w-40"
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={user.role}
                    onChange={(e) => onChange({ ...user, role: e.target.value as Role })}
                    disabled={isReadOnly}
                    options={roles.map((role) => ({ value: role, label: roleLabels[role] }))}
                    className="min-w-20 w-20"
                />
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={onDelete} title="Supprimer l'utilisateur" />
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
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [users, setUsers] = useState<InternalUser[]>(() =>
        (config || []).map((u) => ({ ...u, _id: nextIdRef.current++ }))
    );
    // Store original config to track changes against (not the live-updating config prop)
    const [originalConfig, setOriginalConfig] = useState<User[]>(config || []);

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        const incoming = config || [];
        setUsers(incoming.map((u) => ({ ...u, _id: nextIdRef.current++ })));
        setOriginalConfig(incoming);
    }, [config]);

    const strip = (items: InternalUser[]): User[] => items.map(({ _id: _, ...rest }) => rest);

    const notifyParent = useCallback(
        (items: InternalUser[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(items));
            }, 300);
        },
        [onChange]
    );

    // Filter out admin users from display
    const nonAdminUsers = useMemo(() => users.filter((user) => user.role !== Role.admin), [users]);
    const nonAdminOriginal = useMemo(() => originalConfig.filter((user) => user.role !== Role.admin), [originalConfig]);

    const hasChanges = JSON.stringify(strip(nonAdminUsers)) !== JSON.stringify(nonAdminOriginal);

    // Check if all non-admin users have valid key and name
    const isValid = useMemo(() => {
        return nonAdminUsers.every((user) => user.key?.trim() && user.name?.trim());
    }, [nonAdminUsers]);

    const handleUserChange = useCallback(
        (id: number, updatedUser: InternalUser) => {
            setUsers((prev) => {
                const updated = prev.map((u) => (u._id === id ? updatedUser : u));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleAddUser = useCallback(() => {
        setUsers((prev) => {
            const updated = [
                ...prev,
                { key: '', name: '', role: Role.service, _id: nextIdRef.current++ } as InternalUser,
            ];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent]);

    const handleDeleteUser = useCallback(
        (id: number) => {
            setUsers((prev) => {
                const updated = prev.filter((u) => u._id !== id);
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleSave = () => {
        onSave?.(strip(users));
        setOriginalConfig(strip(users));
    };

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            setUsers((prev) => {
                const nonAdmin = prev.filter((u) => u.role !== Role.admin);
                const oldIdx = nonAdmin.findIndex((u) => u._id === active.id);
                const newIdx = nonAdmin.findIndex((u) => u._id === over.id);
                if (oldIdx === -1 || newIdx === -1) return prev;
                const reorderedNonAdmin = arrayMove(nonAdmin, oldIdx, newIdx);
                const adminUsers = prev.filter((u) => u.role === Role.admin);
                const updated = [...adminUsers, ...reorderedNonAdmin];
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

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
                <SortableContext items={nonAdminUsers.map((u) => u._id)} strategy={verticalListSortingStrategy}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            {nonAdminUsers.length > 0 && (
                                <thead>
                                    <tr className="border-b border-gray-300 dark:border-gray-600">
                                        {!isReadOnly && <th className="p-2 w-10"></th>}
                                        <th className="p-2 text-left">Clé</th>
                                        <th className="p-2 text-left">Nom</th>
                                        <th className="p-2 text-left w-20">Rôle</th>
                                        {!isReadOnly && <th className="p-2 w-10"></th>}
                                    </tr>
                                </thead>
                            )}
                            <tbody>
                                {nonAdminUsers.map((user) => (
                                    <SortableRow
                                        key={user._id}
                                        user={user}
                                        isReadOnly={isReadOnly}
                                        onChange={(updated) => handleUserChange(user._id, updated)}
                                        onDelete={() => handleDeleteUser(user._id)}
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
