import { Printer } from '@/app/utils/interfaces';
import { useEffect, useRef, useState } from 'react';
import SectionCard from '../SectionCard';
import PrinterItem from '../items/PrinterItem';

export default function PrintersConfig({
    config,
    onChange,
    onSave,
    onCancel,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
}: {
    config: Printer[];
    onChange: (data: Printer[]) => void;
    onSave?: (data: Printer[]) => void;
    onCancel?: () => void;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}) {
    const [printers, setPrinters] = useState(config || []);
    const lastAddedIndexRef = useRef<number | null>(null);
    const labelInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

    useEffect(() => {
        setPrinters(config || []);
    }, [config]);

    const handlePrinterChange = (index: number, updatedPrinter: Printer) => {
        const newPrinters = [...printers];
        newPrinters[index] = updatedPrinter;
        setPrinters(newPrinters);
        onChange(newPrinters);
    };

    const handleAddPrinter = () => {
        const newPrinter: Printer = {
            label: '',
            ipAddress: '',
        };
        const updated = [...printers, newPrinter];
        lastAddedIndexRef.current = updated.length - 1;
        setPrinters(updated);
        onChange(updated);
    };

    const handleDeletePrinter = (index: number) => {
        const newPrinters = printers.filter((_, i) => i !== index);
        setPrinters(newPrinters);
        onChange(newPrinters);
    };

    const isValid = printers.every((p) => p.label?.trim() && p.ipAddress?.trim());

    return (
        <SectionCard
            title="Imprimantes"
            onSave={isReadOnly ? undefined : onSave ? () => onSave(printers) : undefined}
            onCancel={onCancel}
            onAdd={handleAddPrinter}
            isValid={isValid}
            addLabel="Ajouter une imprimante"
            isReadOnly={isReadOnly}
            isLoading={isLoading}
            isOpen={isOpen}
            onToggle={onToggle}
            icon={icon}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {printers.map((printer, index) => (
                    <PrinterItem
                        key={index}
                        printer={printer}
                        onChange={(updatedPrinter) => handlePrinterChange(index, updatedPrinter)}
                        onDelete={() => handleDeletePrinter(index)}
                        isReadOnly={isReadOnly}
                        labelInputRefs={labelInputRefs}
                        lastAddedIndexRef={lastAddedIndexRef}
                        index={index}
                    />
                ))}
            </div>
        </SectionCard>
    );
}
