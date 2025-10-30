import { Role, User } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import UserItem from '../items/UserItem';

export default function UsersConfig({
    config,
    onChange,
    onSave,
}: {
    config: User[];
    onChange: (data: User[]) => void;
    onSave: (data: User[]) => void;
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
        setUsers([...users, newUser]);
        onChange([...users, newUser]);
    };

    const handleDeleteUser = (index: number) => {
        const newUsers = users.filter((_, i) => i !== index);
        setUsers(newUsers);
        onChange(newUsers);
    };

    return (
        <SectionCard title="Utilisateurs" onSave={() => onSave(users)}>
            {users.map((user, index) => (
                <UserItem
                    key={index}
                    user={user}
                    onChange={(updatedUser) => handleUserChange(index, updatedUser)}
                    onDelete={() => handleDeleteUser(index)}
                />
            ))}
            <button
                onClick={handleAddUser}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter un utilisateur
            </button>
        </SectionCard>
    );
}
