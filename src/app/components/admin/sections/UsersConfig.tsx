'use client';

import { Role, User } from '@/app/utils/interfaces';
import { adminHeaderStyle, ROLE_LABELS } from '@/app/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronDown, IconChevronUp, IconSelector, IconUpload } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { useIsMobile } from '@/app/utils/mobile';
import SectionCard from '../SectionCard';
import DeleteButtonCell from '../DeleteButtonCell';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';
import AdminButton from '../AdminButton';
import { twMerge } from 'tailwind-merge';
import { usePopup } from '@/app/hooks/usePopup';

type SortField = 'name' | 'reference' | 'role';
type SortDirection = 'asc' | 'desc' | 'none';

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
    nameInputRefs,
    lastAddedIdRef,
    index,
}: {
    user: InternalUser;
    isReadOnly: boolean;
    onChange: (user: InternalUser) => void;
    onDelete: () => void;
    nameInputRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
    lastAddedIdRef: React.MutableRefObject<number | null>;
    index: number;
}) {
    const roles = Object.values(Role).filter((role) => role !== Role.admin);

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
                    isNameField
                    ref={(el) => {
                        if (el) {
                            nameInputRefs.current.set(index, el);
                            if (lastAddedIdRef.current === user._id) {
                                el.focus();
                                lastAddedIdRef.current = null;
                            }
                        } else {
                            nameInputRefs.current.delete(index);
                        }
                    }}
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
                    options={roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
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
    const { openFullscreenPopup, closePopup } = usePopup();
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const lastAddedIdRef = useRef<number | null>(null);
    const nameInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const [users, setUsers] = useState<InternalUser[]>(() =>
        (config || []).map((u) => ({ ...u, _id: nextIdRef.current++ }))
    );
    // Store original config to track changes against (not the live-updating config prop)
    const [originalConfig, setOriginalConfig] = useState<User[]>(config || []);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('none');
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Check if all non-admin users have a valid name
    const isValid = useMemo(() => {
        return nonAdminUsers.every((user) => user.name?.trim());
    }, [nonAdminUsers]);

    const sortedUsers = useMemo(() => {
        if (!sortField || sortDirection === 'none') return nonAdminUsers;

        const sorted = [...nonAdminUsers].sort((a, b) => {
            let comparison = 0;
            if (sortField === 'name') {
                comparison = (a.name ?? '').localeCompare(b.name ?? '');
            } else if (sortField === 'reference') {
                comparison = (a.reference ?? '').localeCompare(b.reference ?? '');
            } else if (sortField === 'role') {
                comparison = (a.role ?? '').localeCompare(b.role ?? '');
            }
            return sortDirection === 'desc' ? -comparison : comparison;
        });

        return sorted;
    }, [nonAdminUsers, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else if (sortDirection === 'desc') {
                setSortDirection('none');
                setSortField(null);
            }
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <IconSelector size={14} className="opacity-30" />;
        if (sortDirection === 'none') return <IconSelector size={14} className="opacity-30" />;
        return sortDirection === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const data = event.target?.result;
            if (!data) return;

            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][];

            // Parse data (skip header row)
            const parsedUsers: InternalUser[] = [];
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row.length < 1) continue; // Need at least name

                parsedUsers.push({
                    name: String(row[0] || ''),
                    reference: row[1] ? String(row[1]) : '',
                    role: (row[2] && Object.values(Role).includes(row[2] as Role) ? row[2] : Role.service) as Role,
                    _id: nextIdRef.current++,
                });
            }

            if (parsedUsers.length > 0) {
                openImportConfirmationPopup(parsedUsers);
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const openImportConfirmationPopup = (parsedUsers: InternalUser[]) => {
        const userText = parsedUsers.length === 1 ? 'utilisateur' : 'utilisateurs';
        openFullscreenPopup(
            `Importer ${parsedUsers.length} ${userText} ?`,
            ['Importer'],
            () => {
                closePopup();
                handleImportConfirm(parsedUsers);
            },
            true
        );
    };

    const handleImportConfirm = (parsedUsers: InternalUser[]) => {
        // Remove the last added empty user if it exists
        let usersToUse = users;
        if (lastAddedIdRef.current !== null) {
            const lastAddedUser = users.find((u) => u._id === lastAddedIdRef.current);
            if (lastAddedUser && !lastAddedUser.name) {
                usersToUse = users.filter((u) => u._id !== lastAddedIdRef.current);
                lastAddedIdRef.current = null;
            }
        }

        // Avoid duplicates based on name + reference
        const existingRefs = new Set(usersToUse.map((u) => `${u.name}|${u.reference}`));
        const nonDuplicates = parsedUsers.filter((u) => !existingRefs.has(`${u.name}|${u.reference}`));
        const duplicateCount = parsedUsers.length - nonDuplicates.length;

        const finalUsers = [...usersToUse, ...nonDuplicates];
        setUsers(finalUsers);
        notifyParent(finalUsers);

        // Show popup if there were duplicates
        if (duplicateCount > 0) {
            const userText = duplicateCount === 1 ? 'utilisateur' : 'utilisateurs';
            openFullscreenPopup(
                `${duplicateCount} ${userText} en double n'ont pas été importés`,
                ['OK'],
                () => {
                    closePopup();
                },
                true
            );
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        if (isReadOnly) return;
        // Let normal paste happen when pasting into an editable field
        if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
        const text = e.clipboardData.getData('text');
        if (!text) return;

        const lines = text.split('\n').filter((line) => line.trim());
        if (lines.length === 0) return;

        e.preventDefault();
        const parsedUsers: InternalUser[] = [];
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 1) continue; // Need at least name

            parsedUsers.push({
                name: parts[0] || '',
                reference: parts[1] || '',
                role: (parts[2] && Object.values(Role).includes(parts[2] as Role) ? parts[2] : Role.service) as Role,
                _id: nextIdRef.current++,
            });
        }

        if (parsedUsers.length > 0) {
            openImportConfirmationPopup(parsedUsers);
        }
    };

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
            const newId = nextIdRef.current++;
            const updated = [...prev, { name: '', role: Role.service, _id: newId } as InternalUser];
            lastAddedIdRef.current = newId;
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

    const isMobile = useIsMobile();

    const headerExtra = (
        <div className="flex items-center">
            {!isReadOnly && !hasChanges && (
                <>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                    />
                    <AdminButton
                        variant="add"
                        onClick={() => fileInputRef.current?.click()}
                        className={twMerge(isMobile ? 'px-3 py-1.5' : 'px-3 py-1', 'mt-0')}
                    >
                        {isMobile ? <IconUpload size={24} /> : 'Importer'}
                    </AdminButton>
                </>
            )}
        </div>
    );

    return (
        <div onPaste={handlePaste}>
            <SectionCard
                title="Utilisateurs"
                onSave={onSave ? handleSave : undefined}
                onCancel={hasChanges && onCancel ? () => onCancel() : undefined}
                icon={icon}
                saveDisabled={!hasChanges || !isValid || isReadOnly || isLoading}
                isLoading={isLoading}
                isOpen={isOpen}
                onToggle={onToggle}
                onAdd={handleAddUser}
                isValid={isValid && !isLoading}
                addLabel="Ajouter un utilisateur"
                isReadOnly={isReadOnly}
                headerExtra={headerExtra}
            >
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        {sortedUsers.length > 0 && (
                            <thead>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                    <th
                                        className={adminHeaderStyle + ' min-w-40 w-40 cursor-pointer'}
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Nom <SortIcon field="name" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' min-w-32 w-32 cursor-pointer'}
                                        onClick={() => handleSort('reference')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Référence <SortIcon field="reference" />
                                        </div>
                                    </th>
                                    <th
                                        className={adminHeaderStyle + ' min-w-20 w-20 cursor-pointer'}
                                        onClick={() => handleSort('role')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Rôle <SortIcon field="role" />
                                        </div>
                                    </th>
                                    {!isReadOnly && <th className="w-8"></th>}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {sortedUsers.map((user) => {
                                const actualIndex = users.findIndex((u) => u._id === user._id);
                                return (
                                    <Row
                                        key={user._id}
                                        user={user}
                                        isReadOnly={isReadOnly}
                                        onChange={(updated) => handleUserChange(user._id, updated)}
                                        onDelete={() => handleDeleteUser(user._id)}
                                        nameInputRefs={nameInputRefs}
                                        lastAddedIdRef={lastAddedIdRef}
                                        index={actualIndex}
                                    />
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
}
