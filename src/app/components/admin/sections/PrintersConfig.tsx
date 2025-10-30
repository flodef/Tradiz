import { Printer } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import PrinterItem from '../items/PrinterItem';

export default function PrintersConfig({
    config,
    onChange,
    onSave,
}: {
    config: Printer[];
    onChange: (data: Printer[]) => void;
    onSave: (data: Printer[]) => void;
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
        setPrinters([...printers, newPrinter]);
        onChange([...printers, newPrinter]);
    };

    const handleDeletePrinter = (index: number) => {
        const newPrinters = printers.filter((_, i) => i !== index);
        setPrinters(newPrinters);
        onChange(newPrinters);
    };

    return (
        <SectionCard title="Imprimantes" onSave={() => onSave(printers)}>
            {printers.map((printer, index) => (
                <PrinterItem
                    key={index}
                    printer={printer}
                    onChange={(updatedPrinter) => handlePrinterChange(index, updatedPrinter)}
                    onDelete={() => handleDeletePrinter(index)}
                />
            ))}
            <button
                onClick={handleAddPrinter}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter une imprimante
            </button>
        </SectionCard>
    );
}
