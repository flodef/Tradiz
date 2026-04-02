import { Role, User } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import UserItem from '../items/UserItem';
import AdminButton from '../AdminButton';

export default function UsersConfig({
    config,
    onChange,
    onSave,
    isReadOnly = false,
}: {
    config: User[];
    onChange: (data: User[]) => void;
    onSave: (data: User[]) => void;
    isReadOnly?: boolean;
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

    return (
        <SectionCard title="Utilisateurs" onSave={isReadOnly ? undefined : () => onSave(users)}>
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
