'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { Role, User } from '@/app/utils/interfaces';
import { ROLE_LABELS } from '@/app/utils/constants';
import { usePopup } from '@/app/hooks/usePopup';
import { useConfig } from '@/app/hooks/useConfig';
import { useIsMobileDevice } from '@/app/utils/mobile';
import { getPopupStyles, getOptionHoverStyles } from '@/app/utils/popupStyles';
import { useVirtualKeyboardContext } from './admin/VirtualKeyboardProvider';
import { deviceFetch } from '@/app/utils/deviceFetch';
import { getUserSession, setUserSession, clearUserSession } from '@/app/utils/userSession';
import { IconArrowLeft, IconLock } from '@tabler/icons-react';

interface UserSwitchPopupProps {
    onSelect: (user: User) => void;
    initialQuery?: string;
    /** Restrict the list to one role (e.g. admin prompt in DeviceGate). */
    roleFilter?: Role;
    /** Restrict the list to users that have a PIN configured. */
    requirePin?: boolean;
}

export const UserSwitchPopup: FC<UserSwitchPopupProps> = ({
    onSelect,
    initialQuery = '',
    roleFilter,
    requirePin = false,
}) => {
    const { users } = useConfig();
    const { closePopup } = usePopup();
    const [query, setQuery] = useState(initialQuery);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [pendingUser, setPendingUser] = useState<User | null>(null);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const pinInputRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const isMobileDevice = useIsMobileDevice();
    const styles = getPopupStyles('default');
    const optionClass = twMerge(styles.option, 'px-3', getOptionHoverStyles(isMobileDevice, true));
    const vkContext = useVirtualKeyboardContext();

    // Refs to keep the virtual keyboard enter handler in sync with the latest
    // highlighted index and filtered users, since the handler closure is
    // captured once at focus time and would otherwise be stale after typing.
    const highlightedIndexRef = useRef(highlightedIndex);
    const filteredUsersRef = useRef(users);

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
        const base = users.filter((user) => (!roleFilter || user.role === roleFilter) && (!requirePin || user.hasPin));
        if (!q) return base;
        const tokens = q.split(/\s+/);
        return base.filter((user) => {
            const searchable = [user.name, user.reference, ROLE_LABELS[user.role]]
                .filter(Boolean)
                .map((value) => value!.toLowerCase());
            return tokens.every((token) => searchable.some((value) => value.includes(token)));
        });
    }, [users, q, roleFilter, requirePin]);

    useEffect(() => {
        setHighlightedIndex(filteredUsers.length > 0 ? 0 : -1);
    }, [filteredUsers.length]);

    // Keep refs in sync so the VK enter handler always sees the latest values
    useEffect(() => {
        filteredUsersRef.current = filteredUsers;
    }, [filteredUsers]);
    useEffect(() => {
        highlightedIndexRef.current = highlightedIndex;
    }, [highlightedIndex]);

    // Switching away from a PIN-verified user drops its session: revoke it
    // server-side (fire-and-forget) then remove the local token.
    const dropCurrentSession = () => {
        if (!getUserSession()) return;
        deviceFetch('/api/sql/logoutUser', { method: 'POST' }).catch(() => {});
        clearUserSession();
    };

    const selectOption = (index: number, usersList = filteredUsers) => {
        const user = usersList[index];
        if (!user) return;
        if (user.hasPin) {
            setPendingUser(user);
            setPin('');
            setPinError(null);
            setTimeout(() => pinInputRef.current?.focus(), 0);
            return;
        }
        dropCurrentSession();
        onSelect(user);
        closePopup();
    };

    const submitPin = async () => {
        if (!pendingUser || verifying || !pin) return;
        setVerifying(true);
        setPinError(null);
        try {
            const response = await deviceFetch('/api/sql/verifyUserPin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: pendingUser.id, pin }),
            });
            if (response.ok) {
                const body = (await response.json()) as { token?: string; expiresAt?: string };
                // Revoke the outgoing user's session before storing the new one.
                dropCurrentSession();
                if (body.token && body.expiresAt && pendingUser.id) {
                    setUserSession({ userId: pendingUser.id, token: body.token, expiresAt: body.expiresAt });
                }
                onSelect(pendingUser);
                closePopup();
                return;
            }
            if (response.status === 429) {
                setPinError('Trop de tentatives, réessayez plus tard.');
            } else {
                setPinError('PIN incorrect.');
            }
            setPin('');
        } catch {
            setPinError('Vérification impossible, réessayez.');
        } finally {
            setVerifying(false);
        }
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

    if (pendingUser) {
        return (
            <div onClick={(e) => e.stopPropagation()} className="p-2">
                <button
                    type="button"
                    onClick={() => setPendingUser(null)}
                    className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-popup-dark dark:hover:text-popup-light cursor-pointer mb-2"
                >
                    <IconArrowLeft size={16} />
                    Retour
                </button>
                <div className="flex items-center gap-2 mb-3 px-1">
                    <IconLock size={18} className="text-gray-500 dark:text-gray-400" />
                    <span className="text-lg font-semibold text-popup-dark dark:text-popup-light">
                        {pendingUser.name}
                    </span>
                </div>
                <input
                    ref={pinInputRef}
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void submitPin();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setPendingUser(null);
                        }
                    }}
                    onFocus={(e) => {
                        if (vkContext) {
                            vkContext.registerInput(e.target, (newValue: string) =>
                                setPin(newValue.replace(/\D/g, '').slice(0, 8))
                            );
                            vkContext.registerEnterHandler(() => void submitPin());
                        }
                    }}
                    onBlur={(e) => {
                        if (vkContext) {
                            vkContext.unregisterInput(e.target);
                            vkContext.registerEnterHandler(null);
                        }
                    }}
                    placeholder="Code PIN"
                    className={twMerge(
                        'w-full px-3 py-2 bg-transparent border-none outline-none focus:outline-none text-xl font-semibold text-center tracking-widest',
                        'text-popup-dark dark:text-popup-light placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400'
                    )}
                    maxLength={8}
                />
                {pinError && <div className="mt-2 text-center text-sm text-error">{pinError}</div>}
                <button
                    type="button"
                    onClick={() => void submitPin()}
                    disabled={verifying || !pin}
                    className="mt-3 w-full py-2 rounded-lg bg-active-light dark:bg-active-dark text-popup-light font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {verifying ? 'Vérification…' : 'Valider'}
                </button>
            </div>
        );
    }

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => {
                    if (vkContext) {
                        vkContext.registerInput(e.target, (newValue: string) => setQuery(newValue));
                        vkContext.registerEnterHandler(() => {
                            const idx = highlightedIndexRef.current;
                            if (idx >= 0) selectOption(idx, filteredUsersRef.current);
                        });
                    }
                }}
                onBlur={(e) => {
                    if (vkContext) {
                        vkContext.unregisterInput(e.target);
                        vkContext.registerEnterHandler(null);
                    }
                }}
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
