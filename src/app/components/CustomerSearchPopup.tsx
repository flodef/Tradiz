'use client';

import { FC, useMemo, useState } from 'react';
import { Customer } from '../utils/interfaces';

interface CustomerSearchPopupProps {
    customers: Customer[];
    initialQuery: string;
    onSelectCustomer: (customer: Customer) => void;
    onCreateCustomer: (customerName: string) => void;
    onSelectNoCustomer: () => void;
}

const CustomerSearchPopup: FC<CustomerSearchPopupProps> = ({
    customers,
    initialQuery,
    onSelectCustomer,
    onCreateCustomer,
    onSelectNoCustomer,
}) => {
    const [query, setQuery] = useState(initialQuery);

    const filteredCustomers = useMemo(() => {
        if (!query) return customers;
        const q = query.toLowerCase();
        return customers.filter(
            (c) =>
                c.firstName.toLowerCase().includes(q) ||
                c.lastName.toLowerCase().includes(q) ||
                c.reference?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                c.phone?.toLowerCase().includes(q)
        );
    }, [customers, query]);

    return (
        <div className="p-4">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un client..."
                className="w-full p-2 border rounded mb-4 dark:bg-gray-700 dark:border-gray-600"
                autoFocus
                maxLength={50}
            />
            <div className="max-h-60 overflow-y-auto">
                {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer: Customer) => (
                        <div
                            key={customer.id || customer.reference || `${customer.firstName}-${customer.lastName}`}
                            onClick={() => onSelectCustomer(customer)}
                            className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                        >
                            {customer.firstName} {customer.lastName}
                            {customer.reference && <span className="text-gray-500 ml-2">({customer.reference})</span>}
                        </div>
                    ))
                ) : (
                    <div
                        onClick={() => onCreateCustomer(query)}
                        className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-green-600 dark:text-green-400 cursor-pointer"
                    >
                        + Créer "{query}"
                    </div>
                )}
                <div
                    onClick={() => onSelectNoCustomer()}
                    className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded mt-2 border-t border-gray-200 dark:border-gray-700 cursor-pointer"
                >
                    Aucun client
                </div>
            </div>
        </div>
    );
};

export default CustomerSearchPopup;
