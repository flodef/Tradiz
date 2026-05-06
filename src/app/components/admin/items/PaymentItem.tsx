import { CloseButton } from '@/app/components/CloseButton';
import { errorRoundButtonStyle, errorRoundContainerStyle } from '@/app/utils/constants';
import { Currency, PaymentMethod } from '@/app/utils/interfaces';
import { IconCheck, IconX } from '@tabler/icons-react';
import AdminSelect from '../AdminSelect';
import ValidatedInput from '../ValidatedInput';
import { PAYMENT_TYPES } from '@/app/utils/constants';

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
                    {isReadOnly ? (
                        <div className="flex items-center h-[42px]">
                            {payment.availability ? (
                                <IconCheck className="text-green-500" size={28} stroke={3} />
                            ) : (
                                <IconX className="text-red-500" size={28} stroke={3} />
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => onChange({ ...payment, availability: !payment.availability })}
                            className="flex items-center h-[42px]"
                        >
                            {payment.availability ? (
                                <IconCheck className="text-green-500 hover:text-green-600" size={28} stroke={3} />
                            ) : (
                                <IconX className="text-red-500 hover:text-red-600" size={28} stroke={3} />
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
