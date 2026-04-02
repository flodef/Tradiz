'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    DELETED_KEYWORD,
    REFUND_KEYWORD,
    WAITING_KEYWORD,
    PROCESSING_KEYWORD,
    USE_DIGICARTE,
} from '@/app/utils/constants';
import { idbGetAllTransactionSets } from '@/app/utils/transactionStore';
import type { Transaction } from '@/app/utils/interfaces';
import AdminPageLayout from '@/app/components/admin/AdminPageLayout';

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
    const [stats, setStats] = useState<StatisticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        // Set default dates (last 30 days)
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);

        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    }, []);

    const formatDate = (date: Date) =>
        date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

    const computeStatsFromIdb = useCallback(async () => {
        const nonPaidMethods = new Set([DELETED_KEYWORD, REFUND_KEYWORD, WAITING_KEYWORD, PROCESSING_KEYWORD]);
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;

        const sets = await idbGetAllTransactionSets();
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
            .map(([date, revenue]) => ({ date: formatDate(new Date(date)), revenue }));

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

    const fetchStatistics = useCallback(async () => {
        setLoading(true);
        try {
            if (!USE_DIGICARTE) {
                await computeStatsFromIdb();
                return;
            }

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
            alert('Erreur lors du chargement des statistiques');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, computeStatsFromIdb]);

    useEffect(() => {
        if (startDate && endDate) {
            fetchStatistics();
        }
    }, [startDate, endDate, fetchStatistics]);

    // Redirect if using Digicarte (after all hooks)
    if (USE_DIGICARTE) return null;

    if (loading) {
        return (
            <AdminPageLayout title="Statistiques">
                <p>Chargement...</p>
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
            <div className="mb-6 flex gap-4 items-center bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <div>
                    <label className="block text-sm font-medium mb-1">Date de début</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Date de fin</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    />
                </div>
                <button
                    onClick={fetchStatistics}
                    className="mt-6 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Actualiser
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-2">Panier Moyen</h3>
                    <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                        €{stats.avgBasket.toFixed(2)}
                    </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-2">Nombre de commandes</h3>
                    <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{stats.totalOrders}</p>
                </div>
            </div>

            {/* Daily Revenue Chart */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
                <h2 className="text-xl font-bold mb-4">Chiffre d'affaires par jour</h2>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={stats.dailySales}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
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
                                <th className="text-left py-2">N° Commande</th>
                                <th className="text-left py-2">N° Court</th>
                                <th className="text-left py-2">Date</th>
                                <th className="text-left py-2">Type Service</th>
                                <th className="text-left py-2">Statut</th>
                                <th className="text-right py-2">Montant</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.recentOrders.map((order, index) => (
                                <tr key={index} className="border-b dark:border-gray-700">
                                    <td className="py-2">{order.orderId}</td>
                                    <td className="py-2">{order.shortOrderNumber}</td>
                                    <td className="py-2">
                                        {order.timestamp
                                            ? new Date(order.timestamp).toLocaleString('fr-FR')
                                            : 'Invalid Date'}
                                    </td>
                                    <td className="py-2">{order.paymentMethod}</td>
                                    <td className="py-2">
                                        <span
                                            className={`px-2 py-1 rounded text-sm ${
                                                order.status === 'Payé'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                            }`}
                                        >
                                            {order.status}
                                        </span>
                                    </td>
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
