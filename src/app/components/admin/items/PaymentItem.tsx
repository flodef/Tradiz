import { CloseButton } from '@/app/components/CloseButton';
import { errorRoundButtonStyle, errorRoundContainerStyle } from '@/app/utils/constants';
import { Currency, PaymentMethod } from '@/app/utils/interfaces';
import AdminSelect from '../AdminSelect';
import ValidatedInput from '../ValidatedInput';
import { PAYMENT_TYPES } from '@/app/utils/constants';
import AvailabilityToggle from '../AvailabilityToggle';

interface PaymentItemProps {
    payment: PaymentMethod;
    onChange: (payment: PaymentMethod) => void;
    onDelete: () => void;
    currencies: Currency[];
    isReadOnly?: boolean;
}

export default function PaymentItem({ payment, onChange, onDelete, currencies, isReadOnly = false }: PaymentItemProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4 relative">
            <div className={errorRoundContainerStyle + ' absolute top-2 right-2'}>
                <CloseButton onClose={onDelete} size="xs" className={errorRoundButtonStyle} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-8">
                <div>
                    <AdminSelect
                        label="Type"
                        value={payment.type}
                        onChange={(e) => !isReadOnly && onChange({ ...payment, type: e.target.value })}
                        disabled={isReadOnly}
                        options={PAYMENT_TYPES.map((type) => ({ label: type, value: type }))}
                    />
                </div>
                <div>
                    <ValidatedInput
                        label="ID"
                        value={payment.id ?? ''}
                        onChange={(value) => onChange({ ...payment, id: String(value) })}
                        placeholder="ID du paiement"
                        disabled={isReadOnly}
                    />
                </div>
                <div>
                    <AdminSelect
                        label="Devise"
                        value={payment.currency}
                        onChange={(e) => !isReadOnly && onChange({ ...payment, currency: e.target.value })}
                        disabled={isReadOnly}
                        options={currencies.map((currency) => ({ label: currency.symbol, value: currency.symbol }))}
                    />
                </div>
                <div>
                    <label className="block text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                        Disponibilité
                    </label>
                    <AvailabilityToggle
                        availability={payment.availability}
                        isReadOnly={isReadOnly}
                        onChange={(newValue) => onChange({ ...payment, availability: newValue })}
                    />
                </div>
            </div>
        </div>
    );
}
