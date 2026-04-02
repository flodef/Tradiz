import { Printer } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import PrinterItem from '../items/PrinterItem';
import AdminButton from '../AdminButton';

export default function PrintersConfig({
    config,
    onChange,
    onSave,
    isReadOnly = false,
}: {
    config: Printer[];
    onChange: (data: Printer[]) => void;
    onSave: (data: Printer[]) => void;
    isReadOnly?: boolean;
}) {
    const [printers, setPrinters] = useState(config || []);

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
        setPrinters(updated);
        onChange(updated);
    };

    const handleDeletePrinter = (index: number) => {
        const newPrinters = printers.filter((_, i) => i !== index);
        setPrinters(newPrinters);
        onChange(newPrinters);
    };

    return (
        <SectionCard title="Imprimantes" onSave={isReadOnly ? undefined : () => onSave(printers)}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {printers.map((printer, index) => (
                    <PrinterItem
                        key={index}
                        printer={printer}
                        onChange={(updatedPrinter) => handlePrinterChange(index, updatedPrinter)}
                        onDelete={() => handleDeletePrinter(index)}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddPrinter}>
                    Ajouter une imprimante
                </AdminButton>
            )}
        </SectionCard>
    );
}
