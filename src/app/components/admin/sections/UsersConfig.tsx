'use client';

import { Role, User } from '@/app/utils/interfaces';
import { adminHeaderStyle } from '@/app/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SectionCard from '../SectionCard';
import AdminButton from '../AdminButton';
import DeleteButtonCell from '../DeleteButtonCell';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';

interface UsersConfigProps {
    config: User[];
    onChange: (data: User[]) => void;
    onSave?: (data: User[]) => void;
    onCancel?: () => void;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
    onValidation?: (isValid: boolean) => void;
}

interface InternalUser extends User {
    _id: number;
}

function Row({
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
    const roles = Object.values(Role).filter((role) => role !== Role.admin);

    const roleLabels: Record<Role, string> = {
        [Role.cashier]: 'Caisse',
        [Role.service]: 'Service',
        [Role.kitchen]: 'Cuisine',
        [Role.admin]: 'Administrateur',
    };

    return (
        <tr className="border-b border-gray-200 dark:border-gray-700">
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
                <ValidatedInput
                    value={user.reference ?? ''}
                    onChange={(value) => onChange({ ...user, reference: String(value) })}
                    placeholder="Auto-généré"
                    isReadOnly={isReadOnly}
                    className="min-w-32"
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={user.role}
                    onChange={(e) => onChange({ ...user, role: e.target.value as Role })}
                    isReadOnly={isReadOnly}
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
    isOpen,
    onToggle,
    icon,
    onValidation,
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
                // Always include admin users from original config when notifying parent
                const adminUsers = originalConfig.filter((user) => user.role === Role.admin);
                const nonAdminUsers = strip(items.filter((u) => u.role !== Role.admin));
                onChange([...adminUsers, ...nonAdminUsers]);
            }, 300);
        },
        [onChange, originalConfig]
    );

    // Filter out admin users from display
    const nonAdminUsers = useMemo(() => users.filter((user) => user.role !== Role.admin), [users]);
    const nonAdminOriginal = useMemo(() => originalConfig.filter((user) => user.role !== Role.admin), [originalConfig]);

    const hasChanges = JSON.stringify(strip(nonAdminUsers)) !== JSON.stringify(nonAdminOriginal);

    // Check if all non-admin users have valid key and name
    const isValid = useMemo(() => {
        return nonAdminUsers.every((user) => user.key?.trim() && user.name?.trim());
    }, [nonAdminUsers]);

    // Notify parent of validation state
    useEffect(() => {
        onValidation?.(isValid);
    }, [isValid, onValidation]);

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
        // Always include admin users from original config when saving
        const adminUsers = originalConfig.filter((user) => user.role === Role.admin);
        const savedUsers = [...adminUsers, ...strip(users.filter((u) => u.role !== Role.admin))];
        onSave?.(savedUsers);
        setOriginalConfig(savedUsers);
    };

    return (
        <SectionCard
            title="Utilisateurs"
            onSave={onSave ? handleSave : undefined}
            onCancel={hasChanges && onCancel ? () => onCancel() : undefined}
            icon={icon}
            saveDisabled={!hasChanges || !isValid || isReadOnly || isLoading}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    {nonAdminUsers.length > 0 && (
                        <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                <th className={adminHeaderStyle + ' min-w-40 w-40'}>Nom</th>
                                <th className={adminHeaderStyle + ' min-w-40 w-40'}>Clé</th>
                                <th className={adminHeaderStyle + ' min-w-32 w-32'}>Référence</th>
                                <th className={adminHeaderStyle + ' min-w-20 w-20'}>Rôle</th>
                                {!isReadOnly && <th className="w-8"></th>}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {nonAdminUsers.map((user) => (
                            <Row
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

            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddUser} disabled={!isValid || isLoading}>
                    Ajouter un utilisateur
                </AdminButton>
            )}
        </SectionCard>
    );
}
