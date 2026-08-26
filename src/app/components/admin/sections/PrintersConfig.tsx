import { usePopup } from '@/app/hooks/usePopup';
import { adminHeaderStyle, PRINTER_ROLES } from '@/app/utils/constants';
import { Printer } from '@/app/utils/interfaces';
import { testPrint } from '@/app/utils/posPrinter';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconCheck, IconLoader2, IconPrinter, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import AdminSelect from '../AdminSelect';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import SectionCard from '../SectionCard';

import AdminButton from '../AdminButton';

interface InternalPrinter extends Printer {
    _id: number;
}

function isLastOctet(address: string): boolean {
    const num = Number(address);
    return !isNaN(num) && num >= 1 && num <= 254 && address !== '';
}

function PrinterRow({
    printer,
    id,
    isReadOnly,
    onChange,
    onDelete,
    availableRoles,
    usedIpAddresses,
    localIp,
}: {
    printer: InternalPrinter;
    id: number;
    isReadOnly: boolean;
    onChange: (printer: InternalPrinter) => void;
    onDelete: () => void;
    availableRoles: string[];
    usedIpAddresses: string[];
    localIp: string | null;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const isAddressValid = isLastOctet(printer.ipAddress);
    const ownLastOctet = localIp?.split('.')[3] ?? '';
    const ipOptions = Array.from({ length: 254 }, (_, i) => String(i + 1))
        .filter((ip) => !usedIpAddresses.includes(ip) && ip !== ownLastOctet)
        .map((ip) => ({ label: ip, value: ip }))
        .concat(
            printer.ipAddress &&
                !usedIpAddresses.includes(printer.ipAddress) &&
                printer.ipAddress !== ownLastOctet &&
                !Array.from({ length: 254 }, (_, i) => String(i + 1)).includes(printer.ipAddress)
                ? [{ label: printer.ipAddress, value: printer.ipAddress }]
                : []
        );
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
            <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
            <td className="p-2">
                <AdminSelect
                    value={printer.label}
                    onChange={(e) => {
                        const value = String(e.target.value);
                        setTestResult(null);
                        onChange({ ...printer, label: value });
                    }}
                    isReadOnly={isReadOnly}
                    className="w-full min-w-36"
                    options={availableRoles.map((role) => ({ label: role === '' ? 'Sans rôle' : role, value: role }))}
                />
            </td>
            <td className="p-2">
                <div className="flex items-center gap-2 justify-end">
                    <AdminSelect
                        value={printer.ipAddress}
                        onChange={(e) => {
                            setTestResult(null);
                            onChange({ ...printer, ipAddress: e.target.value });
                        }}
                        isReadOnly={isReadOnly}
                        className="w-24"
                        options={ipOptions}
                    />
                </div>
            </td>
            <td className="p-2">
                <AdminButton
                    onClick={async () => {
                        setIsTesting(true);
                        setTestResult(null);
                        const res = await testPrint(printer.ipAddress);
                        setTestResult(res.success ? 'OK' : res.error || 'Erreur');
                        setIsTesting(false);
                    }}
                    disabled={isTesting || !printer.ipAddress || !isAddressValid}
                    className="text-xs py-1 px-2.5"
                >
                    {isTesting ? (
                        <IconLoader2 size={18} className="animate-spin" />
                    ) : testResult === 'OK' ? (
                        <IconCheck size={18} stroke={3} className="text-green-600" />
                    ) : testResult ? (
                        <IconX size={18} stroke={3} className="text-red-500" />
                    ) : (
                        <IconPrinter size={18} />
                    )}
                    Test
                </AdminButton>
            </td>
            <DeleteButtonCell isReadOnly={isReadOnly} onDelete={onDelete} title="Supprimer l'imprimante" />
        </tr>
    );
}

export default function PrintersConfig({
    config,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
    onValidation,
}: {
    config: Printer[];
    onChange: (data: Printer[]) => void;
    onSave?: (data: Printer[]) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
    onValidation?: (isValid: boolean) => void;
}) {
    const nextIdRef = useRef(0);
    const selfUpdateRef = useRef(false);
    const [printers, setPrinters] = useState<InternalPrinter[]>(() =>
        (config || []).map((p) => ({ ...p, _id: nextIdRef.current++ }))
    );
    const [isScanning, setIsScanning] = useState(false);
    const [localIp, setLocalIp] = useState<string | null>(null);
    const foundPrintersRef = useRef<{ ip: string; lastOctet?: number; label: string }[]>([]);
    const { openFullscreenPopup } = usePopup();

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setPrinters((config || []).map((p) => ({ ...p, _id: nextIdRef.current++ })));
    }, [config]);

    useEffect(() => {
        fetch('/api/local-ip')
            .then((res) => res.json())
            .then((data) => {
                if (data.localIp) setLocalIp(data.localIp);
            })
            .catch(() => {});
    }, []);

    // Sync internal printers state back to parent after render.
    // Using a ref + useEffect avoids calling onChange (parent setState)
    // during render or inside setPrinters updater functions.
    const prevPrintersRef = useRef<InternalPrinter[]>(printers);
    useEffect(() => {
        if (prevPrintersRef.current === printers) return;
        prevPrintersRef.current = printers;
        selfUpdateRef.current = true;
        onChange(printers.map(({ _id: _, ...rest }) => rest));
    }, [printers, onChange]);

    const isValid =
        printers.every((p) => {
            const labelOk = PRINTER_ROLES.includes(p.label as (typeof PRINTER_ROLES)[number]);
            const addrOk = isLastOctet(p.ipAddress);
            return labelOk && addrOk;
        }) && new Set(printers.map((p) => p.label)).size === printers.length;

    useEffect(() => {
        onValidation?.(isValid);
    }, [isValid, onValidation]);

    const handlePrinterChange = (index: number, updatedPrinter: InternalPrinter) => {
        const updated = printers.map((p, i) => (i === index ? updatedPrinter : p));
        setPrinters(updated);
    };

    const usedRoles = new Set(printers.map((p) => p.label));
    const hasAvailableRole = PRINTER_ROLES.some((r) => !usedRoles.has(r));

    const handleAddPrinter = () => {
        const availableRole = PRINTER_ROLES.find((r) => !usedRoles.has(r));
        if (!availableRole) return;
        const usedIps = new Set(printers.map((p) => p.ipAddress));
        const ownLastOctet = localIp?.split('.')[3] ?? '';
        const defaultAddress =
            Array.from({ length: 254 }, (_, i) => String(i + 1)).find(
                (ip) => !usedIps.has(ip) && ip !== ownLastOctet
            ) ?? '';
        const newPrinter: InternalPrinter = {
            label: availableRole,
            ipAddress: defaultAddress,
            _id: nextIdRef.current++,
        };
        setPrinters([...printers, newPrinter]);
    };

    const handleDeletePrinter = (index: number) => {
        setPrinters(printers.filter((_, i) => i !== index));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setPrinters((prev) => {
            const oldIdx = prev.findIndex((p) => p._id === active.id);
            const newIdx = prev.findIndex((p) => p._id === over.id);
            if (oldIdx === -1 || newIdx === -1) return prev;
            return arrayMove(prev, oldIdx, newIdx);
        });
    };

    const addFoundPrinters = (newOnes: { ip: string; lastOctet?: number; label: string }[]) => {
        if (newOnes.length === 0) return;
        setPrinters((prev) => {
            const updated = [...prev];
            const usedRoles = new Set(updated.filter((p) => p.label !== '').map((p) => p.label));
            const existingAddrs = new Set(updated.map((p) => p.ipAddress));

            // First, assign available roles to existing no-role printers (they already have addresses)
            for (let i = 0; i < updated.length; i++) {
                if (updated[i].label !== '') continue;
                const role = PRINTER_ROLES.find((r) => !usedRoles.has(r));
                if (!role) break;
                usedRoles.add(role);
                updated[i] = { ...updated[i], label: role };
            }

            // Then add found printers that aren't already in the list
            for (const found of newOnes) {
                const addr = found.lastOctet ? String(found.lastOctet) : found.ip;
                if (existingAddrs.has(addr)) continue;
                const role = PRINTER_ROLES.find((r) => !usedRoles.has(r));
                usedRoles.add(role ?? 'Sans rôle');
                existingAddrs.add(addr);
                updated.push({
                    label: role ?? '',
                    ipAddress: addr,
                    _id: nextIdRef.current++,
                });
            }

            return updated;
        });
    };

    const handleAutoDetect = async () => {
        setIsScanning(true);
        foundPrintersRef.current = [];

        try {
            const res = await fetch('/api/scan-printers');
            if (!res.body) {
                openFullscreenPopup('Erreur: pas de réponse du serveur', ['OK']);
                setIsScanning(false);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let subnet = '';

            const processEvent = (eventType: string, data: string) => {
                const parsed = JSON.parse(data);

                if (eventType === 'start') {
                    subnet = parsed.subnet;
                    if (parsed.localIp) setLocalIp(parsed.localIp);
                } else if (eventType === 'printer') {
                    foundPrintersRef.current = [...foundPrintersRef.current, parsed];
                } else if (eventType === 'done') {
                    if (foundPrintersRef.current.length > 0) {
                        addFoundPrinters(foundPrintersRef.current);
                        openFullscreenPopup(
                            `${foundPrintersRef.current.length} imprimante(s) détectée(s) et ajoutée(s)`,
                            ['OK']
                        );
                    } else {
                        openFullscreenPopup(
                            `Aucune imprimante trouvée sur ${subnet}. Vérifiez que l'imprimante est allumée et connectée au même réseau.`,
                            ['OK']
                        );
                    }
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const eventBlock of events) {
                    const lines = eventBlock.split('\n');
                    let eventType = '';
                    let dataLine = '';
                    for (const line of lines) {
                        if (line.startsWith('event: ')) eventType = line.slice(7);
                        else if (line.startsWith('data: ')) dataLine = line.slice(6);
                    }
                    if (eventType && dataLine) {
                        processEvent(eventType, dataLine);
                    }
                }
            }
        } catch {
            openFullscreenPopup("Erreur lors de la recherche d'imprimantes", ['OK']);
        }
        setIsScanning(false);
    };

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

    return (
        <SectionCard
            title="Imprimantes"
            onSave={onSave ? () => onSave(printers.map(({ _id: _, ...rest }) => rest)) : undefined}
            onCancel={onCancel}
            hasChanges={hasChanges}
            onAdd={hasAvailableRole ? handleAddPrinter : undefined}
            isValid={isValid}
            saveDisabled={!isValid}
            addLabel="Ajouter une imprimante"
            isReadOnly={isReadOnly}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            icon={icon}
            headerExtra={
                !isReadOnly ? (
                    <AdminButton onClick={handleAutoDetect} disabled={isScanning} className="py-1">
                        {isScanning ? <IconLoader2 size={16} className="animate-spin" /> : <IconSearch size={16} />}
                        {isScanning ? 'Recherche...' : 'Détecter automatiquement'}
                    </AdminButton>
                ) : undefined
            }
            extraActions={undefined}
        >
            {printers.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={printers.map((p) => p._id)} strategy={verticalListSortingStrategy}>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        {!isReadOnly && <th className="w-12"></th>}
                                        <th className={adminHeaderStyle + ' w-full min-w-36'}>Rôle</th>
                                        <th className={adminHeaderStyle + ' w-48'}>Adresse</th>
                                        {!isReadOnly && <th className={adminHeaderStyle + ' w-12'}>Test</th>}
                                        {!isReadOnly && <th className="w-16"></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {printers.map((printer, index) => (
                                        <PrinterRow
                                            key={printer._id}
                                            id={printer._id}
                                            printer={printer}
                                            isReadOnly={isReadOnly}
                                            onChange={(updatedPrinter) => handlePrinterChange(index, updatedPrinter)}
                                            onDelete={() => handleDeletePrinter(index)}
                                            availableRoles={[
                                                ...(printer.label === '' ? [''] : []),
                                                ...PRINTER_ROLES.filter(
                                                    (role) =>
                                                        role === printer.label ||
                                                        !printers.some((p) => p.label === role)
                                                ),
                                            ]}
                                            usedIpAddresses={printers
                                                .filter((_, i) => i !== index)
                                                .map((p) => p.ipAddress)
                                                .filter(Boolean)}
                                            localIp={localIp}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </SectionCard>
    );
}
