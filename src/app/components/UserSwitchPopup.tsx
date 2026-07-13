'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { twMerge } from 'tailwind-merge';
import { User } from '@/app/utils/interfaces';
import { ROLE_LABELS } from '@/app/utils/constants';

interface UserSwitchPopupProps {
    isOpen: boolean;
    users: User[];
    onSelect: (user: User) => void;
    onClose: () => void;
}

export const UserSwitchPopup: FC<UserSwitchPopupProps> = ({ isOpen, users, onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus();
        }
    }, [isOpen]);

    const filteredUsers = useMemo(() => {
        const q = query.toLowerCase();
        return users.filter(
            (user) =>
                user.name.toLowerCase().includes(q) || (user.reference && user.reference.toLowerCase().includes(q))
        );
    }, [users, query]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md bg-popup-light dark:bg-popup-dark rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-light dark:text-dark">Changer d&apos;utilisateur</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        aria-label="Fermer"
                    >
                        <IconX size={24} stroke={2} />
                    </button>
                </div>
                <div className="p-4">
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Rechercher un utilisateur..."
                        className={twMerge(
                            'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent',
                            'text-light dark:text-dark placeholder:text-gray-400 outline-none focus:border-main-light dark:focus:border-main-dark'
                        )}
                    />
                    <div className="mt-4 max-h-[50vh] overflow-y-auto">
                        {filteredUsers.length === 0 ? (
                            <p className="text-center text-gray-400 py-4">Aucun utilisateur trouvé</p>
                        ) : (
                            <ul className="space-y-1">
                                {filteredUsers.map((user, index) => (
                                    <li key={user.id ?? index}>
                                        <button
                                            onClick={() => onSelect(user)}
                                            className={twMerge(
                                                'w-full text-left px-3 py-2 rounded-lg',
                                                'hover:bg-active-light dark:hover:bg-active-dark',
                                                'text-light dark:text-dark'
                                            )}
                                        >
                                            <div className="font-medium">{user.name}</div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                {ROLE_LABELS[user.role]}
                                                {user.reference ? ` · ${user.reference}` : ''}
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
