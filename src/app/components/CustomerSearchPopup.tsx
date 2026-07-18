'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { IconPrinter } from '@tabler/icons-react';
import { Customer } from '../utils/interfaces';
import { usePopup } from '../hooks/usePopup';
import { useConfig } from '../hooks/useConfig';
import { useIsMobileDevice } from '../utils/mobile';
import { getPopupStyles, getOptionHoverStyles } from '../utils/popupStyles';

interface CustomerSearchPopupProps {
    initialQuery?: string;
    onSelectCustomer: (customer: Customer) => void;
    onCreateCustomer: (customerName: string) => void;
    onPrintBalance?: (customer: Customer) => void;
}

type OptionType = 'customer' | 'add';

interface Option {
    type: OptionType;
    customer?: Customer;
}

const CustomerSearchPopup: FC<CustomerSearchPopupProps> = ({
    initialQuery = '',
    onSelectCustomer,
    onCreateCustomer,
    onPrintBalance,
}) => {
    const { customers } = useConfig();
    const [query, setQuery] = useState(initialQuery);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const { closePopup } = usePopup();
    const isMobileDevice = useIsMobileDevice();
    const styles = getPopupStyles('default');
    const optionClass = twMerge(styles.option, 'px-3', getOptionHoverStyles(isMobileDevice, true));

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
            itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [highlightedIndex]);

    const q = query.trim().toLowerCase();

    const filteredCustomers = useMemo(() => {
        if (!q) return [];
        const tokens = q.split(/\s+/);
        return customers.filter((c) => {
            const searchable = [c.firstName, c.lastName, `${c.firstName} ${c.lastName}`, c.reference, c.email, c.phone]
                .filter(Boolean)
                .map((v) => v!.toLowerCase());
            return tokens.every((token) => searchable.some((value) => value.includes(token)));
        });
    }, [customers, q]);

    const trimmedQuery = query.trim();
    const showAddOption = trimmedQuery.length > 0 && filteredCustomers.length === 0;

    const options = useMemo<Option[]>(() => {
        const items: Option[] = filteredCustomers.map((c) => ({ type: 'customer', customer: c }));
        if (showAddOption) items.push({ type: 'add' });
        return items;
    }, [filteredCustomers, showAddOption]);

    useEffect(() => {
        setHighlightedIndex(options.length > 0 ? 0 : -1);
    }, [options.length]);

    const selectOption = (index: number) => {
        const option = options[index];
        if (!option) return;

        if (option.type === 'customer' && option.customer) {
            onSelectCustomer(option.customer);
        } else if (option.type === 'add') {
            closePopup();
            onCreateCustomer(trimmedQuery);
            return;
        }
        closePopup();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (options.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0) selectOption(highlightedIndex);
                break;
            case 'Escape':
                e.preventDefault();
                closePopup();
                break;
        }
    };

    const renderOption = (option: Option, index: number) => {
        if (option.type === 'add') {
            return (
                <div
                    key="add"
                    ref={(el) => {
                        itemRefs.current[index] = el;
                    }}
                    className={twMerge(
                        optionClass,
                        highlightedIndex === index && 'bg-active-light dark:bg-active-dark'
                    )}
                    onClick={() => selectOption(index)}
                >
                    <div className={twMerge(styles.optionText, 'text-left text-green-600 dark:text-green-400')}>
                        + Ajouter &quot;{trimmedQuery}&quot;
                    </div>
                </div>
            );
        }

        if (option.type === 'customer' && option.customer) {
            const customer = option.customer;
            return (
                <div
                    key={`customer-${customer.id ?? index}`}
                    ref={(el) => {
                        itemRefs.current[index] = el;
                    }}
                    className={twMerge(
                        optionClass,
                        'flex items-center justify-between',
                        highlightedIndex === index && 'bg-active-light dark:bg-active-dark'
                    )}
                    onClick={() => selectOption(index)}
                >
                    <div className={twMerge(styles.optionText, 'flex-1 text-left')}>
                        {customer.firstName} {customer.lastName}
                    </div>
                    {onPrintBalance && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onPrintBalance(customer);
                            }}
                            title="Imprimer le relevé de solde"
                            className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer"
                        >
                            <IconPrinter size={18} />
                        </button>
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Rechercher un client..."
                className={twMerge(
                    'w-full px-3 py-2 bg-transparent border-none outline-none focus:outline-none text-xl font-semibold',
                    'text-popup-dark dark:text-popup-light placeholder:font-normal placeholder:text-gray-400'
                )}
                autoFocus
                maxLength={50}
            />
            <div className="max-h-[55vh] overflow-y-auto">
                {options.map((option, index) => renderOption(option, index))}
            </div>
        </div>
    );
};

export default CustomerSearchPopup;
