'use client';

import { useState, useEffect } from 'react';
import ProductsConfig from '@/app/components/admin/sections/ProductsConfig';
import CategoriesConfig from '@/app/components/admin/sections/CategoriesConfig';
import { Category } from '@/app/utils/interfaces';
import { AdminProduct } from '@/app/components/admin/sections/ProductsConfig';
import { USE_DIGICARTE } from '@/app/utils/constants';
import { useConfig } from '@/app/hooks/useConfig';
import AdminPageLayout from '@/app/components/admin/AdminPageLayout';

export default function EditMenuPage() {
    const { inventory, currencies } = useConfig();
    const [products, setProducts] = useState<AdminProduct[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);

    // Step 1: check DB config once on mount
    useEffect(() => {
        fetch('/api/sql/getDbConfig')
            .then((r) => r.json())
            .then(({ hasDbConfig }) => {
                setIsReadOnly(!hasDbConfig);
                setDbConfigChecked(true);
            })
            .catch(() => {
                setIsReadOnly(true);
                setDbConfigChecked(true);
            });
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            if (!dbConfigChecked) return;
            try {
                if (isReadOnly) {
                    // No DB — use spreadsheet data from useConfig
                    if (inventory?.length && currencies?.length) {
                        const allProducts: AdminProduct[] = [];
                        const allCategories: Category[] = [];

                        inventory.forEach((item) => {
                            if (!allCategories.find((c) => c.label === item.category)) {
                                allCategories.push({
                                    label: item.category,
                                    vat: item.rate,
                                });
                            }
                            item.products.forEach((product) => {
                                allProducts.push({
                                    name: product.label,
                                    category: item.category,
                                    availability: product.availability,
                                    currencies: product.prices.map(String),
                                });
                            });
                        });

                        setProducts(allProducts);
                        setCategories(allCategories);
                        setIsLoading(false);
                    }
                    // else: wait for inventory/currencies to load (dep array will re-run)
                    return;
                }

                // Fetch categories
                const categoriesResponse = await fetch('/api/sql/getCategories');
                const categoriesData = await categoriesResponse.json();

                // Fetch products
                const productsResponse = await fetch('/api/sql/getAllArticles');
                const productsData = await productsResponse.json();

                // Parse categories (skip header row)
                const loadedCategories: Category[] = [];
                if (categoriesData.values && categoriesData.values.length > 1) {
                    for (let i = 1; i < categoriesData.values.length; i++) {
                        const [label, vat] = categoriesData.values[i];
                        loadedCategories.push({
                            label: String(label),
                            vat: Number(vat),
                        });
                    }
                }

                // Parse products (skip header row)
                const loadedProducts: AdminProduct[] = [];
                if (productsData.values && productsData.values.length > 1) {
                    for (let i = 1; i < productsData.values.length; i++) {
                        const [, category, name, unavailable, price] = productsData.values[i];
                        loadedProducts.push({
                            name: String(name),
                            category: String(category),
                            availability: !unavailable, // unavailable is boolean, so availability is opposite
                            currencies: [String(price)], // Single currency for now
                        });
                    }
                }

                setCategories(loadedCategories);
                setProducts(loadedProducts);
            } catch (error) {
                console.error('Error fetching menu data:', error);
                alert('Erreur lors du chargement des données');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [dbConfigChecked, isReadOnly, inventory, currencies]);

    const handleProductsChange = (data: AdminProduct[]) => {
        if (!isReadOnly) {
            setProducts(data);
        }
    };

    const handleCategoriesChange = (data: Category[]) => {
        if (!isReadOnly) {
            setCategories(data);
        }
    };

    const handleProductsSave = async (data: AdminProduct[]) => {
        try {
            // Save products to database via API
            const response = await fetch('/api/sql/updateArticles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: data }),
            });

            if (!response.ok) {
                throw new Error('Failed to save products');
            }

            alert('Produits enregistrés avec succès !');
            window.location.reload();
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            alert("Erreur lors de l'enregistrement des produits.");
        }
    };

    const handleCategoriesSave = async (data: Category[]) => {
        try {
            // Save categories to database via API
            const response = await fetch('/api/sql/updateCategories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories: data }),
            });

            if (!response.ok) {
                throw new Error('Failed to save categories');
            }

            setCategories(data);
            alert('Catégories enregistrées avec succès !');
            window.location.reload();
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            alert("Erreur lors de l'enregistrement des catégories.");
        }
    };

    const categoryOptions = categories.map((c) => ({ label: c.label, value: c.label }));
    const currencyOptions =
        currencies?.length > 0
            ? currencies.map((c) => ({ label: c.symbol, value: c.label }))
            : [{ label: '€', value: 'Euro' }];

    // Redirect if using Digicarte
    if (USE_DIGICARTE) return null;

    if (isLoading) {
        return (
            <AdminPageLayout title="Édition des produits">
                <p>Chargement...</p>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Édition des produits">
            {isReadOnly && (
                <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Mode lecture seule :</strong> La base de données n'est pas configurée. Les modifications
                        ne seront pas enregistrées.
                    </p>
                </div>
            )}

            <div className="space-y-6">
                <CategoriesConfig
                    config={categories}
                    onChange={handleCategoriesChange}
                    onSave={isReadOnly ? undefined : handleCategoriesSave}
                    isReadOnly={isReadOnly}
                />

                <ProductsConfig
                    config={products}
                    onChange={handleProductsChange}
                    onSave={isReadOnly ? undefined : handleProductsSave}
                    categories={categoryOptions}
                    currencies={currencyOptions}
                    isReadOnly={isReadOnly}
                />
            </div>
        </AdminPageLayout>
    );
}
