'use client';

import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import { SHOP_ID } from '@/app/constants/shop';
import { useConfig } from '@/app/hooks/useConfig';
import { useUserRole } from '@/app/hooks/useUserRole';
import {
    DELETED_KEYWORD,
    DEFAULT_VAT_RATE,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    USE_DIGICARTE,
    WAITING_KEYWORD,
} from '@/app/utils/constants';
import '@/app/utils/extensions';
import type { BillingReport, Company, Transaction } from '@/app/utils/interfaces';
import { idbGetAllTransactionSets } from '@/app/utils/transactionStore';
import { printBillingDetail, printBillingSummary } from '@/app/utils/posPrinter';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { LoadingDot } from '../loading';

interface DailySale {
    date: string;
    revenue: number;
}

interface TopProduct {
    label: string;
    category: string;
    quantity: number;
}

interface CategorySale {
    category: string;
    count: number;
}

interface RecentOrder {
    orderId: string;
    shortOrderNumber: string;
    timestamp: number;
    paymentMethod: string;
    status: string;
    amount: number;
}

interface StatisticsData {
    dailySales: DailySale[];
    topProducts: TopProduct[];
    avgBasket: number;
    categorySales: CategorySale[];
    totalOrders: number;
    recentOrders: RecentOrder[];
}

export default function StatsPage() {
    const { isCashier } = useUserRole();
    const { parameters, currencies, currencyIndex, getPrinterAddresses } = useConfig();
    const currency = currencies[currencyIndex];
    const shop = parameters.shop;

    const [stats, setStats] = useState<StatisticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const maxDate = new Date().toISOString().split('T')[0];
    const hasLoadedRef = useRef(false);

    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE);
    const [billingReport, setBillingReport] = useState<BillingReport | null>(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingError, setBillingError] = useState('');

    type DatePreset = 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'ytd';

    const applyDatePreset = useCallback((preset: DatePreset) => {
        const end = new Date();
        const start = new Date();

        switch (preset) {
            case 'week':
                start.setDate(start.getDate() - 7);
                break;
            case 'month':
                start.setMonth(start.getMonth() - 1);
                break;
            case 'quarter':
                start.setMonth(start.getMonth() - 3);
                break;
            case 'semester':
                start.setMonth(start.getMonth() - 6);
                break;
            case 'year':
                start.setFullYear(start.getFullYear() - 1);
                break;
            case 'ytd':
                start.setMonth(0, 1); // January 1st of current year
                break;
        }

        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        setStartDate(startStr);
        setEndDate(endStr);
    }, []);

    useEffect(() => {
        // Set default dates (last 30 days)
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);

        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        setStartDate(startStr);
        setEndDate(endStr);
    }, []);

    const formatDate = (date: Date) =>
        date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

    const computeStatsFromIdb = useCallback(async () => {
        const nonPaidMethods = new Set([DELETED_KEYWORD, REFUND_KEYWORD, WAITING_KEYWORD, PROCESSING_KEYWORD]);
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;

        const sets = await idbGetAllTransactionSets(SHOP_ID);
        const paid: Transaction[] = [];
        const all: Transaction[] = [];

        for (const set of sets) {
            for (const tx of set.transactions) {
                const d = tx.createdDate;
                if (d < start || d > end) continue;
                all.push(tx);
                if (!nonPaidMethods.has(tx.method)) paid.push(tx);
            }
        }

        // 1. Daily revenue
        const dailyMap = new Map<string, number>();
        for (const tx of paid) {
            const key = new Date(tx.createdDate).toISOString().split('T')[0];
            dailyMap.set(key, (dailyMap.get(key) ?? 0) + tx.amount);
        }
        const dailySales: DailySale[] = Array.from(dailyMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, revenue]) => ({
                date: formatDate(new Date(date)),
                revenue: Math.round(revenue * 100) / 100,
            }));

        // 2. Top 10 products
        const productMap = new Map<string, TopProduct>();
        for (const tx of paid) {
            for (const p of tx.products) {
                const key = p.label + '|' + p.category;
                const existing = productMap.get(key);
                if (existing) {
                    existing.quantity += p.quantity;
                } else {
                    productMap.set(key, { label: p.label, category: p.category, quantity: p.quantity });
                }
            }
        }
        const topProducts: TopProduct[] = Array.from(productMap.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        // 3. Average basket
        const avgBasket = paid.length > 0 ? paid.reduce((s, tx) => s + tx.amount, 0) / paid.length : 0;

        // 4. Sales by category
        const categoryMap = new Map<string, number>();
        for (const tx of paid) {
            for (const p of tx.products) {
                const cat = p.category || 'Non catégorisé';
                categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + p.quantity);
            }
        }
        const categorySales: CategorySale[] = Array.from(categoryMap.entries())
            .sort(([, a], [, b]) => b - a)
            .map(([category, count]) => ({ category, count }));

        // 5. Total orders
        const totalOrders = paid.length;

        // 6. Recent orders (last 20 from all)
        const recentOrders: RecentOrder[] = all
            .sort((a, b) => b.createdDate - a.createdDate)
            .slice(0, 20)
            .map((tx) => ({
                orderId: String(tx.createdDate),
                shortOrderNumber: tx.shortNumOrder || '-',
                timestamp: tx.createdDate,
                paymentMethod: tx.method,
                status: nonPaidMethods.has(tx.method) ? 'Non payé' : 'Payé',
                amount: tx.amount,
            }));

        setStats({
            dailySales,
            topProducts,
            avgBasket: Number(avgBasket.toFixed(2)),
            categorySales,
            totalOrders,
            recentOrders,
        });
    }, [startDate, endDate]);

    const fetchStatistics = useCallback(
        async (showLoading = true) => {
            // If showing loading, only show it if data takes longer than 100ms to load
            let loadingTimeout: NodeJS.Timeout | null = null;
            if (showLoading) {
                loadingTimeout = setTimeout(() => setLoading(true), 100);
            }

            try {
                // First, load from IndexedDB for immediate display
                if (!USE_DIGICARTE) {
                    await computeStatsFromIdb();
                    return;
                }

                // Then, fetch from DB for fresh data
                const response = await fetch(`/api/sql/getStatistics?startDate=${startDate}&endDate=${endDate}`);
                const data = await response.json();

                if (data.dailySales) {
                    data.dailySales = data.dailySales.map((sale: DailySale) => ({
                        ...sale,
                        date: new Date(sale.date).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                        }),
                    }));
                }

                setStats(data);
            } catch (error) {
                console.error('Error fetching statistics:', error);
                // If DB fetch fails, we still have IndexedDB data, so no alert needed
            } finally {
                if (loadingTimeout) clearTimeout(loadingTimeout);
                if (showLoading) setLoading(false);
            }
        },
        [startDate, endDate, computeStatsFromIdb]
    );

    const fetchStatisticsRef = useRef(fetchStatistics);
    fetchStatisticsRef.current = fetchStatistics;

    // Initial load with loading indicator
    useEffect(() => {
        if (!hasLoadedRef.current) {
            hasLoadedRef.current = true;
            fetchStatistics(true);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-update on date change without loading indicator
    useEffect(() => {
        if (hasLoadedRef.current && startDate && endDate) {
            fetchStatistics(false);
        }
    }, [startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load companies for billing report
    useEffect(() => {
        const fetchCompanies = async () => {
            try {
                const response = await fetch('/api/sql/getCompanies');
                const data = await response.json();
                if (data.companies) {
                    setCompanies(data.companies);
                    if (data.companies.length > 0) {
                        setSelectedCompany(data.companies[0].name);
                    }
                }
            } catch (error) {
                console.error('Error fetching companies:', error);
            }
        };
        fetchCompanies();
    }, []);

    const generateBillingReport = useCallback(async () => {
        if (!selectedCompany || !startDate || !endDate) return;

        setBillingLoading(true);
        setBillingError('');
        setBillingReport(null);

        try {
            const params = new URLSearchParams({
                companyName: selectedCompany,
                startDate,
                endDate,
                vatRate: String(vatRate),
            });
            const response = await fetch(`/api/sql/getBillingReport?${params.toString()}`);
            const data = await response.json();

            if (!response.ok || data.error) {
                setBillingError(data.error || 'Une erreur est survenue');
                return;
            }

            setBillingReport(data.report);
        } catch (error) {
            console.error('Error generating billing report:', error);
            setBillingError('Impossible de générer le rapport de facturation');
        } finally {
            setBillingLoading(false);
        }
    }, [selectedCompany, startDate, endDate, vatRate]);

    const handlePrintSummary = useCallback(() => {
        if (!billingReport || !currency || !shop) return;
        const addresses = getPrinterAddresses();
        printBillingSummary(addresses, billingReport, shop, currency);
    }, [billingReport, currency, getPrinterAddresses, shop]);

    const handlePrintDetail = useCallback(() => {
        if (!billingReport || !currency || !shop) return;
        const addresses = getPrinterAddresses();
        printBillingDetail(addresses, billingReport, shop, currency);
    }, [billingReport, currency, getPrinterAddresses, shop]);

    // Redirect to Grafana dashboard if using Digicarte
    if (USE_DIGICARTE) {
        if (typeof window !== 'undefined') window.location.href = '/stats/d/vue-dc-1/vue-dc';

        return null;
    }

    if (loading) {
        return (
            <AdminPageLayout title="Statistiques">
                <LoadingDot fullscreen />
            </AdminPageLayout>
        );
    }

    // Check access - admin and cashier only
    if (!isCashier) {
        return (
            <AdminPageLayout title="Statistiques">
                <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                    <p className="text-red-800 dark:text-red-200">
                        <strong>Accès refusé :</strong> Cette page est réservée aux administrateurs et caissiers.
                    </p>
                </div>
            </AdminPageLayout>
        );
    }

    if (!stats) {
        return (
            <AdminPageLayout title="Statistiques">
                <p>Aucune donnée disponible</p>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Statistiques">
            {/* Date filters */}
            <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <div className="flex gap-4 items-center mb-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Date de début</label>
                        <input
                            type="date"
                            value={startDate}
                            max={maxDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Date de fin</label>
                        <input
                            type="date"
                            value={endDate}
                            max={maxDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => applyDatePreset('week')}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded text-sm flex-1 min-w-20"
                    >
                        Semaine
                    </button>
                    <button
                        onClick={() => applyDatePreset('month')}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded text-sm flex-1 min-w-20"
                    >
                        Mois
                    </button>
                    <button
                        onClick={() => applyDatePreset('quarter')}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded text-sm flex-1 min-w-20"
                    >
                        Trimestre
                    </button>
                    <button
                        onClick={() => applyDatePreset('semester')}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded text-sm flex-1 min-w-20"
                    >
                        Semestre
                    </button>
                    <button
                        onClick={() => applyDatePreset('year')}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded text-sm flex-1 min-w-20"
                    >
                        Année
                    </button>
                    <button
                        onClick={() => applyDatePreset('ytd')}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded text-sm flex-1 min-w-20"
                    >
                        {new Date().getFullYear()}
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h3 className="text-sm font-semibold mb-1">Panier Moyen</h3>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        €{stats.avgBasket.toFixed(2)}
                    </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h3 className="text-sm font-semibold mb-1">Nombre de commandes</h3>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalOrders}</p>
                </div>
            </div>

            {/* Billing Report Section */}
            <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4">Facturation entreprise</h2>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Entreprise</label>
                        <select
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                        >
                            {companies.length === 0 && <option value="">Aucune entreprise</option>}
                            {companies.map((company) => (
                                <option key={company.id || company.name} value={company.name}>
                                    {company.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="w-32">
                        <label className="block text-sm font-medium mb-1">TVA (%)</label>
                        <input
                            type="number"
                            value={vatRate}
                            min={0}
                            step={0.5}
                            onChange={(e) => setVatRate(Number(e.target.value))}
                            className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={generateBillingReport}
                            disabled={billingLoading || !selectedCompany || !startDate || !endDate}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded"
                        >
                            {billingLoading ? 'Calcul...' : 'Calculer'}
                        </button>
                    </div>
                </div>

                {billingError && (
                    <div className="p-3 mb-4 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded">
                        {billingError}
                    </div>
                )}

                {billingReport && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded">
                                <p className="text-sm text-gray-600 dark:text-gray-300">Compte n°</p>
                                <p className="text-lg font-bold">{billingReport.companyId}</p>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded">
                                <p className="text-sm text-gray-600 dark:text-gray-300">Prix / Quote part</p>
                                <p className="text-lg font-bold">{billingReport.mealPrice.toFixed(2)} €</p>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded">
                                <p className="text-sm text-gray-600 dark:text-gray-300">Total repas</p>
                                <p className="text-lg font-bold">{billingReport.mealCount}</p>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded">
                                <p className="text-sm text-gray-600 dark:text-gray-300">Total HT</p>
                                <p className="text-lg font-bold">{billingReport.totalHT.toFixed(2)} €</p>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded">
                                <p className="text-sm text-gray-600 dark:text-gray-300">Total TVA</p>
                                <p className="text-lg font-bold">{billingReport.totalTVA.toFixed(2)} €</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handlePrintSummary}
                                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                            >
                                Imprimer total TVA
                            </button>
                            <button
                                onClick={handlePrintDetail}
                                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                            >
                                Imprimer détail par salarié
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b dark:border-gray-700">
                                        <th className="text-left py-2">N° Cpt</th>
                                        <th className="text-left py-2">Désignation</th>
                                        <th className="text-right py-2">Qté</th>
                                        <th className="text-right py-2">CA</th>
                                        <th className="text-right py-2">TVA</th>
                                        <th className="text-right py-2">TTC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {billingReport.customers.map((customer) => (
                                        <tr key={customer.customerId} className="border-b dark:border-gray-700">
                                            <td className="py-2 font-mono">
                                                {customer.reference || String(customer.customerId).padStart(6, '0')}
                                            </td>
                                            <td className="py-2">
                                                {customer.lastName} {customer.firstName}
                                            </td>
                                            <td className="py-2 text-right">{customer.mealCount}</td>
                                            <td className="py-2 text-right">{customer.totalAmount.toFixed(2)} €</td>
                                            <td className="py-2 text-right">{customer.totalTVA.toFixed(2)} €</td>
                                            <td className="py-2 text-right">{customer.totalAmount.toFixed(2)} €</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="font-bold border-b dark:border-gray-700">
                                        <td className="py-2">Total</td>
                                        <td className="py-2" />
                                        <td className="py-2 text-right">{billingReport.mealCount}</td>
                                        <td className="py-2 text-right">{billingReport.totalAmount.toFixed(2)} €</td>
                                        <td className="py-2 text-right">{billingReport.totalTVA.toFixed(2)} €</td>
                                        <td className="py-2 text-right">{billingReport.totalAmount.toFixed(2)} €</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Daily Revenue Chart */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
                <h2 className="text-xl font-bold mb-4">Chiffre d'affaires par jour</h2>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={stats.dailySales}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any) => {
                                if (typeof value === 'number') {
                                    return value.toShortCurrency(2, '€');
                                }
                                return value;
                            }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="revenue" stroke="#22c55e" name="Chiffre d'affaires" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Top Products and Category Sales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Top 10 Products */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4">Top 10 Produits Vendus</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b dark:border-gray-700">
                                    <th className="text-left py-2">Produit</th>
                                    <th className="text-left py-2">Quantité Vendue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.topProducts.map((product, index) => (
                                    <tr key={index} className="border-b dark:border-gray-700">
                                        <td className="py-2">{product.label}</td>
                                        <td className="py-2">{product.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Sales by Category */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4">Ventes par Catégorie</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.categorySales}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="category" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#3b82f6" name="nombre" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4">Dernières Commandes</h2>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b dark:border-gray-700">
                                <th className="text-left py-2">Date</th>
                                <th className="text-left py-2">Paiement</th>
                                <th className="text-right py-2">Montant</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.recentOrders.map((order, index) => (
                                <tr key={index} className="border-b dark:border-gray-700">
                                    <td className="py-2">
                                        {order.timestamp
                                            ? new Date(order.timestamp).toLocaleString('fr-FR')
                                            : 'Invalid Date'}
                                    </td>
                                    <td className="py-2">{order.paymentMethod}</td>
                                    <td className="py-2 text-right">€{order.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AdminPageLayout>
    );
}
