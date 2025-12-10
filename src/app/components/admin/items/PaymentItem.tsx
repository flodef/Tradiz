import ValidatedInput from '../ValidatedInput';
import SearchableSelect from '../SearchableSelect';
import Switch from '../Switch';

interface PaymentItemProps {
    payment: any;
    onChange: (payment: any) => void;
    onDelete: () => void;
    currencies: { label: string; value: any }[];
}

export default function PaymentItem({
    payment,
    onChange,
    onDelete,
    currencies,
}: PaymentItemProps) {
    const paymentTypes = ['Carte Bancaire', 'Espèce', 'Chèque', 'Ticket Restaurant', 'Chèque Vacances', 'Solana', 'G1 June', 'Virement'];

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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                    <select
                        value={payment.Type}
                        onChange={(e) => onChange({ ...payment, Type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        {paymentTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID</label>
                    <ValidatedInput
                        value={payment.ID}
                        onChange={(value) => onChange({ ...payment, ID: value })}
                        placeholder="ID du paiement"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Devise</label>
                    <SearchableSelect
                        options={currencies}
                        value={payment.Currency}
                        onChange={(value) => onChange({ ...payment, Currency: value })}
                        placeholder="Sélectionner une devise"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Disponibilité</label>
                    <Switch
                        checked={payment.Availability}
                        onChange={(checked) => onChange({ ...payment, Availability: checked })}
                    />
                </div>
            </div>
        </div>
    );
}
