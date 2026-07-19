import { Customer, Transaction } from '@/app/utils/interfaces';
import { useData } from '@/app/hooks/useData';
import { usePopup } from '@/app/hooks/usePopup';
import { useEffect, useState } from 'react';
import { BACK_KEYWORD, PROVISION_KEYWORD } from '@/app/utils/constants';

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
    const [balance, setBalance] = useState<number>(customer.balance ?? 0);
    const [history, setHistory] = useState<BalanceEntry[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [purchaseCount, setPurchaseCount] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    const [totalDiscount, setTotalDiscount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const customerName = `${customer.firstName} ${customer.lastName}`.trim();

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
                    const transactionsValue = customerTransactions ?? [];
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
            `${customer.firstName} ${customer.lastName}`,
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
            const lines = [PROVISION_KEYWORD, '', BACK_KEYWORD];
            openFullscreenPopup(title, lines, (_, option) => {
                if (option === BACK_KEYWORD) openCustomerDetails();
            });
            return;
        }

        openFullscreenPopup(
            title,
            transaction.products
                .map((product) => displayProduct(product, transaction.currency))
                .concat(['', BACK_KEYWORD]),
            (_, option) => {
                if (option === BACK_KEYWORD) {
                    openCustomerDetails();
                }
            }
        );
    };

    const getTransactionLabel = (transaction: Transaction) => {
        if (transaction.products.length === 0) return PROVISION_KEYWORD;
        return `${transaction.products.length} article${transaction.products.length > 1 ? 's' : ''}`;
    };

    return (
        <div className="p-4 text-left space-y-4 text-gray-900 dark:text-gray-100">
            {isLoading ? (
                <p className="text-center">Chargement...</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-0">
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
                            <p className="text-sm text-gray-500 dark:text-gray-400">Référence</p>
                            <p className="text-sm md:text-base font-semibold break-all">{customer.reference || '—'}</p>
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
                    <div>
                        {transactions.length > 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-300 dark:border-gray-600">
                                10 dernières opérations
                            </p>
                        )}
                        <ul className="space-y-2 max-h-64 overflow-y-auto pt-2">
                            {transactions.length === 0 ? (
                                <li className="text-sm text-gray-500 dark:text-gray-400">Aucune opération</li>
                            ) : (
                                transactions.map((transaction, index) => (
                                    <li
                                        key={index}
                                        className="flex justify-between border-b border-gray-200 dark:border-gray-700 py-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 cursor-pointer"
                                        onClick={() => openTransactionDetails(transaction)}
                                    >
                                        <span className="text-sm">
                                            {new Date(transaction.createdDate).toLocaleString('fr-FR')} -{' '}
                                            {getTransactionLabel(transaction)}
                                        </span>
                                        <span className="text-sm font-medium">
                                            {transaction.products.length === 0
                                                ? getBalanceChangeText(transaction)
                                                : toCurrency(transaction)}
                                        </span>
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
