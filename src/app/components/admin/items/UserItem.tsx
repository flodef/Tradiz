import { Role, User } from '@/app/utils/interfaces';
import AdminSelect from '../AdminSelect';
import ValidatedInput from '../ValidatedInput';

interface UserItemProps {
    user: User;
    onChange: (user: User) => void;
    onDelete: () => void;
    isReadOnly: boolean;
}

export default function UserItem({ user, onChange, onDelete, isReadOnly }: UserItemProps) {
    const roles = Object.values(Role).filter((role) => role !== Role.admin);

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
                    <ValidatedInput
                        label="Clé"
                        value={user.key ?? ''}
                        onChange={(value) => onChange({ ...user, key: String(value) })}
                        placeholder="Clé de l'utilisateur"
                        isReadOnly={isReadOnly}
                    />
                </div>
                <div>
                    <ValidatedInput
                        label="Nom"
                        value={user.name}
                        onChange={(value) => onChange({ ...user, name: String(value) })}
                        placeholder="Nom de l'utilisateur"
                        isReadOnly={isReadOnly}
                    />
                </div>
                <div>
                    <AdminSelect
                        label="Rôle"
                        value={user.role}
                        onChange={(e) => onChange({ ...user, role: e.target.value as Role })}
                        disabled={isReadOnly}
                        options={roles.map((role) => ({ value: role, label: role }))}
                    />
                </div>
            </div>
        </div>
    );
}
