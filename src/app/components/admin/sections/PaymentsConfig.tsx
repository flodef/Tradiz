import { PaymentMethod } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import PaymentItem from '../items/PaymentItem';
import AdminButton from '../AdminButton';

export default function PaymentsConfig({
    config,
    onChange,
    onSave,
    currencies,
    isReadOnly = false,
}: {
    config: PaymentMethod[];
    onChange: (data: PaymentMethod[]) => void;
    onSave: (data: PaymentMethod[]) => void;
    currencies: { label: string; value: string }[];
    isReadOnly?: boolean;
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
        const updated = [...payments, newPayment];
        setPayments(updated);
        onChange(updated);
    };

    const handleDeletePayment = (index: number) => {
        const newPayments = payments.filter((_, i) => i !== index);
        setPayments(newPayments);
        onChange(newPayments);
    };

    return (
        <SectionCard title="Paiements" onSave={isReadOnly ? undefined : () => onSave(payments)}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {payments.map((payment, index) => (
                    <PaymentItem
                        key={index}
                        payment={payment}
                        onChange={(updatedPayment) => handlePaymentChange(index, updatedPayment)}
                        onDelete={() => handleDeletePayment(index)}
                        currencies={currencies}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddPayment}>
                    Ajouter un paiement
                </AdminButton>
            )}
        </SectionCard>
    );
}
