import { Printer } from '@/app/utils/interfaces';
import { useEffect, useRef, useState } from 'react';
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

interface InternalPrinter extends Printer {
    _id: number;
}

const ipV4Validation = (ip: string) => {
    const regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ip);
};

function PrinterRow({
    printer,
    id,
    index,
    isReadOnly,
    onChange,
    onDelete,
    labelInputRefs,
    lastAddedIndexRef,
}: {
    printer: InternalPrinter;
    id: number;
    index: number;
    isReadOnly: boolean;
    onChange: (printer: InternalPrinter) => void;
    onDelete: () => void;
    labelInputRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
    lastAddedIndexRef: React.MutableRefObject<number | null>;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const labelValidation = (value: string | number) => {
        const label = String(value).trim();
        return label.length > 0 && label.length <= 25;
    };

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-gray-200 dark:border-gray-700">
            <DragHandleCell isReadOnly={isReadOnly} attributes={attributes} listeners={listeners} />
            <td className="p-2">
                <ValidatedInput
                    type="text"
                    value={printer.label}
                    onChange={(value) => onChange({ ...printer, label: String(value) })}
                    placeholder="Label de l'imprimante"
                    isReadOnly={isReadOnly}
                    maxLength={25}
                    validation={labelValidation}
                    ref={(el) => {
                        if (el) {
                            labelInputRefs.current.set(index, el);
                            if (lastAddedIndexRef.current === index) {
                                el.focus();
                                lastAddedIndexRef.current = null;
                            }
                        } else {
                            labelInputRefs.current.delete(index);
                        }
                    }}
                />
            </td>
            <td className="p-2">
                <ValidatedInput
                    type="text"
                    value={printer.ipAddress}
                    onChange={(value) => onChange({ ...printer, ipAddress: String(value) })}
                    placeholder="192.168.0.1"
                    isReadOnly={isReadOnly}
                    validation={(value) => ipV4Validation(String(value))}
                />
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
    const lastAddedIndexRef = useRef<number | null>(null);
    const labelInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const [printers, setPrinters] = useState<InternalPrinter[]>(() =>
        (config || []).map((p) => ({ ...p, _id: nextIdRef.current++ }))
    );

    useEffect(() => {
        if (selfUpdateRef.current) {
            selfUpdateRef.current = false;
            return;
        }
        setPrinters((config || []).map((p) => ({ ...p, _id: nextIdRef.current++ })));
    }, [config]);

    const notifyParent = (items: InternalPrinter[]) => {
        selfUpdateRef.current = true;
        onChange(items.map(({ _id: _, ...rest }) => rest));
    };

    const isValid = printers.every(
        (p) => p.label?.trim().length > 0 && p.label?.trim().length <= 25 && ipV4Validation(p.ipAddress)
    );

    useEffect(() => {
        onValidation?.(isValid);
    }, [isValid, onValidation]);

    const handlePrinterChange = (index: number, updatedPrinter: InternalPrinter) => {
        const updated = printers.map((p, i) => (i === index ? updatedPrinter : p));
        setPrinters(updated);
        notifyParent(updated);
    };

    const handleAddPrinter = () => {
        const newPrinter: InternalPrinter = { label: '', ipAddress: '', _id: nextIdRef.current++ };
        const updated = [...printers, newPrinter];
        lastAddedIndexRef.current = updated.length - 1;
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
            title="Imprimantes"
            onSave={onSave ? () => onSave(printers.map(({ _id: _, ...rest }) => rest)) : undefined}
            onCancel={onCancel}
            hasChanges={hasChanges}
            onAdd={handleAddPrinter}
            isValid={isValid}
            saveDisabled={!isValid}
            addLabel="Ajouter une imprimante"
            isReadOnly={isReadOnly}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            icon={icon}
        >
            {printers.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={printers.map((p) => p._id)} strategy={verticalListSortingStrategy}>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        {!isReadOnly && <th className="w-12"></th>}
                                        <th className={adminHeaderStyle + ' min-w-24'}>Label</th>
                                        <th className={adminHeaderStyle + ' min-w-20 w-36'}>Adresse IP</th>
                                        {!isReadOnly && <th className="w-16"></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {printers.map((printer, index) => (
                                        <PrinterRow
                                            key={printer._id}
                                            id={printer._id}
                                            index={index}
                                            printer={printer}
                                            isReadOnly={isReadOnly}
                                            onChange={(updatedPrinter) => handlePrinterChange(index, updatedPrinter)}
                                            onDelete={() => handleDeletePrinter(index)}
                                            labelInputRefs={labelInputRefs}
                                            lastAddedIndexRef={lastAddedIndexRef}
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
