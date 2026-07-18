'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { User } from '@/app/utils/interfaces';
import { ROLE_LABELS } from '@/app/utils/constants';
import { usePopup } from '@/app/hooks/usePopup';
import { useConfig } from '@/app/hooks/useConfig';
import { useIsMobileDevice } from '@/app/utils/mobile';
import { getPopupStyles, getOptionHoverStyles } from '@/app/utils/popupStyles';

interface UserSwitchPopupProps {
    onSelect: (user: User) => void;
    initialQuery?: string;
}

export const UserSwitchPopup: FC<UserSwitchPopupProps> = ({ onSelect, initialQuery = '' }) => {
    const { users } = useConfig();
    const { closePopup } = usePopup();
    const [query, setQuery] = useState(initialQuery);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const isMobileDevice = useIsMobileDevice();
    const styles = getPopupStyles('default');
    const optionClass = twMerge(styles.option, 'px-3', getOptionHoverStyles(isMobileDevice, true));

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
            itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [highlightedIndex]);

    const q = query.trim().toLowerCase();

    const filteredUsers = useMemo(() => {
        if (!q) return users;
        const tokens = q.split(/\s+/);
        return users.filter((user) => {
            const searchable = [user.name, user.reference, ROLE_LABELS[user.role]]
                .filter(Boolean)
                .map((value) => value!.toLowerCase());
            return tokens.every((token) => searchable.some((value) => value.includes(token)));
        });
    }, [users, q]);

    useEffect(() => {
        setHighlightedIndex(filteredUsers.length > 0 ? 0 : -1);
    }, [filteredUsers.length]);

    const selectOption = (index: number) => {
        const user = filteredUsers[index];
        if (!user) return;
        onSelect(user);
        closePopup();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (filteredUsers.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev < filteredUsers.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0) selectOption(highlightedIndex);
                break;
            case 'Escape':
                e.preventDefault();
                closePopup();
                break;
        }
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Rechercher un utilisateur..."
                className={twMerge(
                    'w-full px-3 py-2 bg-transparent border-none outline-none focus:outline-none text-xl font-semibold',
                    'text-popup-dark dark:text-popup-light placeholder:font-normal placeholder:text-gray-400'
                )}
                autoFocus
                maxLength={50}
            />
            <div className="max-h-[55vh] overflow-y-auto">
                {filteredUsers.map((user, index) => (
                    <div
                        key={`user-${user.id ?? index}`}
                        ref={(el) => {
                            itemRefs.current[index] = el;
                        }}
                        className={twMerge(
                            optionClass,
                            'flex items-center justify-between',
                            highlightedIndex === index && 'bg-active-light dark:bg-active-dark'
                        )}
                        onClick={() => selectOption(index)}
                    >
                        <div className={twMerge(styles.optionText, 'flex-1 flex items-center justify-between')}>
                            <span>{user.name}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{ROLE_LABELS[user.role]}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
