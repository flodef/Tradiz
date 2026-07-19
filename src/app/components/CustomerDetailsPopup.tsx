import { Customer, Transaction } from '@/app/utils/interfaces';
import { useData } from '@/app/hooks/useData';
import { usePopup } from '@/app/hooks/usePopup';
import { useEffect, useState } from 'react';
import { BACK_KEYWORD, PROVISION_KEYWORD } from '@/app/utils/constants';

interface BalanceEntry {
    amount: number;
    operation: 'credit' | 'debit';
    previous_balance: number;
    new_balance: number;
    created_at: string;
}

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
    const [totalDiscount, setTotalDiscount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const customerName = `${customer.firstName} ${customer.lastName}`.trim();

    useEffect(() => {
        if (!customer.id || !customerName) return;
        setIsLoading(true);
        Promise.all([
            fetch(`/api/sql/getCustomerBalance?customerId=${customer.id}`).then((res) => res.json()),
            fetch(`/api/sql/getCustomerTransactions?customerName=${encodeURIComponent(customerName)}`).then((res) =>
                res.json()
            ),
        ])
            .then(
                ([
                    { balance: currentBalance, history: currentHistory },
                    { transactions: customerTransactions, purchaseCount: count, totalDiscount: discount },
                ]: [
                    { balance: number; history: BalanceEntry[] },
                    { transactions: Transaction[]; purchaseCount: number; totalDiscount: number },
                ]) => {
                    setBalance(Number(currentBalance ?? 0));
                    setHistory(
                        (currentHistory ?? []).map((entry) => ({
                            ...entry,
                            amount: Number(entry.amount),
                            previous_balance: Number(entry.previous_balance),
                            new_balance: Number(entry.new_balance),
                        }))
                    );
                    setTransactions(customerTransactions ?? []);
                    setPurchaseCount(Number(count ?? 0));
                    setTotalDiscount(Number(discount ?? 0));
                }
            )
            .catch((error) => console.error('Failed to load customer details:', error))
            .finally(() => setIsLoading(false));
    }, [customer.id, customerName]);

    const totalAmount = history.reduce((sum, entry) => sum + entry.amount, 0);
    const clientSince = history.length > 0 ? history[history.length - 1].created_at : null;

    const openCustomerDetails = () => {
        openFullscreenPopup(
            `${customer.firstName} ${customer.lastName}`,
            [<CustomerDetailsPopup key="details" customer={customer} />],
            () => {},
            true
        );
    };

    const openTransactionDetails = (transaction: Transaction) => {
        const isProvision = transaction.products.length === 0;
        const productLines = isProvision
            ? [PROVISION_KEYWORD + ' : ' + toCurrency(transaction)]
            : transaction.products.map((product) => displayProduct(product, transaction.currency));

        openFullscreenPopup(
            toCurrency(transaction) +
                ' en ' +
                transaction.method +
                (transaction.shortNumOrder ? ` [#${transaction.shortNumOrder}]` : ''),
            productLines.concat(['', BACK_KEYWORD]),
            (_, option) => {
                if (option === BACK_KEYWORD) {
                    openCustomerDetails();
                }
            },
            true
        );
    };

    const getTransactionLabel = (transaction: Transaction) => {
        if (transaction.products.length === 0) return 'Provision';
        return `${transaction.products.length} article${transaction.products.length > 1 ? 's' : ''}`;
    };

    return (
        <div className="p-4 text-left space-y-4 text-gray-900 dark:text-gray-100">
            {isLoading ? (
                <p className="text-center">Chargement...</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Solde actuel</p>
                            <p className="text-lg font-semibold">{toCurrency(balance)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Référence</p>
                            <p className="text-lg font-semibold">{customer.reference || '—'}</p>
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
                    <h3 className="text-lg font-semibold border-b border-gray-300 dark:border-gray-600 pb-2">
                        10 dernières opérations
                    </h3>
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                        {transactions.length === 0 ? (
                            <li className="text-sm text-gray-500 dark:text-gray-400">Aucune opération</li>
                        ) : (
                            transactions.map((transaction, index) => (
                                <li
                                    key={index}
                                    className="flex justify-between border-b border-gray-200 dark:border-gray-700 py-1 cursor-pointer"
                                    onClick={() => openTransactionDetails(transaction)}
                                >
                                    <span className="text-sm">
                                        {new Date(transaction.createdDate).toLocaleString('fr-FR')} -{' '}
                                        {getTransactionLabel(transaction)}
                                    </span>
                                    <span className="text-sm font-medium">{toCurrency(transaction)}</span>
                                </li>
                            ))
                        )}
                    </ul>
                </>
            )}
        </div>
    );
}
