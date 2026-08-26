'use client';

import { Device, User } from '@/app/utils/interfaces';
import { adminHeaderStyle } from '@/app/utils/constants';
import { getPublicKey } from '@/app/utils/processData';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronDown, IconChevronUp, IconDeviceTv, IconSelector } from '@tabler/icons-react';
import SectionCard from '../SectionCard';
import DeleteButtonCell from '../DeleteButtonCell';
import ValidatedInput from '../ValidatedInput';
import AdminSelect from '../AdminSelect';

const COMMON_BAUD_RATES = [4800, 9600, 19200, 38400, 57600, 115200, 2400];

const BAUD_OPTIONS = COMMON_BAUD_RATES.map((rate) => ({ label: String(rate), value: rate }));

type SortField = 'label' | 'key' | 'user';
type SortDirection = 'asc' | 'desc' | 'none';

interface DevicesConfigProps {
    config: Device[];
    users: User[];
    onChange: (data: Device[]) => void;
    onSave?: (data: Device[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
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

function comPortOptions(availableComPorts: number[], currentValue?: string | null) {
    const usedNums = availableComPorts;
    const options = usedNums.map((p) => ({ label: `COM${p}`, value: `COM${p}` }));
    if (currentValue && !options.some((o) => o.value === currentValue)) {
        options.push({ label: currentValue, value: currentValue });
    }
    options.push({ label: '—', value: '' });
    return options;
}

function Row({
    device,
    users,
    isReadOnly,
    onChange,
    onDelete,
    availableComPorts,
}: {
    device: InternalDevice;
    users: User[];
    isReadOnly: boolean;
    onChange: (device: InternalDevice) => void;
    onDelete: () => void;
    availableComPorts: number[];
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
            <td className="p-2">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                        <AdminSelect
                            value={device.backscreenCom ?? ''}
                            onChange={(e) =>
                                onChange({
                                    ...device,
                                    backscreenCom: e.target.value || null,
                                    backscreenBaud: e.target.value ? device.backscreenBaud ?? 9600 : null,
                                })
                            }
                            isReadOnly={isReadOnly}
                            options={comPortOptions(availableComPorts, device.backscreenCom)}
                            className="w-20"
                        />
                        {device.backscreenCom && !isReadOnly && device.key === getPublicKey() && (
                            <button
                                type="button"
                                title="Tester l'écran client"
                                onClick={() =>
                                    window.electronAPI?.testDisplay?.({
                                        port: device.backscreenCom!,
                                        baud: device.backscreenBaud ?? 9600,
                                    })
                                }
                                className="shrink-0 p-1 text-gray-600 dark:text-gray-300 hover:text-active-light dark:hover:text-active-dark"
                            >
                                <IconDeviceTv size={18} />
                            </button>
                        )}
                    </div>
                    {device.backscreenCom && (
                        <AdminSelect
                            value={device.backscreenBaud ?? 9600}
                            onChange={(e) => onChange({ ...device, backscreenBaud: Number(e.target.value) })}
                            isReadOnly={isReadOnly}
                            options={BAUD_OPTIONS}
                            className="w-20"
                        />
                    )}
                </div>
            </td>
            <td className="p-2">
                <div className="flex flex-col gap-1">
                    <AdminSelect
                        value={device.printerCom ?? ''}
                        onChange={(e) =>
                            onChange({
                                ...device,
                                printerCom: e.target.value || null,
                                printerBaud: e.target.value ? device.printerBaud ?? 9600 : null,
                            })
                        }
                        isReadOnly={isReadOnly}
                        options={comPortOptions(availableComPorts, device.printerCom)}
                        className="w-24"
                    />
                    {device.printerCom && (
                        <AdminSelect
                            value={device.printerBaud ?? 9600}
                            onChange={(e) => onChange({ ...device, printerBaud: Number(e.target.value) })}
                            isReadOnly={isReadOnly}
                            options={BAUD_OPTIONS}
                            className="w-24"
                        />
                    )}
                </div>
            </td>
            <td className="p-2">
                <div className="flex flex-col gap-1">
                    <AdminSelect
                        value={device.cashDrawerCom ?? ''}
                        onChange={(e) =>
                            onChange({
                                ...device,
                                cashDrawerCom: e.target.value || null,
                                cashDrawerBaud: e.target.value ? device.cashDrawerBaud ?? 9600 : null,
                            })
                        }
                        isReadOnly={isReadOnly}
                        options={comPortOptions(availableComPorts, device.cashDrawerCom)}
                        className="w-24"
                    />
                    {device.cashDrawerCom && (
                        <AdminSelect
                            value={device.cashDrawerBaud ?? 9600}
                            onChange={(e) => onChange({ ...device, cashDrawerBaud: Number(e.target.value) })}
                            isReadOnly={isReadOnly}
                            options={BAUD_OPTIONS}
                            className="w-24"
                        />
                    )}
                </div>
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
    const [availableComPorts, setAvailableComPorts] = useState<number[]>([]);

    useEffect(() => {
        if (isReadOnly) return;
        fetch('/api/list-com-ports')
            .then((res) => res.json())
            .then((data) => {
                if (data.ports && Array.isArray(data.ports)) {
                    setAvailableComPorts(data.ports);
                }
            })
            .catch(() => {});
    }, [isReadOnly]);

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
            hasChanges={hasChanges}
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
                                <th className={adminHeaderStyle + ' w-32'}>Écran client</th>
                                <th className={adminHeaderStyle + ' w-28'}>Imprimante</th>
                                <th className={adminHeaderStyle + ' w-24'}>Tiroir caisse</th>
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
                                availableComPorts={availableComPorts}
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
