import ValidatedInput from '../ValidatedInput';
import { Printer } from '@/app/hooks/useConfig';

interface PrinterItemProps {
    printer: Printer;
    onChange: (printer: Printer) => void;
    onDelete: () => void;
}

export default function PrinterItem({ printer, onChange, onDelete }: PrinterItemProps) {
    const ipV4Validation = (ip: string) => {
        const regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return regex.test(ip);
    };

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4">
            <div className="flex justify-end">
                <button
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600"
                >
                    Supprimer
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                    <ValidatedInput
                        value={printer.label}
                        onChange={(value) => onChange({ ...printer, label: String(value) })}
                        placeholder="Label de l'imprimante"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Adresse IP
                    </label>
                    <ValidatedInput
                        value={printer.ipAddress}
                        onChange={(value) => onChange({ ...printer, ipAddress: String(value) })}
                        placeholder="Adresse IP de l'imprimante"
                        validation={(ip) => ipV4Validation(String(ip))}
                    />
                </div>
            </div>
        </div>
    );
}
