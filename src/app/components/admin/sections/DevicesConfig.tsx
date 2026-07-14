'use client';

import { Device, User } from '@/app/utils/interfaces';
import { adminHeaderStyle } from '@/app/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import SectionCard from '../SectionCard';
import DeleteButtonCell from '../DeleteButtonCell';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';

type SortField = 'label' | 'key' | 'user';
type SortDirection = 'asc' | 'desc' | 'none';

interface DevicesConfigProps {
    config: Device[];
    users: User[];
    onChange: (data: Device[]) => void;
    onSave?: (data: Device[]) => void;
    onCancel?: () => void;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
    onValidation?: (isValid: boolean) => void;
}

interface InternalDevice extends Device {
    _id: number;
}

function Row({
    device,
    users,
    isReadOnly,
    onChange,
    onDelete,
}: {
    device: InternalDevice;
    users: User[];
    isReadOnly: boolean;
    onChange: (device: InternalDevice) => void;
    onDelete: () => void;
}) {
    const validUsers = useMemo(() => users.filter((u) => u.id !== undefined), [users]);
    const singleUser = validUsers.length === 1 ? validUsers[0] : undefined;
    const defaultUserId = singleUser ? singleUser.id : validUsers[0]?.id;
    const userOptions = useMemo(
        () =>
            validUsers.map((user) => ({
                value: String(user.id),
                label: user.name,
            })),
        [validUsers]
    );

    // Ensure a user is always selected when one is available.
    useEffect(() => {
        if (device.userId === undefined && defaultUserId !== undefined) {
            onChange({ ...device, userId: defaultUserId });
        }
    }, [device, defaultUserId, onChange]);

    return (
        <tr className="border-b border-gray-200 dark:border-gray-700">
            <td className="p-2">
                <ValidatedInput
                    value={device.label}
                    onChange={(value) => onChange({ ...device, label: String(value) })}
                    placeholder="Label de l'appareil"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                    className="min-w-40"
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    value={device.key}
                    onChange={(value) => onChange({ ...device, key: String(value) })}
                    placeholder="Clé publique de l'appareil"
                    isReadOnly={isReadOnly}
                    validation={(value) => String(value).trim().length > 0}
                    className="min-w-40"
                />
            </td>
            <td className="p-2">
                <AdminSelect
                    value={device.userId ? String(device.userId) : defaultUserId ? String(defaultUserId) : ''}
                    onChange={(e) => {
                        const value = e.target.value;
                        onChange({ ...device, userId: value ? Number(value) : undefined });
                    }}
                    isReadOnly={isReadOnly || !!singleUser}
                    options={userOptions}
                    className="min-w-40"
                />
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={onDelete} title="Supprimer l'appareil" />
        </tr>
    );
}

export default function DevicesConfig({
    config,
    users,
    onChange,
    onSave,
    onCancel,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
    onValidation,
}: DevicesConfigProps) {
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const [devices, setDevices] = useState<InternalDevice[]>(() =>
        (config || []).map((d) => ({ ...d, _id: nextIdRef.current++ }))
    );
    const [originalConfig, setOriginalConfig] = useState<Device[]>(config || []);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('none');

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        const incoming = config || [];
        setDevices(incoming.map((d) => ({ ...d, _id: nextIdRef.current++ })));
        setOriginalConfig(incoming);
    }, [config]);

    const strip = (items: InternalDevice[]): Device[] => items.map(({ _id: _, ...rest }) => rest);

    const notifyParent = useCallback(
        (items: InternalDevice[]) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                selfUpdateRef.current = true;
                onChange(strip(items));
            }, 300);
        },
        [onChange]
    );

    const hasChanges = JSON.stringify(strip(devices)) !== JSON.stringify(originalConfig);

    const isValid = useMemo(() => {
        return devices.every((device) => device.label?.trim() && device.key?.trim() && device.userId !== undefined);
    }, [devices]);

    const validUsers = useMemo(() => users.filter((u) => u.id !== undefined), [users]);
    const canAddDevice = validUsers.length > 0;

    const sortedDevices = useMemo(() => {
        if (!sortField || sortDirection === 'none') return devices;

        const sorted = [...devices].sort((a, b) => {
            let comparison = 0;
            if (sortField === 'label') {
                comparison = (a.label ?? '').localeCompare(b.label ?? '');
            } else if (sortField === 'key') {
                comparison = (a.key ?? '').localeCompare(b.key ?? '');
            } else if (sortField === 'user') {
                const aUser = users.find((u) => u.id === a.userId);
                const bUser = users.find((u) => u.id === b.userId);
                comparison = (aUser?.name ?? '').localeCompare(bUser?.name ?? '');
            }
            return sortDirection === 'desc' ? -comparison : comparison;
        });

        return sorted;
    }, [devices, sortField, sortDirection, users]);

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

    useEffect(() => {
        onValidation?.(isValid && canAddDevice);
    }, [isValid, canAddDevice, onValidation]);

    const handleDeviceChange = useCallback(
        (id: number, updatedDevice: InternalDevice) => {
            setDevices((prev) => {
                const singleUser = validUsers.length === 1 ? validUsers[0] : undefined;
                const device =
                    singleUser && updatedDevice.userId === undefined
                        ? { ...updatedDevice, userId: singleUser.id }
                        : updatedDevice;
                const updated = prev.map((d) => (d._id === id ? device : d));
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent, validUsers]
    );

    const handleAddDevice = useCallback(async () => {
        let failedKey = '';
        try {
            const response = await fetch('/api/sql/getFailedLoginKey');
            const data = await response.json();
            if (response.ok && data.key) {
                failedKey = String(data.key);
            }
        } catch {
            failedKey = '';
        }

        setDevices((prev) => {
            const newId = nextIdRef.current++;
            const keyToUse = failedKey && !prev.some((d) => d.key === failedKey) ? failedKey : '';
            const userId = validUsers[0]?.id;
            const updated = [...prev, { label: '', key: keyToUse, userId, _id: newId } as InternalDevice];
            notifyParent(updated);
            return updated;
        });
    }, [notifyParent, validUsers]);

    const handleDeleteDevice = useCallback(
        (id: number) => {
            setDevices((prev) => {
                const updated = prev.filter((d) => d._id !== id);
                notifyParent(updated);
                return updated;
            });
        },
        [notifyParent]
    );

    const handleSave = () => {
        onSave?.(strip(devices));
        setOriginalConfig(strip(devices));
    };

    return (
        <SectionCard
            title="Appareils"
            onSave={onSave ? handleSave : undefined}
            onCancel={hasChanges && onCancel ? () => onCancel() : undefined}
            icon={icon}
            saveDisabled={!hasChanges || !isValid || isReadOnly || isLoading}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            onAdd={handleAddDevice}
            isValid={canAddDevice}
            addLabel="Ajouter un appareil"
            isReadOnly={isReadOnly}
        >
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    {sortedDevices.length > 0 && (
                        <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                <th
                                    className={adminHeaderStyle + ' min-w-40 w-40 cursor-pointer'}
                                    onClick={() => handleSort('label')}
                                >
                                    <div className="flex items-center gap-1">
                                        Label <SortIcon field="label" />
                                    </div>
                                </th>
                                <th
                                    className={adminHeaderStyle + ' min-w-40 w-40 cursor-pointer'}
                                    onClick={() => handleSort('key')}
                                >
                                    <div className="flex items-center gap-1">
                                        Clé <SortIcon field="key" />
                                    </div>
                                </th>
                                <th
                                    className={adminHeaderStyle + ' min-w-40 w-40 cursor-pointer'}
                                    onClick={() => handleSort('user')}
                                >
                                    <div className="flex items-center gap-1">
                                        Utilisateur <SortIcon field="user" />
                                    </div>
                                </th>
                                {!isReadOnly && <th className="w-8"></th>}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {sortedDevices.map((device) => (
                            <Row
                                key={device._id}
                                device={device}
                                users={users}
                                isReadOnly={isReadOnly}
                                onChange={(updated) => handleDeviceChange(device._id, updated)}
                                onDelete={() => handleDeleteDevice(device._id)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
            {!canAddDevice && !isReadOnly && (
                <p className="text-sm text-red-500 dark:text-red-400">
                    Vous devez ajouter et enregistrer au moins un utilisateur avant de pouvoir ajouter un appareil.
                </p>
            )}
        </SectionCard>
    );
}
