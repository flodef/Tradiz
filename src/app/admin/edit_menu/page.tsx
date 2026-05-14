'use client';

import { useState, useEffect } from 'react';
import ProductsConfig from '@/app/components/admin/sections/ProductsConfig';
import CategoriesConfig from '@/app/components/admin/sections/CategoriesConfig';
import { Category } from '@/app/utils/interfaces';
import { ProductsSettings } from '@/app/contexts/ConfigProvider';
import { AdminProduct } from '@/app/components/admin/sections/ProductsConfig';
import { USE_DIGICARTE } from '@/app/utils/constants';
import { useConfig } from '@/app/hooks/useConfig';
import { useUserRole } from '@/app/hooks/useUserRole';
import { usePopup } from '@/app/hooks/usePopup';
import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import { LoadingDot } from '@/app/loading';

export default function EditMenuPage() {
    const { inventory, currencies, parameters } = useConfig();
    const { isCashier } = useUserRole();
    const { openFullscreenPopup } = usePopup();
    const [products, setProducts] = useState<AdminProduct[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [originalProducts, setOriginalProducts] = useState<AdminProduct[]>([]);
    const [originalCategories, setOriginalCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);
    const [isSavingCategories, setIsSavingCategories] = useState(false);
    const [isSavingProducts, setIsSavingProducts] = useState(false);
    const [productsSettings, setProductsSettings] = useState<ProductsSettings | undefined>(parameters?.products);
    const [openSection, setOpenSection] = useState<string | null>(null);

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
                                    stock: product.stock ?? 0,
                                    currencies: product.prices.map(String),
                                });
                            });
                        });

                        setProducts(allProducts);
                        setCategories(allCategories);
                        setOriginalProducts(allProducts);
                        setOriginalCategories(allCategories);
                        setIsLoading(false);
                    }
                    // else: wait for inventory/currencies to load (dep array will re-run)
                    return;
                }

                // Fetch categories, products, and parameters in parallel
                const [categoriesResponse, productsResponse, parametersResponse] = await Promise.all([
                    fetch('/api/sql/getCategories'),
                    fetch('/api/sql/getAllArticles'),
                    fetch('/api/sql/getParameters'),
                ]);
                const categoriesData = await categoriesResponse.json();
                const productsData = await productsResponse.json();
                const parametersData = await parametersResponse.json();

                // Parse productsSettings from parameters
                if (parametersData.values) {
                    const paramMap = new Map<string, string>();
                    parametersData.values.forEach(([key, value]: [string, string]) => {
                        paramMap.set(key, value);
                    });
                    const raw = paramMap.get('productsSettings');
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && typeof parsed === 'object') {
                                setProductsSettings({
                                    useVatPerProduct: parsed.useVatPerProduct ?? false,
                                    useReference: parsed.useReference ?? false,
                                    useStock: parsed.useStock ?? false,
                                    usePhoto: parsed.usePhoto ?? false,
                                    useDescription: parsed.useDescription ?? false,
                                    useOptions: parsed.useOptions ?? false,
                                });
                            }
                        } catch {
                            // Invalid JSON, keep default
                        }
                    }
                }

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
                // Column order: Taux, Catégorie, Nom, Stock, Reference, Photo, Description, Euro (€), ...
                const loadedProducts: AdminProduct[] = [];
                if (productsData.values && productsData.values.length > 1) {
                    for (let i = 1; i < productsData.values.length; i++) {
                        const [, category, name, stock, reference, photo, description, ...prices] =
                            productsData.values[i];
                        loadedProducts.push({
                            name: String(name),
                            category: String(category),
                            stock: Number(stock),
                            reference: reference ? String(reference) : undefined,
                            photo: photo ? String(photo) : undefined,
                            description: description ? String(description) : undefined,
                            options: productsData.options?.[i - 1] ? String(productsData.options[i - 1]) : undefined,
                            currencies: prices.map(String),
                        });
                    }
                }

                setCategories(loadedCategories);
                setProducts(loadedProducts);
                setOriginalCategories(loadedCategories);
                setOriginalProducts(loadedProducts);
            } catch (error) {
                console.error('Error fetching menu data:', error);
                openFullscreenPopup('Erreur lors du chargement des données', ['OK']);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [dbConfigChecked, isReadOnly, inventory, currencies, openFullscreenPopup]);

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
        setIsSavingProducts(true);
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

            setProducts(data);
            setOriginalProducts(data);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des produits.", ['OK']);
        } finally {
            setIsSavingProducts(false);
        }
    };

    const handleCategoriesSave = async (data: Category[]) => {
        setIsSavingCategories(true);
        try {
            // Save categories to database via API (data includes _originalLabel from CategoriesConfig)
            const response = await fetch('/api/sql/updateCategories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories: data, originalCategories }),
            });

            if (!response.ok) {
                throw new Error('Failed to save categories');
            }

            // Strip _originalLabel before updating local state
            const cleanData = data.map(({ _originalLabel, ...rest }: Category & { _originalLabel?: string }) => rest);
            setCategories(cleanData);
            setOriginalCategories(cleanData);
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            openFullscreenPopup("Erreur lors de l'enregistrement des catégories.", ['OK']);
        } finally {
            setIsSavingCategories(false);
        }
    };

    const hasProductsChanges = JSON.stringify(products) !== JSON.stringify(originalProducts);
    const hasCategoriesChanges = JSON.stringify(categories) !== JSON.stringify(originalCategories);
    const hasChanges = hasProductsChanges || hasCategoriesChanges;

    // Warn about unsaved changes when leaving page
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    const handleCancel = (type: 'products' | 'categories') => {
        if (type === 'products') {
            setProducts(originalProducts);
        } else {
            setCategories(originalCategories);
        }
    };

    const categoryOptions = categories.map((c) => ({ label: c.label, value: c.label }));

    // Redirect if using Digicarte
    if (USE_DIGICARTE) return null;

    if (isLoading) {
        return (
            <AdminPageLayout title="Édition des produits" hasChanges={false}>
                <LoadingDot fullscreen />
            </AdminPageLayout>
        );
    }

    // Check access - admin and cashier only
    if (!isCashier) {
        return (
            <AdminPageLayout title="Édition des produits" hasChanges={false}>
                <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                    <p className="text-red-800 dark:text-red-200">
                        <strong>Accès refusé :</strong> Cette page est réservée aux administrateurs et caissiers.
                    </p>
                </div>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Édition des produits" hasChanges={hasChanges}>
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
                    onCancel={() => handleCancel('categories')}
                    hasChanges={hasCategoriesChanges}
                    isReadOnly={isReadOnly}
                    isLoading={isSavingCategories}
                    isOpen={openSection === 'categories'}
                    onToggle={() => setOpenSection((prev) => (prev === 'categories' ? null : 'categories'))}
                />

                <ProductsConfig
                    config={products}
                    onChange={handleProductsChange}
                    onSave={isReadOnly ? undefined : handleProductsSave}
                    onCancel={() => handleCancel('products')}
                    hasChanges={hasProductsChanges}
                    categories={categoryOptions}
                    currencies={currencies}
                    isReadOnly={isReadOnly}
                    isLoading={isSavingProducts}
                    isOpen={openSection === 'products'}
                    onToggle={() => setOpenSection((prev) => (prev === 'products' ? null : 'products'))}
                    productsSettings={productsSettings}
                />
            </div>
        </AdminPageLayout>
    );
}
