'use client';

import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import CategoriesConfig from '@/app/components/admin/sections/CategoriesConfig';
import OptionsConfig, { ProductOptionGroup } from '@/app/components/admin/sections/OptionsConfig';
import ProductsConfig, { AdminProduct } from '@/app/components/admin/sections/ProductsConfig';
import { ProductsSettings } from '@/app/contexts/ConfigProvider';
import { useConfig } from '@/app/hooks/useConfig';
import { usePopup } from '@/app/hooks/usePopup';
import { useUserRole } from '@/app/hooks/useUserRole';
import { LoadingDot } from '@/app/loading';
import { CONFIG_KEYWORD, USE_DIGICARTE } from '@/app/utils/constants';
import { Category } from '@/app/utils/interfaces';
import { clearLoadDataCache } from '@/app/utils/processData';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    const [options, setOptions] = useState<ProductOptionGroup[]>([]);
    const [originalOptions, setOriginalOptions] = useState<ProductOptionGroup[]>([]);
    const [hasOptionsChanges, setHasOptionsChanges] = useState(false);
    const dataLoadedRef = useRef(false);

    // Derive categories from products — categories are local-only, not stored in DB
    // If all products in a category have the same VAT, use it; otherwise null (divers)
    // Products with empty category appear as 'Sans catégorie'
    const categories = useMemo(() => {
        const catVats = new Map<string, Set<number>>();
        for (const p of products) {
            const cat = p.category || 'Sans catégorie';
            if (!catVats.has(cat)) catVats.set(cat, new Set());
            catVats.get(cat)!.add(p.vat ?? 20);
        }
        const result: Category[] = [];
        for (const [label, vats] of catVats) {
            result.push({ label, vat: vats.size === 1 ? [...vats][0] : null });
        }
        return result;
    }, [products]);

    const [localCategoryLabels, setLocalCategoryLabels] = useState<string[]>([]);
    const categoryOptions = useMemo(() => {
        const base = categories.map((c) => c.label);
        const extras = localCategoryLabels.filter((l) => l && !base.includes(l));
        return [...base, ...extras].map((l) => ({ label: l, value: l }));
    }, [categories, localCategoryLabels]);

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
            if (dataLoadedRef.current) return;
            dataLoadedRef.current = true;
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

                // Initialize options from products
                const loadedOptions: ProductOptionGroup[] = [];
                loadedProducts.forEach((p) => {
                    if (p.options) {
                        try {
                            const parsed = JSON.parse(p.options);
                            // Check if it's in the ProductOptionGroup format
                            if (parsed.type && Array.isArray(parsed.options)) {
                                loadedOptions.push({
                                    category: p.category || 'Sans catégorie',
                                    product: p.name,
                                    type: parsed.type,
                                    options: parsed.options,
                                });
                            }
                        } catch {
                            // Ignore invalid options
                        }
                    }
                });
                setOptions(loadedOptions);
                setOriginalOptions(loadedOptions);
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

    const handleProductsSave = useCallback(
        async (data: AdminProduct[], category?: string) => {
            setIsSavingProducts(true);
            try {
                const response = await fetch('/api/sql/updateArticles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ products: data, category }),
                });

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error || 'Failed to save products');
                }

                setProducts(data);
                setOriginalProducts(data);
                localStorage.removeItem(CONFIG_KEYWORD);
                clearLoadDataCache();
            } catch (error) {
                console.error("Erreur lors de l'enregistrement:", error);
                const msg = error instanceof Error ? error.message : "Erreur lors de l'enregistrement des produits.";
                openFullscreenPopup(`${msg}\nVoulez-vous réessayer ?`, ['Réessayer', 'Annuler'], (index) => {
                    if (index === 0) handleProductsSave(data, category);
                });
            } finally {
                setIsSavingProducts(false);
            }
        },
        [openFullscreenPopup]
    );

    // Category rename: update all products with the old category name and save to DB
    // 'Sans catégorie' maps to products with category === ''
    const handleCategoryRename = useCallback(
        (oldLabel: string, newLabel: string) => {
            const oldKey = oldLabel === 'Sans catégorie' ? '' : oldLabel.trim();
            const trimmedNewLabel = newLabel.trim();
            setProducts((prev) => {
                const updated = prev.map((p) =>
                    (p.category || '').trim() === oldKey ? { ...p, category: trimmedNewLabel } : p
                );
                setTimeout(() => handleProductsSave(updated, trimmedNewLabel), 0);
                return updated;
            });
        },
        [handleProductsSave]
    );

    // Category delete: either remove products or move them to empty category, then save
    const handleDeleteCategoryProducts = useCallback(
        (categoryLabel: string, moveToEmpty: boolean) => {
            const key = categoryLabel === 'Sans catégorie' ? '' : categoryLabel.trim();
            if (moveToEmpty) {
                setProducts((prev) => {
                    const updated = prev.map((p) => ((p.category || '').trim() === key ? { ...p, category: '' } : p));
                    setTimeout(() => handleProductsSave(updated, ''), 0);
                    return updated;
                });
            } else {
                setProducts((prev) => {
                    const updated = prev.filter((p) => (p.category || '').trim() !== key);
                    setTimeout(() => handleProductsSave(updated), 0);
                    return updated;
                });
            }
        },
        [handleProductsSave]
    );

    // Category VAT change: apply new VAT to all products in the category and save to DB
    const handleCategoryVatChange = useCallback(
        (categoryLabel: string, vat: number) => {
            const key = categoryLabel === 'Sans catégorie' ? '' : categoryLabel.trim();
            setProducts((prev) => {
                const updated = prev.map((p) => ((p.category || '').trim() === key ? { ...p, vat } : p));
                setTimeout(() => handleProductsSave(updated, categoryLabel), 0);
                return updated;
            });
        },
        [handleProductsSave]
    );

    // Category reorder: reorder all products so they follow the new category order, then save
    const handleCategoryReorder = useCallback(
        (orderedLabels: string[]) => {
            setProducts((prev) => {
                const labelToKey = (l: string) => (l === 'Sans catégorie' ? '' : l);
                const sorted = [
                    ...orderedLabels.flatMap((label) => prev.filter((p) => p.category === labelToKey(label))),
                    ...prev.filter((p) => !orderedLabels.map(labelToKey).includes(p.category)),
                ];
                // Schedule save after state settles
                setTimeout(() => handleProductsSave(sorted), 0);
                return sorted;
            });
        },
        [handleProductsSave]
    );

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
                    productCategories={products.map((p) => ({
                        category: p.category || 'Sans catégorie',
                        available: p.stock !== 0,
                    }))}
                    onDeleteCategoryProducts={handleDeleteCategoryProducts}
                    onRenameCategory={handleCategoryRename}
                    onCategoryVatChange={handleCategoryVatChange}
                    onReorderCategories={isReadOnly ? undefined : handleCategoryReorder}
                    onLocalCategoriesChange={setLocalCategoryLabels}
                />

                {/* Options Configuration Section - only visible when useOptions is enabled and there are categories */}
                {productsSettings?.useOptions && categories.length > 0 && (
                    <OptionsConfig
                        config={options}
                        categories={categories.map((c) => ({ label: c.label, value: c.label }))}
                        products={products.map((p) => ({ name: p.name, category: p.category }))}
                        currencies={currencies}
                        onChange={(newOptions) => {
                            setOptions(newOptions);
                            setHasOptionsChanges(JSON.stringify(newOptions) !== JSON.stringify(originalOptions));
                        }}
                        onSave={async (newOptions) => {
                            // Map options to products
                            const updatedProducts = products.map((p) => {
                                const optionGroup = newOptions.find(
                                    (o) => o.category === (p.category || 'Sans catégorie') && o.product === p.name
                                );
                                return {
                                    ...p,
                                    options: optionGroup
                                        ? JSON.stringify({ type: optionGroup.type, options: optionGroup.options })
                                        : '',
                                };
                            });
                            await handleProductsSave(updatedProducts);
                            setOriginalOptions(newOptions);
                            setHasOptionsChanges(false);
                        }}
                        onCancel={() => {
                            setOptions(originalOptions);
                            setHasOptionsChanges(false);
                        }}
                        hasChanges={hasOptionsChanges}
                        isReadOnly={isReadOnly}
                        isLoading={isSavingProducts}
                        isOpen={openSection === 'options'}
                        onToggle={() => setOpenSection((prev) => (prev === 'options' ? null : 'options'))}
                    />
                )}

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
