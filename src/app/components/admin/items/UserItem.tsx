import ValidatedInput from '../ValidatedInput';

interface UserItemProps {
    user: any;
    onChange: (user: any) => void;
    onDelete: () => void;
}

export default function UserItem({
    user,
    onChange,
    onDelete,
}: UserItemProps) {
    const roles = ['Cashier', 'Service', 'Kitchen'];

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4">
            <div className="flex justify-end">
                <button
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600"
                >
                    Supprimer
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clé</label>
                    <ValidatedInput
                        value={user.Key}
                        onChange={(value) => onChange({ ...user, Key: value })}
                        placeholder="Clé de l'utilisateur"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label>
                    <ValidatedInput
                        value={user.Name}
                        onChange={(value) => onChange({ ...user, Name: value })}
                        placeholder="Nom de l'utilisateur"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rôle</label>
                    <select
                        value={user.Role}
                        onChange={(e) => onChange({ ...user, Role: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        {roles.map(role => (
                            <option key={role} value={role}>{role}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
