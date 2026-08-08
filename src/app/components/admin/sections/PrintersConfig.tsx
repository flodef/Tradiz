import { Printer } from '@/app/utils/interfaces';
import { useEffect, useRef, useState } from 'react';
import { IconSearch, IconLoader2, IconPrinter } from '@tabler/icons-react';
import { usePopup } from '@/app/hooks/usePopup';
import { testPrint } from '@/app/utils/posPrinter';
import { PRINTER_ROLES } from '@/app/utils/constants';
import Switch from '../Switch';
import AdminSelect from '../AdminSelect';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { adminHeaderStyle } from '@/app/utils/constants';
import SectionCard from '../SectionCard';
import DeleteButtonCell from '../DeleteButtonCell';
import DragHandleCell from '../DragHandleCell';
import ValidatedInput from '../ValidatedInput';
import AdminButton from '../AdminButton';

interface InternalPrinter extends Printer {
    _id: number;
}

const comPortRegex = /^COM\d+$/i;

function isComPort(address: string): boolean {
    return comPortRegex.test(address.trim());
}

function getComPortNumber(address: string): string {
    const match = address.match(/COM(\d+)/i);
    return match ? match[1] : '';
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
    availableComPorts,
    usedComPorts,
}: {
    printer: InternalPrinter;
    id: number;
    isReadOnly: boolean;
    onChange: (printer: InternalPrinter) => void;
    onDelete: () => void;
    availableRoles: string[];
    availableComPorts: number[];
    usedComPorts: number[];
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const isCom = isComPort(printer.ipAddress);
    const comNum = isCom ? getComPortNumber(printer.ipAddress) : '';
    const isAddressValid = isCom ? comPortRegex.test(printer.ipAddress) : isLastOctet(printer.ipAddress);
    const comPortsAvailable = availableComPorts.length > 0;
    const currentComNum = isCom ? Number(comNum) : 0;
    const freeComPorts = availableComPorts.filter((p) => !usedComPorts.includes(p) || p === currentComNum);
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
                    className="w-36"
                    options={availableRoles.map((role) => ({ label: role, value: role }))}
                />
            </td>
            <td className="p-2">
                <div className="flex items-center gap-2">
                    {comPortsAvailable && (
                        <>
                            <Switch
                                checked={isCom}
                                onChange={(checked) => {
                                    setTestResult(null);
                                    if (checked) {
                                        onChange({
                                            ...printer,
                                            ipAddress: `COM${freeComPorts[0] || availableComPorts[0]}`,
                                        });
                                    } else {
                                        onChange({ ...printer, ipAddress: '' });
                                    }
                                }}
                                isReadOnly={isReadOnly}
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{isCom ? 'COM' : 'IP'}</span>
                        </>
                    )}
                    {isCom && comPortsAvailable ? (
                        <AdminSelect
                            value={Number(comNum) || freeComPorts[0] || availableComPorts[0]}
                            onChange={(e) => {
                                const port = e.target.value;
                                setTestResult(null);
                                onChange({ ...printer, ipAddress: `COM${port}` });
                            }}
                            isReadOnly={isReadOnly}
                            className="w-24"
                            options={freeComPorts.map((p) => ({ label: `COM${p}`, value: p }))}
                        />
                    ) : (
                        <ValidatedInput
                            type="number"
                            value={printer.ipAddress}
                            onChange={(value) => {
                                setTestResult(null);
                                onChange({ ...printer, ipAddress: String(value) });
                            }}
                            placeholder="195"
                            isReadOnly={isReadOnly}
                            validation={(value) => isLastOctet(String(value))}
                            max={254}
                        />
                    )}
                </div>
            </td>
            <td className="p-2">
                <div className="flex items-center gap-2">
                    <AdminButton
                        onClick={async () => {
                            setIsTesting(true);
                            setTestResult(null);
                            const res = await testPrint(printer.ipAddress);
                            setTestResult(res.success ? 'OK' : res.error || 'Erreur');
                            setIsTesting(false);
                        }}
                        disabled={isTesting || !printer.ipAddress || !isAddressValid}
                        className="text-xs py-1.5 px-2.5"
                    >
                        {isTesting ? <IconLoader2 size={16} className="animate-spin" /> : <IconPrinter size={16} />}
                        Test
                    </AdminButton>
                    {testResult && (
                        <span
                            className={`text-2xl font-bold ${testResult === 'OK' ? 'text-green-600' : 'text-red-500'}`}
                        >
                            {testResult === 'OK' ? '✓' : '✗'}
                        </span>
                    )}
                </div>
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
    const [availableComPorts, setAvailableComPorts] = useState<number[]>([]);
    const scanAbortRef = useRef(false);
    const foundPrintersRef = useRef<{ ip: string; lastOctet?: number; label: string }[]>([]);
    const { openFullscreenPopup, closePopup } = usePopup();

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setPrinters((config || []).map((p) => ({ ...p, _id: nextIdRef.current++ })));
    }, [config]);

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

    const notifyParent = (items: InternalPrinter[]) => {
        selfUpdateRef.current = true;
        onChange(items.map(({ _id: _, ...rest }) => rest));
    };

    const isValid =
        printers.every((p) => {
            const labelOk = PRINTER_ROLES.includes(p.label as (typeof PRINTER_ROLES)[number]);
            const addrOk = isComPort(p.ipAddress) ? comPortRegex.test(p.ipAddress) : isLastOctet(p.ipAddress);
            return labelOk && addrOk;
        }) && new Set(printers.map((p) => p.label)).size === printers.length;

    useEffect(() => {
        onValidation?.(isValid);
    }, [isValid, onValidation]);

    const handlePrinterChange = (index: number, updatedPrinter: InternalPrinter) => {
        const updated = printers.map((p, i) => (i === index ? updatedPrinter : p));
        setPrinters(updated);
        notifyParent(updated);
    };

    const handleAddPrinter = () => {
        const usedRoles = new Set(printers.map((p) => p.label));
        const availableRole = PRINTER_ROLES.find((r) => !usedRoles.has(r));
        if (!availableRole) return;
        // Default to COM mode if COM ports are available
        const usedComPorts = new Set(
            printers.filter((p) => isComPort(p.ipAddress)).map((p) => Number(getComPortNumber(p.ipAddress)))
        );
        const firstFreeCom = availableComPorts.find((p) => !usedComPorts.has(p));
        const defaultAddress = firstFreeCom ? `COM${firstFreeCom}` : '';
        const newPrinter: InternalPrinter = {
            label: availableRole,
            ipAddress: defaultAddress,
            _id: nextIdRef.current++,
        };
        const updated = [...printers, newPrinter];
        setPrinters(updated);
        notifyParent(updated);
    };

    const handleDeletePrinter = (index: number) => {
        const updated = printers.filter((_, i) => i !== index);
        setPrinters(updated);
        notifyParent(updated);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setPrinters((prev) => {
            const oldIdx = prev.findIndex((p) => p._id === active.id);
            const newIdx = prev.findIndex((p) => p._id === over.id);
            if (oldIdx === -1 || newIdx === -1) return prev;
            const reordered = arrayMove(prev, oldIdx, newIdx);
            notifyParent(reordered);
            return reordered;
        });
    };

    const addFoundPrinters = (newOnes: { ip: string; lastOctet?: number; label: string }[]) => {
        if (newOnes.length === 0) return;
        setPrinters((prev) => {
            const existingAddrs = new Set(prev.map((p) => p.ipAddress));
            const usedRoles = new Set(prev.map((p) => p.label));
            const toAdd = newOnes
                .filter((p) => {
                    const addr = p.lastOctet ? String(p.lastOctet) : p.ip;
                    return !existingAddrs.has(addr);
                })
                .map((p) => {
                    const role = PRINTER_ROLES.find((r) => !usedRoles.has(r));
                    if (role) usedRoles.add(role);
                    const addr = p.lastOctet ? String(p.lastOctet) : p.ip;
                    return { label: role || p.label, ipAddress: addr, _id: nextIdRef.current++ };
                });
            if (toAdd.length === 0) return prev;
            const updated = [...prev, ...toAdd];
            notifyParent(updated);
            return updated;
        });
    };

    const handleAutoDetect = async () => {
        setIsScanning(true);
        foundPrintersRef.current = [];
        scanAbortRef.current = false;

        // Test COM ports in parallel and update available list
        fetch('/api/list-com-ports')
            .then((res) => res.json())
            .then((data) => {
                if (data.ports && Array.isArray(data.ports)) {
                    setAvailableComPorts(data.ports);
                }
            })
            .catch(() => {});

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
            let firstFound = true;

            const processEvent = (eventType: string, data: string) => {
                const parsed = JSON.parse(data);

                if (eventType === 'start') {
                    subnet = parsed.subnet;
                } else if (eventType === 'printer') {
                    foundPrintersRef.current = [...foundPrintersRef.current, parsed];

                    if (firstFound) {
                        firstFound = false;
                        openFullscreenPopup(
                            `Imprimante détectée : ${parsed.ip}`,
                            ['Ajouter et arrêter', 'Continuer le scan', 'Ignorer'],
                            (index) => {
                                if (index === 0) {
                                    scanAbortRef.current = true;
                                    addFoundPrinters(foundPrintersRef.current);
                                    openFullscreenPopup(
                                        `${foundPrintersRef.current.length} imprimante(s) ajoutée(s) sur ${subnet}`,
                                        ['OK']
                                    );
                                    setIsScanning(false);
                                    closePopup();
                                } else if (index === 1) {
                                    closePopup();
                                } else {
                                    foundPrintersRef.current = [];
                                    closePopup();
                                }
                            }
                        );
                    }
                } else if (eventType === 'done') {
                    if (!scanAbortRef.current && foundPrintersRef.current.length > 0) {
                        addFoundPrinters(foundPrintersRef.current);
                        openFullscreenPopup(
                            `${foundPrintersRef.current.length} imprimante(s) détectée(s) sur ${subnet}`,
                            ['OK']
                        );
                    } else if (!scanAbortRef.current && foundPrintersRef.current.length === 0) {
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

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
                distance: 10,
            },
        })
    );

    return (
        <SectionCard
            title="Imprimantes / Ecran"
            onSave={onSave ? () => onSave(printers.map(({ _id: _, ...rest }) => rest)) : undefined}
            onCancel={onCancel}
            hasChanges={hasChanges}
            onAdd={handleAddPrinter}
            isValid={isValid}
            saveDisabled={!isValid}
            addLabel="Ajouter une imprimante / écran"
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
                                        <th className={adminHeaderStyle + ' min-w-24'}>Rôle</th>
                                        <th className={adminHeaderStyle + ' min-w-36 w-36'}>Adresse</th>
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
                                            availableRoles={PRINTER_ROLES.filter(
                                                (role) =>
                                                    role === printer.label || !printers.some((p) => p.label === role)
                                            )}
                                            availableComPorts={availableComPorts}
                                            usedComPorts={printers
                                                .filter((_, i) => i !== index)
                                                .filter((p) => isComPort(p.ipAddress))
                                                .map((p) => Number(getComPortNumber(p.ipAddress)))
                                                .filter((n) => !isNaN(n))}
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
