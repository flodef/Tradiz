import { PaymentMethod } from '@/app/hooks/useConfig';
import SectionCard from '../SectionCard';
import PaymentItem from '../items/PaymentItem';
import { useState, useEffect } from 'react';

export default function PaymentsConfig({
    config,
    onChange,
    onSave,
    currencies,
}: {
    config: PaymentMethod[];
    onChange: (data: PaymentMethod[]) => void;
    onSave: (data: PaymentMethod[]) => void;
    currencies: { label: string; value: string }[];
}) {
    const [payments, setPayments] = useState(config || []);

    useEffect(() => {
        setPayments(config || []);
    }, [config]);

    const handlePaymentChange = (index: number, updatedPayment: PaymentMethod) => {
        const newPayments = [...payments];
        newPayments[index] = updatedPayment;
        setPayments(newPayments);
        onChange(newPayments);
    };

    const handleAddPayment = () => {
        const newPayment: PaymentMethod = {
            type: 'Carte Bancaire',
            id: '',
            currency: '',
            availability: false,
        };
        setPayments([...payments, newPayment]);
        onChange([...payments, newPayment]);
    };

    const handleDeletePayment = (index: number) => {
        const newPayments = payments.filter((_, i) => i !== index);
        setPayments(newPayments);
        onChange(newPayments);
    };

    return (
        <SectionCard title="Paiements" onSave={() => onSave(payments)}>
            {payments.map((payment, index) => (
                <PaymentItem
                    key={index}
                    payment={payment}
                    onChange={(updatedPayment) => handlePaymentChange(index, updatedPayment)}
                    onDelete={() => handleDeletePayment(index)}
                    currencies={currencies}
                />
            ))}
            <button
                onClick={handleAddPayment}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter un paiement
            </button>
        </SectionCard>
    );
}
