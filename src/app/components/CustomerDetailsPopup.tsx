import { Customer, Transaction } from '@/app/utils/interfaces';
import { useData } from '@/app/hooks/useData';
import { usePopup } from '@/app/hooks/usePopup';
import { useEffect, useState } from 'react';
import {
    BACK_KEYWORD,
    PROVISION_KEYWORD,
    PRINT_KEYWORD,
    PRINT_NO_DETAIL,
    PRINT_WITH_DETAIL,
} from '@/app/utils/constants';
import { isProcessingTransaction } from '@/app/contexts/dataProvider/transactionHelpers';
import { computeFidelityDelta } from '@/app/utils/fidelity';
import { useConfig } from '@/app/hooks/useConfig';
import { usePay } from '@/app/hooks/usePay';
import { IconPrinter } from '@tabler/icons-react';

interface BalanceEntry {
    amount: number;
    operation: 'credit' | 'debit' | 'deleted';
    previous_balance: number;
    new_balance: number;
    created_at: string;
}

interface CachedDetails {
    balance: number;
    history: BalanceEntry[];
    transactions: Transaction[];
    purchaseCount: number;
    totalAmount: number;
    totalDiscount: number;
    timestamp: number;
}

const CACHE_TTL_MS = 30000;
const customerDetailsCache = new Map<number, CachedDetails>();

interface CustomerDetailsPopupProps {
    customer: Customer;
}

export default function CustomerDetailsPopup({ customer }: CustomerDetailsPopupProps) {
    const { toCurrency, displayProduct } = useData();
    const { openFullscreenPopup } = usePopup();
    const { parameters } = useConfig();
    const { printTransaction } = usePay();
    const [balance, setBalance] = useState<number>(customer.balance ?? 0);
    const [history, setHistory] = useState<BalanceEntry[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [purchaseCount, setPurchaseCount] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    const [totalDiscount, setTotalDiscount] = useState(0);
    const [isLoading, setIsLoading] = useState(() => !customerDetailsCache.has(customer.id ?? -1));

    const customerName = `${customer.firstName} ${customer.lastName}`.trim();
    const companySuffix = customer.company ? ` (${customer.company})` : '';

    const customerId = customer.id;

    useEffect(() => {
        if (!customerId || !customerName) return;

        const cached = customerDetailsCache.get(customerId);
        const shouldFetch = !cached || Date.now() - cached.timestamp > CACHE_TTL_MS;

        if (cached) {
            setBalance(cached.balance);
            setHistory(cached.history);
            setTransactions(cached.transactions);
            setPurchaseCount(cached.purchaseCount);
            setTotalAmount(cached.totalAmount);
            setTotalDiscount(cached.totalDiscount);
        }

        if (!shouldFetch) return;

        setIsLoading(true);
        Promise.all([
            fetch(`/api/sql/getCustomerBalance?customerId=${customerId}`).then((res) => res.json()),
            fetch(
                `/api/sql/getCustomerTransactions?customerName=${encodeURIComponent(customerName)}&customerId=${customerId}`
            ).then((res) => res.json()),
        ])
            .then(
                ([
                    { balance: currentBalance, history: currentHistory },
                    {
                        transactions: customerTransactions,
                        purchaseCount: count,
                        totalAmount: amount,
                        totalDiscount: discount,
                    },
                ]: [
                    { balance: number; history: BalanceEntry[] },
                    { transactions: Transaction[]; purchaseCount: number; totalAmount: number; totalDiscount: number },
                ]) => {
                    const balanceValue = Number(currentBalance ?? 0);
                    const historyValue = (currentHistory ?? []).map((entry) => ({
                        ...entry,
                        amount: Number(entry.amount),
                        previous_balance: Number(entry.previous_balance),
                        new_balance: Number(entry.new_balance),
                    }));
                    const transactionsValue = (customerTransactions ?? []).filter(
                        (t: Transaction) => !isProcessingTransaction(t)
                    );
                    const purchaseCountValue = Number(count ?? 0);
                    const totalAmountValue = Number(amount ?? 0);
                    const totalDiscountValue = Number(discount ?? 0);

                    setBalance(balanceValue);
                    setHistory(historyValue);
                    setTransactions(transactionsValue);
                    setPurchaseCount(purchaseCountValue);
                    setTotalAmount(totalAmountValue);
                    setTotalDiscount(totalDiscountValue);

                    customerDetailsCache.set(customerId, {
                        balance: balanceValue,
                        history: historyValue,
                        transactions: transactionsValue,
                        purchaseCount: purchaseCountValue,
                        totalAmount: totalAmountValue,
                        totalDiscount: totalDiscountValue,
                        timestamp: Date.now(),
                    });
                }
            )
            .catch((error) => console.error('Failed to load customer details:', error))
            .finally(() => setIsLoading(false));
    }, [customerId, customerName]);

    const clientSince = history.length > 0 ? history[history.length - 1].created_at : null;

    const openCustomerDetails = () => {
        openFullscreenPopup(
            `${customer.firstName} ${customer.lastName}${companySuffix}`,
            [<CustomerDetailsPopup key="details" customer={customer} />],
            () => {},
            true
        );
    };

    const getBalanceChangeText = (transaction: Transaction) => {
        if (transaction.previousBalance == null || transaction.newBalance == null) return '—';
        return `${toCurrency({
            amount: transaction.previousBalance,
            currency: transaction.currency,
        })} -> ${toCurrency({
            amount: transaction.newBalance,
            currency: transaction.currency,
        })}`;
    };

    const openTransactionDetails = (transaction: Transaction) => {
        const isProvision = transaction.products.length === 0;
        const title =
            toCurrency(transaction) +
            ' en ' +
            transaction.method +
            (transaction.shortNumOrder ? ` [#${transaction.shortNumOrder}]` : '');

        if (isProvision) {
            const lines = [PROVISION_KEYWORD, '', PRINT_KEYWORD + PRINT_WITH_DETAIL, '', BACK_KEYWORD];
            openFullscreenPopup(title, lines, (_, option) => {
                if (option === PRINT_KEYWORD + PRINT_WITH_DETAIL) {
                    printTransaction(transaction, true);
                    return;
                }
                if (option === BACK_KEYWORD) openCustomerDetails();
            });
            return;
        }

        openFullscreenPopup(
            title,
            transaction.products
                .map((product) => displayProduct(product, transaction.currency))
                .concat(['', PRINT_KEYWORD + PRINT_WITH_DETAIL, PRINT_KEYWORD + PRINT_NO_DETAIL, '', BACK_KEYWORD]),
            (_, option) => {
                if (option === PRINT_KEYWORD + PRINT_WITH_DETAIL) {
                    printTransaction(transaction, true);
                    return;
                }
                if (option === PRINT_KEYWORD + PRINT_NO_DETAIL) {
                    printTransaction(transaction, false);
                    return;
                }
                if (option === BACK_KEYWORD) {
                    openCustomerDetails();
                }
            }
        );
    };

    const getFidelityText = (transaction: Transaction) => {
        const delta = computeFidelityDelta(
            transaction.method,
            transaction.amount,
            transaction.fidelityPointsUsed ?? 0,
            parameters.fidelityRate ?? 0,
            Boolean(transaction.products?.length)
        );
        if (delta === 0) return null;
        const sign = delta > 0 ? '+' : '';
        return `${sign}${delta.toFixed(2)} pts`;
    };

    const getTransactionLabel = (transaction: Transaction) => {
        if (transaction.products.length === 0) return PROVISION_KEYWORD;
        return `${transaction.products.length} article${transaction.products.length > 1 ? 's' : ''}`;
    };

    return (
        <div className="p-4 text-left space-y-4 text-gray-900 dark:text-gray-100 w-full">
            {isLoading ? (
                <p className="text-center">Chargement...</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 w-full">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Solde actuel</p>
                            <p
                                className={
                                    'text-lg font-semibold' +
                                    (balance < 0 ? ' text-red-600 dark:text-red-400 animate-pulse' : '')
                                }
                            >
                                {balance < 0 ? `- ${toCurrency(balance)}` : toCurrency(balance)}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Points de fidélité</p>
                            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                                {(customer.fidelityPoints ?? 0).toFixed(2)} pts
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Référence</p>
                            <p className="text-lg font-semibold break-all">{customer.reference || '—'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nombre d&apos;achats</p>
                            <p className="text-lg font-semibold">{purchaseCount}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Montant total</p>
                            <p className="text-lg font-semibold">{toCurrency(totalAmount)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Client depuis</p>
                            <p className="text-lg font-semibold">
                                {clientSince ? new Date(clientSince).toLocaleDateString('fr-FR') : '—'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Remises total</p>
                            <p className="text-lg font-semibold">{toCurrency(totalDiscount)}</p>
                        </div>
                    </div>
                    <div className="w-full">
                        {transactions.length > 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-300 dark:border-gray-600">
                                10 dernières opérations
                            </p>
                        )}
                        <ul className="space-y-2 max-h-64 overflow-y-auto pt-2 w-full">
                            {transactions.length === 0 ? (
                                <li className="text-sm text-gray-500 dark:text-gray-400">Aucune opération</li>
                            ) : (
                                transactions.map((transaction, index) => (
                                    <li
                                        key={index}
                                        className="flex justify-between border-b border-gray-200 dark:border-gray-700 py-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 cursor-pointer w-full"
                                        onClick={() => openTransactionDetails(transaction)}
                                    >
                                        <span className="text-sm wrap-break-word">
                                            {new Date(transaction.createdDate).toLocaleString('fr-FR')} -{' '}
                                            {getTransactionLabel(transaction)}
                                        </span>
                                        <span className="text-sm font-medium shrink-0 pl-2">
                                            {transaction.products.length === 0
                                                ? getBalanceChangeText(transaction)
                                                : toCurrency(transaction)}
                                        </span>
                                        {getFidelityText(transaction) && (
                                            <span className="text-xs shrink-0 pl-2 text-green-600 dark:text-green-400">
                                                {getFidelityText(transaction)}
                                            </span>
                                        )}
                                        <button
                                            className="shrink-0 pl-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                printTransaction(transaction, true);
                                            }}
                                            title="Imprimer"
                                        >
                                            <IconPrinter size={18} />
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
}
