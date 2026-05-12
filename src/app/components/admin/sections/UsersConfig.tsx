import { Role, User } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import UserItem from '../items/UserItem';
import AdminButton from '../AdminButton';

export default function UsersConfig({
    config,
    onChange,
    onSave,
    onCancel,
    isReadOnly = false,
    isLoading = false,
}: {
    config: User[];
    onChange: (data: User[]) => void;
    onSave?: (data: User[]) => void;
    onCancel?: () => void;
    isReadOnly?: boolean;
    isLoading?: boolean;
}) {
    const [users, setUsers] = useState(config || []);

    useEffect(() => {
        setUsers(config || []);
    }, [config]);

    const handleUserChange = (index: number, updatedUser: User) => {
        const newUsers = [...users];
        newUsers[index] = updatedUser;
        setUsers(newUsers);
        onChange(newUsers);
    };

    const handleAddUser = () => {
        const newUser: User = {
            key: '',
            name: '',
            role: Role.cashier,
        };
        const updated = [...users, newUser];
        setUsers(updated);
        onChange(updated);
    };

    const handleDeleteUser = (index: number) => {
        const newUsers = users.filter((_, i) => i !== index);
        setUsers(newUsers);
        onChange(newUsers);
    };

    const hasNoUsers = users.length === 0;

    return (
        <SectionCard
            title="Utilisateurs"
            onSave={isReadOnly ? undefined : onSave ? () => onSave(users) : undefined}
            onCancel={onCancel}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {users.map((user, index) => (
                    <UserItem
                        key={index}
                        user={user}
                        onChange={(updatedUser) => handleUserChange(index, updatedUser)}
                        onDelete={() => handleDeleteUser(index)}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddUser}>
                    Ajouter un utilisateur
                </AdminButton>
            )}
        </SectionCard>
    );
}
