'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
    const [originalProducts, setOriginalProducts] = useState<AdminProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);
    const [isSavingProducts, setIsSavingProducts] = useState(false);
    const [productsSettings, setProductsSettings] = useState<ProductsSettings | undefined>(parameters?.products);
    const [openSection, setOpenSection] = useState<string | null>(null);

    // Derive categories from products — categories are local-only, not stored in DB
    // If all products in a category have the same VAT, use it; otherwise null (divers)
    const categories = useMemo(() => {
        const catVats = new Map<string, Set<number>>();
        for (const p of products) {
            const cat = p.category || '';
            if (!cat) continue;
            if (!catVats.has(cat)) catVats.set(cat, new Set());
            catVats.get(cat)!.add(p.vat ?? 20);
        }
        const result: Category[] = [];
        for (const [label, vats] of catVats) {
            result.push({ label, vat: vats.size === 1 ? [...vats][0] : null });
        }
        return result;
    }, [products]);

    const categoryOptions = useMemo(() => categories.map((c) => ({ label: c.label, value: c.label })), [categories]);

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

                        inventory.forEach((item) => {
                            item.products.forEach((product) => {
                                allProducts.push({
                                    name: product.label,
                                    category: item.category,
                                    stock: product.stock ?? null,
                                    currencies: product.prices.map(String),
                                    vat: item.rate >= 1 ? item.rate : item.rate * 100,
                                });
                            });
                        });

                        setProducts(allProducts);
                        setOriginalProducts(allProducts);
                        setIsLoading(false);
                    }
                    // else: wait for inventory/currencies to load (dep array will re-run)
                    return;
                }

                // Fetch products and parameters in parallel
                const [productsResponse, parametersResponse] = await Promise.all([
                    fetch('/api/sql/getAllArticles'),
                    fetch('/api/sql/getParameters'),
                ]);
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

                // Parse products (skip header row)
                // Column order: Taux, Catégorie, Nom, Stock, Reference, Photo, Description, Euro (€), ...
                const loadedProducts: AdminProduct[] = [];
                if (productsData.values && productsData.values.length > 1) {
                    for (let i = 1; i < productsData.values.length; i++) {
                        const [vat, category, name, stock, reference, photo, description, ...prices] =
                            productsData.values[i];
                        loadedProducts.push({
                            name: String(name),
                            category: String(category),
                            stock: stock === null || stock === undefined ? null : Number(stock),
                            vat: vat != null ? Number(vat) * 100 : undefined,
                            reference: reference ? String(reference) : undefined,
                            photo: photo ? String(photo) : undefined,
                            description: description ? String(description) : undefined,
                            options: productsData.options?.[i - 1] ? String(productsData.options[i - 1]) : undefined,
                            currencies: prices.map(String),
                        });
                    }
                }

                setProducts(loadedProducts);
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

    const handleProductsChange = useCallback(
        (data: AdminProduct[]) => {
            if (!isReadOnly) {
                setProducts(data);
            }
        },
        [isReadOnly]
    );

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

    // Category rename: update all products with the old category name
    const handleCategoryRename = useCallback((oldLabel: string, newLabel: string) => {
        setProducts((prev) => prev.map((p) => (p.category === oldLabel ? { ...p, category: newLabel } : p)));
    }, []);

    // Category delete: either remove products or move them to empty category
    const handleDeleteCategoryProducts = useCallback((categoryLabel: string, moveToEmpty: boolean) => {
        if (moveToEmpty) {
            setProducts((prev) => prev.map((p) => (p.category === categoryLabel ? { ...p, category: '' } : p)));
        } else {
            setProducts((prev) => prev.filter((p) => p.category !== categoryLabel));
        }
    }, []);

    // Category VAT change: apply new VAT to all products in the category
    const handleCategoryVatChange = useCallback((categoryLabel: string, vat: number) => {
        setProducts((prev) => prev.map((p) => (p.category === categoryLabel ? { ...p, vat } : p)));
    }, []);

    const hasProductsChanges = JSON.stringify(products) !== JSON.stringify(originalProducts);
    const hasChanges = hasProductsChanges;

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

    const handleCancel = () => {
        setProducts(originalProducts);
    };

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
                    isReadOnly={isReadOnly}
                    isOpen={openSection === 'categories'}
                    onToggle={() => setOpenSection((prev) => (prev === 'categories' ? null : 'categories'))}
                    productCategories={products
                        .filter((p) => p.category)
                        .map((p) => ({ category: p.category, available: p.stock !== 0 }))}
                    onDeleteCategoryProducts={handleDeleteCategoryProducts}
                    onRenameCategory={handleCategoryRename}
                    onCategoryVatChange={handleCategoryVatChange}
                />

                <ProductsConfig
                    config={products}
                    onChange={handleProductsChange}
                    onSave={isReadOnly ? undefined : handleProductsSave}
                    onCancel={handleCancel}
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
